"""HTTP translation only."""
from typing import Annotated
from uuid import NAMESPACE_URL, uuid5

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.models.server import DeletionResult, Node, Server, ServerCreate, ServerPod, ServerSettings
from app.services.servers import InvalidOperation, ServerNotFound, ServerService

router = APIRouter()


def _actor(request: Request) -> tuple[str, str]:
    """JWT에서 (actor_id, actor_name) 추출. 실패 시 ('?', '?') 반환."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return "?", "?"
    svc = getattr(request.app.state, "auth_service", None)
    if svc is None:
        return "?", "?"
    try:
        payload = svc.verify_token(auth.removeprefix("Bearer "))
        return str(payload["sub"]), str(payload["username"])
    except Exception:
        return "?", "?"


def _audit(
    request: Request, actor_id: str, actor_name: str,
    action: str, target_id: str, target_name: str,
    result: str = "ok", detail: str = "",
) -> None:
    """감사 로그를 SQLite에 기록. 실패해도 주 동작에 영향 없음."""
    try:
        from uuid import uuid4
        from datetime import datetime, timezone
        repo = request.app.state.server_service.repository
        repo.save_audit_log({
            "id": str(uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actor_id": actor_id,
            "actor_name": actor_name,
            "action": action,
            "target_id": target_id,
            "target_name": target_name,
            "result": result,
            "detail": detail,
        })
    except Exception:
        pass


def current_owner(request: Request, authorization: str = Header(default="")) -> str:
    mode: str = getattr(request.app.state, "mode", "mock")
    if mode == "mock":
        return "demo-user"
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    token = authorization.removeprefix("Bearer ")
    auth_svc = request.app.state.auth_service
    try:
        payload = auth_svc.verify_token(token)
        return str(payload["sub"])
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


def service(request: Request) -> ServerService:
    result: ServerService = request.app.state.server_service
    return result


Owner = Annotated[str, Depends(current_owner)]
Service = Annotated[ServerService, Depends(service)]


@router.get("/health")
def health(request: Request) -> dict[str, str]:
    mode: str = getattr(request.app.state, "mode", "mock")
    return {"status": "ok", "mode": mode, "authentication": "demo"}


@router.get("/api/v1/nodes", response_model=list[Node])
def nodes(svc: Service) -> list[Node]:
    return svc.adapter.nodes()


@router.get("/api/v1/topology/pods", response_model=list[ServerPod])
def topology_pods(owner: Owner, svc: Service) -> list[ServerPod]:
    pods: list[ServerPod] = []
    for server in svc.repository.list_by_owner(owner):
        pods.extend(svc.adapter.list_server_pods(server))
    return sorted(pods, key=lambda pod: (pod.node_id or "", pod.namespace, pod.name))


@router.get("/api/v1/servers", response_model=list[Server])
def servers(owner: Owner, svc: Service) -> list[Server]:
    return svc.list(owner)


@router.post("/api/v1/servers", response_model=Server, status_code=201)
def create(payload: ServerCreate, owner: Owner, svc: Service, request: Request) -> Server:
    try:
        server = svc.create(owner, payload)
        actor_id, actor_name = _actor(request)
        _audit(request, actor_id, actor_name, "server.create", server.id, server.name)
        return server
    except InvalidOperation as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/api/v1/servers/{server_id}", response_model=Server)
def detail(server_id: str, owner: Owner, svc: Service) -> Server:
    return svc.get(owner, server_id)


@router.post("/api/v1/servers/{server_id}/start", response_model=Server)
def start(server_id: str, owner: Owner, svc: Service, request: Request) -> Server:
    server = svc.set_state(owner, server_id, "running")
    actor_id, actor_name = _actor(request)
    _audit(request, actor_id, actor_name, "server.start", server_id, server.name)
    return server


@router.post("/api/v1/servers/{server_id}/stop", response_model=Server)
def stop(server_id: str, owner: Owner, svc: Service, request: Request) -> Server:
    server = svc.set_state(owner, server_id, "stopped")
    actor_id, actor_name = _actor(request)
    _audit(request, actor_id, actor_name, "server.stop", server_id, server.name)
    return server


@router.post("/api/v1/servers/{server_id}/console")
def console(server_id: str, owner: Owner, svc: Service, payload: dict[str, str]) -> dict[str, str]:
    try:
        result = svc.execute(owner, server_id, payload.get("command", ""))
        return {"output": result}
    except ServerNotFound:
        raise HTTPException(status_code=404, detail="Server not found")
    except InvalidOperation as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/api/v1/servers/{server_id}/settings")
def get_settings(server_id: str, owner: Owner, svc: Service) -> dict[str, str]:
    try:
        return svc.get_settings(owner, server_id)
    except ServerNotFound:
        raise HTTPException(status_code=404, detail="Server not found")


@router.put("/api/v1/servers/{server_id}/settings", status_code=204)
def update_settings(server_id: str, payload: ServerSettings, owner: Owner, svc: Service) -> None:
    try:
        svc.update_settings(owner, server_id, payload)
    except ServerNotFound:
        raise HTTPException(status_code=404, detail="Server not found")


@router.get("/api/v1/servers/{server_id}/logs")
def server_logs(server_id: str, owner: Owner, svc: Service, tail: int = 100) -> dict[str, list[str]]:
    server = svc.get(owner, server_id)
    lines = svc.adapter.logs(server_id, server.resource_plan.namespace, tail)
    return {"lines": lines}


@router.get("/api/v1/retained", response_model=list[Server])
def retained(owner: Owner, svc: Service) -> list[Server]:
    return svc.repository.retained_for(owner)


@router.post("/api/v1/retained/{server_id}/restore", response_model=Server)
def restore(server_id: str, owner: Owner, svc: Service) -> Server:
    try:
        return svc.restore(owner, server_id)
    except ServerNotFound:
        raise HTTPException(status_code=404, detail="Retained server not found")


@router.get("/api/v1/retained/{server_id}/pvcs")
def retained_pvcs(server_id: str, owner: Owner, svc: Service) -> dict[str, list[str]]:
    retained = svc.repository.retained_for(owner)
    server = next((s for s in retained if s.id == server_id), None)
    if server is None:
        raise HTTPException(status_code=404, detail="Retained server not found")
    return {"pvcs": svc.adapter.list_pvcs(server.resource_plan.namespace)}


@router.delete("/api/v1/servers/{server_id}", response_model=DeletionResult)
def delete(
    server_id: str,
    owner: Owner,
    svc: Service,
    request: Request,
    delete_data: bool = False,
    confirmation: str | None = None,
) -> DeletionResult:
    # 삭제 전에 이름 기록
    server = svc.repository.get(server_id)
    server_name = server.name if server else server_id
    result = svc.delete(owner, server_id, delete_data, confirmation)
    actor_id, actor_name = _actor(request)
    _audit(request, actor_id, actor_name, "server.delete", server_id, server_name,
           detail=f"delete_data={delete_data}")
    return result


@router.get("/api/v1/tenant")
def tenant_info(owner: Owner, svc: Service) -> dict[str, object]:
    namespace = f"tenant-{uuid5(NAMESPACE_URL, owner).hex}"
    quota = svc.adapter.get_tenant_quota(namespace)
    return {"namespace": namespace, "quota": quota}
