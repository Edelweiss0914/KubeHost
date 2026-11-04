"""HTTP translation only."""
import asyncio
from typing import Annotated
from uuid import NAMESPACE_URL, uuid5

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect

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
        if payload.game_type == "AUTO_CURSEFORGE":
            auth_svc = request.app.state.auth_service
            user = auth_svc.repository.get_user_by_id(owner)
            if not user or not user.cf_api_key:
                raise InvalidOperation("CurseForge 모드팩을 사용하려면 설정에서 CurseForge API 키를 먼저 등록하세요.")
            payload = payload.model_copy(update={"cf_api_key": user.cf_api_key})
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


from uuid import uuid4 as _uuid4
from pydantic import BaseModel as _BaseModel


class ScheduleIn(_BaseModel):
    days: list[int] = []  # 0=월~6=일, 빈 배열=매일
    start_time: str | None = None  # "HH:MM"
    stop_time: str | None = None
    enabled: bool = True
    timezone: str = "Asia/Seoul"


@router.get("/api/v1/servers/{server_id}/schedules")
def list_schedules(server_id: str, owner: Owner, svc: Service) -> list[dict]:
    server = svc.repository.get(server_id)
    if server is None or server.owner_id != owner:
        raise HTTPException(status_code=404, detail="서버를 찾을 수 없습니다.")
    return svc.repository.list_schedules(server_id)


@router.post("/api/v1/servers/{server_id}/schedules", status_code=201)
def create_schedule(server_id: str, payload: ScheduleIn, owner: Owner, svc: Service) -> dict:
    server = svc.repository.get(server_id)
    if server is None or server.owner_id != owner:
        raise HTTPException(status_code=404, detail="서버를 찾을 수 없습니다.")
    schedule = {
        "id": str(_uuid4()),
        "server_id": server_id,
        "days": payload.days,
        "start_time": payload.start_time,
        "stop_time": payload.stop_time,
        "enabled": payload.enabled,
        "timezone": payload.timezone,
    }
    svc.repository.save_schedule(schedule)
    return schedule


@router.put("/api/v1/servers/{server_id}/schedules/{schedule_id}", status_code=200)
def update_schedule(server_id: str, schedule_id: str, payload: ScheduleIn, owner: Owner, svc: Service) -> dict:
    server = svc.repository.get(server_id)
    if server is None or server.owner_id != owner:
        raise HTTPException(status_code=404, detail="서버를 찾을 수 없습니다.")
    schedule = {
        "id": schedule_id,
        "server_id": server_id,
        "days": payload.days,
        "start_time": payload.start_time,
        "stop_time": payload.stop_time,
        "enabled": payload.enabled,
        "timezone": payload.timezone,
    }
    svc.repository.save_schedule(schedule)
    return schedule


@router.delete("/api/v1/servers/{server_id}/schedules/{schedule_id}", status_code=204)
def delete_schedule(server_id: str, schedule_id: str, owner: Owner, svc: Service) -> None:
    server = svc.repository.get(server_id)
    if server is None or server.owner_id != owner:
        raise HTTPException(status_code=404, detail="서버를 찾을 수 없습니다.")
    svc.repository.delete_schedule(schedule_id)


# ── Player list ──────────────────────────────────────────────────────────────

import re as _re


def _parse_player_list(output: str) -> dict:
    """Parse Minecraft RCON /list output into structured data."""
    m = _re.search(r"There are (\d+) of a max of (\d+) players online:(.*)", output)
    if m:
        names_raw = m.group(3).strip()
        names = [n.strip() for n in names_raw.split(",") if n.strip()]
        return {"count": int(m.group(1)), "max": int(m.group(2)), "names": names}
    return {"count": 0, "max": 0, "names": []}


@router.get("/api/v1/servers/{server_id}/players")
def server_players(server_id: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    if server.status != "running":
        return {"count": 0, "max": 0, "names": []}
    try:
        output = svc.adapter.rcon(server_id, server.resource_plan.namespace, "list")
        return _parse_player_list(output)
    except Exception:
        return {"count": 0, "max": 0, "names": []}


# ── Whitelist & OP management ────────────────────────────────────────────────

def _parse_name_list(output: str) -> list[str]:
    """Parse comma-separated names from RCON list-style responses."""
    for marker in ("players:", "whitelisted players:", "operators:"):
        idx = output.lower().find(marker)
        if idx != -1:
            raw = output[idx + len(marker):].strip()
            return [n.strip() for n in raw.split(",") if n.strip()]
    return []


@router.get("/api/v1/servers/{server_id}/whitelist")
def get_whitelist(server_id: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    if server.status != "running":
        return {"enabled": False, "names": []}
    try:
        out = svc.adapter.rcon(server_id, server.resource_plan.namespace, "whitelist list")
        return {"enabled": True, "names": _parse_name_list(out)}
    except Exception:
        return {"enabled": False, "names": []}


class _NameBody(_BaseModel):
    name: str


@router.post("/api/v1/servers/{server_id}/whitelist")
def add_whitelist(server_id: str, body: _NameBody, owner: Owner, svc: Service) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="플레이어 이름이 필요합니다.")
    server = svc.get(owner, server_id)
    out = svc.adapter.rcon(server_id, server.resource_plan.namespace, f"whitelist add {name}")
    return {"output": out}


@router.delete("/api/v1/servers/{server_id}/whitelist/{name}")
def remove_whitelist(server_id: str, name: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    out = svc.adapter.rcon(server_id, server.resource_plan.namespace, f"whitelist remove {name}")
    return {"output": out}


@router.get("/api/v1/servers/{server_id}/ops")
def list_ops(server_id: str, owner: Owner, svc: Service) -> dict:
    svc.get(owner, server_id)  # ownership check
    names = svc.repository.list_ops(server_id)  # type: ignore[attr-defined]
    return {"names": names}


@router.post("/api/v1/servers/{server_id}/ops")
def add_op(server_id: str, body: _NameBody, owner: Owner, svc: Service) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="플레이어 이름이 필요합니다.")
    server = svc.get(owner, server_id)
    out = svc.adapter.rcon(server_id, server.resource_plan.namespace, f"op {name}")
    svc.repository.add_op(server_id, name)  # type: ignore[attr-defined]
    return {"output": out}


@router.delete("/api/v1/servers/{server_id}/ops/{name}")
def remove_op(server_id: str, name: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    out = svc.adapter.rcon(server_id, server.resource_plan.namespace, f"deop {name}")
    svc.repository.remove_op(server_id, name)  # type: ignore[attr-defined]
    return {"output": out}


# ── Game catalog ──────────────────────────────────────────────────────────────

@router.get("/api/v1/games")
def list_games(svc: Service) -> list[dict]:
    return svc.repository.list_games()  # type: ignore[attr-defined]


# ── WebSocket log streaming ───────────────────────────────────────────────────

def _diff_log_lines(prev: list[str], current: list[str]) -> list[str]:
    """Return lines in `current` that appear after the last line of `prev`."""
    if not current or current == prev:
        return []
    if not prev:
        return current
    last = prev[-1]
    for i in range(len(current) - 1, -1, -1):
        if current[i] == last:
            return current[i + 1:]
    return current[-50:]


@router.websocket("/api/v1/servers/{server_id}/logs/stream")
async def stream_logs(
    server_id: str,
    websocket: WebSocket,
    token: str = Query(default=""),
) -> None:
    mode: str = getattr(websocket.app.state, "mode", "mock")
    svc: ServerService = websocket.app.state.server_service

    await websocket.accept()

    # Auth (skip in mock mode)
    owner_id: str | None = None
    if mode != "mock":
        auth_svc = websocket.app.state.auth_service
        try:
            payload = auth_svc.verify_token(token)
            owner_id = str(payload["sub"])
        except Exception:
            await websocket.close(code=4001)
            return

    prev_lines: list[str] = []
    try:
        while True:
            server = svc.repository.get(server_id)
            if server is None or (owner_id is not None and server.owner_id != owner_id):
                await websocket.close(code=4004)
                return

            lines: list[str] = await asyncio.to_thread(
                svc.adapter.logs, server_id, server.resource_plan.namespace, 300
            )

            if not prev_lines:
                await websocket.send_json({"type": "init", "lines": lines})
                prev_lines = lines[:]
            else:
                new_lines = _diff_log_lines(prev_lines, lines)
                if new_lines:
                    await websocket.send_json({"type": "append", "lines": new_lines})
                    prev_lines = lines[:]

            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass


# ── JVM settings ──────────────────────────────────────────────────────────────

class _JvmBody(_BaseModel):
    memory_mb: int


@router.get("/api/v1/servers/{server_id}/jvm")
def get_jvm(server_id: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    mb = svc.adapter.get_jvm(server_id, server.resource_plan.namespace)
    return {"memory_mb": mb}


@router.put("/api/v1/servers/{server_id}/jvm", status_code=204)
def set_jvm(server_id: str, body: _JvmBody, owner: Owner, svc: Service) -> None:
    if body.memory_mb < 512 or body.memory_mb > 8192:
        raise HTTPException(status_code=422, detail="메모리는 512–8192 MiB 범위입니다.")
    server = svc.get(owner, server_id)
    svc.adapter.set_jvm(server_id, server.resource_plan.namespace, body.memory_mb)


# ── server.properties ─────────────────────────────────────────────────────────

class _PropertiesBody(_BaseModel):
    content: str


@router.get("/api/v1/servers/{server_id}/properties")
def get_properties(server_id: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    content = svc.adapter.get_raw_properties(server_id, server.resource_plan.namespace)
    return {"content": content}


@router.put("/api/v1/servers/{server_id}/properties", status_code=204)
def set_properties(server_id: str, body: _PropertiesBody, owner: Owner, svc: Service) -> None:
    server = svc.get(owner, server_id)
    svc.adapter.set_raw_properties(server_id, server.resource_plan.namespace, body.content)


# ── World backups ──────────────────────────────────────────────────────────────

@router.get("/api/v1/servers/{server_id}/backups")
def list_backups(server_id: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    backups = svc.adapter.list_backups(server_id, server.resource_plan.namespace)
    return {"backups": backups}


@router.post("/api/v1/servers/{server_id}/backups", status_code=201)
def create_backup(server_id: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    filename = svc.adapter.create_backup(server_id, server.resource_plan.namespace)
    return {"filename": filename}


@router.post("/api/v1/servers/{server_id}/backups/{filename}/restore", status_code=204)
def restore_backup(server_id: str, filename: str, owner: Owner, svc: Service) -> None:
    server = svc.get(owner, server_id)
    try:
        svc.adapter.restore_backup(server_id, server.resource_plan.namespace, filename)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.delete("/api/v1/servers/{server_id}/backups/{filename}", status_code=204)
def delete_backup(server_id: str, filename: str, owner: Owner, svc: Service) -> None:
    server = svc.get(owner, server_id)
    try:
        svc.adapter.delete_backup(server_id, server.resource_plan.namespace, filename)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── Plugin management ──────────────────────────────────────────────────────────

from fastapi import UploadFile, File as _File
from fastapi.responses import Response as _Response


# ── File Manager ──────────────────────────────────────────────────────────────

@router.get("/api/v1/servers/{server_id}/fs")
def list_files(server_id: str, owner: Owner, svc: Service, path: str = "/data") -> list[dict]:
    server = svc.get(owner, server_id)
    return svc.adapter.list_files(server_id, server.resource_plan.namespace, path)


@router.get("/api/v1/servers/{server_id}/fs/download")
def download_file(server_id: str, owner: Owner, svc: Service, path: str) -> _Response:
    server = svc.get(owner, server_id)
    try:
        content = svc.adapter.read_file(server_id, server.resource_plan.namespace, path)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    filename = path.rsplit("/", 1)[-1]
    return _Response(
        content=content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/v1/servers/{server_id}/fs/upload", status_code=201)
async def upload_file(
    server_id: str, owner: Owner, svc: Service,
    path: str = "/data",
    file: UploadFile = _File(...),
) -> dict:
    filename = (file.filename or "").strip()
    if not filename:
        raise HTTPException(status_code=422, detail="파일명이 없습니다.")
    dest = path.rstrip("/") + "/" + filename
    content = await file.read()
    server = svc.get(owner, server_id)
    import asyncio
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(
            None, svc.adapter.write_file,
            server_id, server.resource_plan.namespace, dest, content,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"path": dest, "name": filename, "size": len(content)}


@router.delete("/api/v1/servers/{server_id}/fs", status_code=204)
def delete_path(server_id: str, owner: Owner, svc: Service, path: str) -> None:
    server = svc.get(owner, server_id)
    try:
        svc.adapter.delete_path(server_id, server.resource_plan.namespace, path)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


class _MkdirBody(_BaseModel):
    path: str


@router.post("/api/v1/servers/{server_id}/fs/mkdir", status_code=201)
def make_dir(server_id: str, body: _MkdirBody, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    try:
        svc.adapter.mkdir(server_id, server.resource_plan.namespace, body.path)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"path": body.path}


# ── Version upgrade ───────────────────────────────────────────────────────────

_ALLOWED_VERSIONS = {"LATEST", "1.21.4", "1.21.1", "1.20.6", "1.20.4", "1.16.5", "1.14.4", "1.12.2"}


class _VersionBody(_BaseModel):
    version: str


@router.put("/api/v1/servers/{server_id}/version", status_code=204)
def set_version(server_id: str, body: _VersionBody, owner: Owner, svc: Service, request: Request) -> None:
    if body.version not in _ALLOWED_VERSIONS:
        raise HTTPException(status_code=422, detail="지원하지 않는 버전입니다.")
    server = svc.get(owner, server_id)
    svc.adapter.set_version(server_id, server.resource_plan.namespace, body.version)
    updated = server.model_copy(update={"version": body.version})
    svc.repository.save(updated)
    actor_id, actor_name = _actor(request)
    _audit(request, actor_id, actor_name, "server.version", server_id, server.name,
           detail=f"version={body.version}")
