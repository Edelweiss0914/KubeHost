"""HTTP translation only."""
import asyncio
from typing import Annotated
from uuid import NAMESPACE_URL, uuid5

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect

from app.models.server import (
    DeletionResult, GarrysModSettings, Node, Server, ServerCreate, ServerPod, ServerSettings,
    ValheimSettings,
)
from app.models.template import Template
from app.ports import TemplateRepository
from app.services.servers import InvalidOperation, ServerNotFound, ServerService
from app.services.file_paths import file_path, library_path

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
            user = auth_svc.get_user_by_id(owner)
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
    except InvalidOperation as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.put("/api/v1/servers/{server_id}/settings", status_code=204)
def update_settings(server_id: str, payload: ServerSettings, owner: Owner, svc: Service) -> None:
    try:
        svc.update_settings(owner, server_id, payload)
    except ServerNotFound:
        raise HTTPException(status_code=404, detail="Server not found")
    except InvalidOperation as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/api/v1/servers/{server_id}/game-settings")
def get_game_settings(server_id: str, owner: Owner, svc: Service) -> dict[str, str | bool]:
    try:
        return svc.get_game_settings(owner, server_id)
    except InvalidOperation as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.put("/api/v1/servers/{server_id}/game-settings", status_code=204)
def update_game_settings(
    server_id: str, payload: ValheimSettings | GarrysModSettings, owner: Owner, svc: Service,
) -> None:
    try:
        svc.update_game_settings(owner, server_id, payload)
    except InvalidOperation as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/api/v1/servers/{server_id}/logs")
def server_logs(server_id: str, owner: Owner, svc: Service, tail: int = 100) -> dict[str, list[str]]:
    server = svc.get(owner, server_id)
    lines = svc.adapter.logs(server_id, server.resource_plan.namespace, tail, sts_name=server.resource_plan.sts_name)
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
        output = svc.adapter.rcon(server_id, server.resource_plan.namespace, "list", sts_name=server.resource_plan.sts_name)
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
        out = svc.adapter.rcon(server_id, server.resource_plan.namespace, "whitelist list", sts_name=server.resource_plan.sts_name)
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
    out = svc.adapter.rcon(server_id, server.resource_plan.namespace, f"whitelist add {name}", sts_name=server.resource_plan.sts_name)
    return {"output": out}


@router.delete("/api/v1/servers/{server_id}/whitelist/{name}")
def remove_whitelist(server_id: str, name: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    out = svc.adapter.rcon(server_id, server.resource_plan.namespace, f"whitelist remove {name}", sts_name=server.resource_plan.sts_name)
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
    out = svc.adapter.rcon(server_id, server.resource_plan.namespace, f"op {name}", sts_name=server.resource_plan.sts_name)
    svc.repository.add_op(server_id, name)  # type: ignore[attr-defined]
    return {"output": out}


@router.delete("/api/v1/servers/{server_id}/ops/{name}")
def remove_op(server_id: str, name: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    out = svc.adapter.rcon(server_id, server.resource_plan.namespace, f"deop {name}", sts_name=server.resource_plan.sts_name)
    svc.repository.remove_op(server_id, name)  # type: ignore[attr-defined]
    return {"output": out}


@router.get("/api/v1/servers/{server_id}/bans")
def list_bans(server_id: str, owner: Owner, svc: Service) -> dict:
    svc.get(owner, server_id)  # ownership check
    names = svc.repository.list_bans(server_id)  # type: ignore[attr-defined]
    return {"names": names}


@router.post("/api/v1/servers/{server_id}/bans")
def ban_player(server_id: str, body: _NameBody, owner: Owner, svc: Service) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="플레이어 이름이 필요합니다.")
    server = svc.get(owner, server_id)
    out = svc.adapter.rcon(server_id, server.resource_plan.namespace, f"ban {name}", sts_name=server.resource_plan.sts_name)
    svc.repository.add_ban(server_id, name)  # type: ignore[attr-defined]
    return {"output": out}


@router.delete("/api/v1/servers/{server_id}/bans/{name}")
def unban_player(server_id: str, name: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    out = svc.adapter.rcon(server_id, server.resource_plan.namespace, f"pardon {name}", sts_name=server.resource_plan.sts_name)
    svc.repository.remove_ban(server_id, name)  # type: ignore[attr-defined]
    return {"output": out}


# ── Game catalog ──────────────────────────────────────────────────────────────

@router.get("/api/v1/games")
def list_games(svc: Service) -> list[dict]:
    return svc.repository.list_games()  # type: ignore[attr-defined]


@router.get("/api/v1/games/{slug}/definition")
def game_definition(slug: str) -> dict:
    from app.games.registry import get_game
    try:
        return get_game(slug).to_dict()
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


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
                svc.adapter.logs, server_id, server.resource_plan.namespace, 300,
                server.resource_plan.sts_name,
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
    mb = svc.adapter.get_jvm(server_id, server.resource_plan.namespace, sts_name=server.resource_plan.sts_name)
    return {"memory_mb": mb}


@router.put("/api/v1/servers/{server_id}/jvm", status_code=204)
def set_jvm(server_id: str, body: _JvmBody, owner: Owner, svc: Service) -> None:
    if body.memory_mb < 512 or body.memory_mb > 8192:
        raise HTTPException(status_code=422, detail="메모리는 512–8192 MiB 범위입니다.")
    server = svc.get(owner, server_id)
    svc.adapter.set_jvm(server_id, server.resource_plan.namespace, body.memory_mb, sts_name=server.resource_plan.sts_name)


# ── Auto-restart ──────────────────────────────────────────────────────────────

class _AutoRestartBody(_BaseModel):
    enabled: bool


@router.get("/api/v1/servers/{server_id}/auto-restart")
def get_auto_restart(server_id: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    enabled = svc.adapter.get_auto_restart(server_id, server.resource_plan.namespace, sts_name=server.resource_plan.sts_name)
    return {"enabled": enabled}


@router.put("/api/v1/servers/{server_id}/auto-restart", status_code=204)
def set_auto_restart(server_id: str, body: _AutoRestartBody, owner: Owner, svc: Service) -> None:
    server = svc.get(owner, server_id)
    svc.adapter.set_auto_restart(server_id, server.resource_plan.namespace, body.enabled, sts_name=server.resource_plan.sts_name)


# ── server.properties ─────────────────────────────────────────────────────────

class _PropertiesBody(_BaseModel):
    content: str


@router.get("/api/v1/servers/{server_id}/properties")
def get_properties(server_id: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    content = svc.adapter.get_raw_properties(server_id, server.resource_plan.namespace, sts_name=server.resource_plan.sts_name)
    return {"content": content}


@router.put("/api/v1/servers/{server_id}/properties", status_code=204)
def set_properties(server_id: str, body: _PropertiesBody, owner: Owner, svc: Service) -> None:
    server = svc.get(owner, server_id)
    svc.adapter.set_raw_properties(server_id, server.resource_plan.namespace, body.content, sts_name=server.resource_plan.sts_name)


# ── World backups ──────────────────────────────────────────────────────────────

@router.get("/api/v1/servers/{server_id}/backups")
def list_backups(server_id: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    backups = svc.adapter.list_backups(server_id, server.resource_plan.namespace, sts_name=server.resource_plan.sts_name)
    return {"backups": backups}


@router.post("/api/v1/servers/{server_id}/backups", status_code=201)
def create_backup(server_id: str, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    filename = svc.adapter.create_backup(server_id, server.resource_plan.namespace, sts_name=server.resource_plan.sts_name)
    return {"filename": filename}


@router.post("/api/v1/servers/{server_id}/backups/{filename}/restore", status_code=204)
def restore_backup(server_id: str, filename: str, owner: Owner, svc: Service) -> None:
    server = svc.get(owner, server_id)
    try:
        svc.adapter.restore_backup(server_id, server.resource_plan.namespace, filename, sts_name=server.resource_plan.sts_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.delete("/api/v1/servers/{server_id}/backups/{filename}", status_code=204)
def delete_backup(server_id: str, filename: str, owner: Owner, svc: Service) -> None:
    server = svc.get(owner, server_id)
    try:
        svc.adapter.delete_backup(server_id, server.resource_plan.namespace, filename, sts_name=server.resource_plan.sts_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── Plugin management ──────────────────────────────────────────────────────────

from fastapi import UploadFile, File as _File
from fastapi.responses import Response as _Response


# ── File Manager ──────────────────────────────────────────────────────────────

@router.get("/api/v1/servers/{server_id}/fs")
def list_files(server_id: str, owner: Owner, svc: Service, path: str | None = None) -> list[dict]:
    server = svc.get(owner, server_id)
    try:
        safe = file_path(server.game, path)
        return svc.adapter.list_files(server_id, server.resource_plan.namespace, safe,
                                      sts_name=server.resource_plan.sts_name, game=server.game)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/api/v1/servers/{server_id}/fs/download")
def download_file(server_id: str, owner: Owner, svc: Service, path: str) -> _Response:
    server = svc.get(owner, server_id)
    try:
        safe = file_path(server.game, path)
        content = svc.adapter.read_file(server_id, server.resource_plan.namespace, safe,
                                        sts_name=server.resource_plan.sts_name, game=server.game)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    filename = safe.rsplit("/", 1)[-1]
    return _Response(
        content=content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/v1/servers/{server_id}/fs/upload", status_code=201)
async def upload_file(
    server_id: str, owner: Owner, svc: Service,
    path: str | None = None,
    file: UploadFile = _File(...),
) -> dict:
    filename = (file.filename or "").strip()
    if not filename:
        raise HTTPException(status_code=422, detail="파일명이 없습니다.")
    server = svc.get(owner, server_id)
    if "/" in filename or "\\" in filename:
        raise HTTPException(status_code=422, detail="파일명에 경로 구분자를 사용할 수 없습니다.")
    try:
        dest = file_path(server.game, (path or file_path(server.game, None)).rstrip("/") + "/" + filename, write=True)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    content = await file.read()
    import asyncio
    loop = asyncio.get_event_loop()
    try:
        import functools as _functools
        await loop.run_in_executor(
            None, _functools.partial(
                svc.adapter.write_file,
                server_id, server.resource_plan.namespace, dest, content,
                sts_name=server.resource_plan.sts_name, game=server.game,
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"path": dest, "name": filename, "size": len(content)}


@router.delete("/api/v1/servers/{server_id}/fs", status_code=204)
def delete_path(server_id: str, owner: Owner, svc: Service, path: str) -> None:
    server = svc.get(owner, server_id)
    try:
        safe = file_path(server.game, path, write=True)
        svc.adapter.delete_path(server_id, server.resource_plan.namespace, safe,
                                sts_name=server.resource_plan.sts_name, game=server.game)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


class _MkdirBody(_BaseModel):
    path: str


class _ExtractBody(_BaseModel):
    path: str


@router.post("/api/v1/servers/{server_id}/fs/extract", status_code=200)
def extract_zip(server_id: str, body: _ExtractBody, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    try:
        safe = file_path(server.game, body.path)
        svc.adapter.extract(server_id, server.resource_plan.namespace, safe,
                            sts_name=server.resource_plan.sts_name, game=server.game)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"path": safe}


@router.post("/api/v1/servers/{server_id}/fs/mkdir", status_code=201)
def make_dir(server_id: str, body: _MkdirBody, owner: Owner, svc: Service) -> dict:
    server = svc.get(owner, server_id)
    try:
        safe = file_path(server.game, body.path, write=True)
        svc.adapter.mkdir(server_id, server.resource_plan.namespace, safe,
                          sts_name=server.resource_plan.sts_name, game=server.game)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"path": safe}


class _GithubCloneBody(_BaseModel):
    url: str
    branch: str = "main"
    path: str | None = None


def _parse_github_url(url: str) -> tuple[str, str, str]:
    """Return (owner, repo, branch) from various GitHub URL forms."""
    import re
    url = url.strip()
    # owner/repo shorthand
    if re.fullmatch(r"[^/]+/[^/]+", url):
        owner, repo = url.split("/", 1)
        return owner, repo, "main"
    # https://github.com/owner/repo[/tree/branch][.git]
    m = re.match(
        r"https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/tree/([^/]+))?/?$",
        url,
    )
    if not m:
        raise ValueError(f"GitHub URL을 파싱할 수 없습니다: {url!r}")
    owner, repo, branch = m.group(1), m.group(2), m.group(3) or "main"
    return owner, repo, branch


@router.post("/api/v1/servers/{server_id}/fs/github", status_code=200)
def fs_github_clone(server_id: str, body: _GithubCloneBody, owner: Owner, svc: Service) -> dict:
    import urllib.request
    server = svc.get(owner, server_id)
    try:
        gh_owner, gh_repo, branch = _parse_github_url(body.url)
        if body.branch and body.branch != "main":
            branch = body.branch
        from app.services.file_paths import file_path as _file_path
        safe_path = _file_path(server.game, body.path)
        # 백엔드에서 직접 다운로드 (게임 컨테이너에 curl 불필요)
        # main 실패 시 master 폴백 (사용자가 브랜치를 명시하지 않은 경우)
        from urllib.error import HTTPError
        branches_to_try = [branch] if body.branch != "main" else ["main", "master"]
        zip_data = None
        for b in branches_to_try:
            try:
                url = f"https://github.com/{gh_owner}/{gh_repo}/archive/refs/heads/{b}.zip"
                req = urllib.request.Request(url, headers={"User-Agent": "kubehost/1.0"})
                with urllib.request.urlopen(req, timeout=60) as resp:
                    zip_data = resp.read()
                branch = b
                break
            except HTTPError as e:
                if e.code == 404 and b != branches_to_try[-1]:
                    continue
                raise ValueError(f"레포지토리를 찾을 수 없습니다: {gh_owner}/{gh_repo} (브랜치: {b})")
        if zip_data is None:
            raise ValueError(f"레포지토리를 찾을 수 없습니다: {gh_owner}/{gh_repo}")
        zip_dest = safe_path.rstrip("/") + f"/{gh_repo}-{branch}.zip"
        ns = server.resource_plan.namespace
        sts = server.resource_plan.sts_name
        svc.adapter.write_file(server_id, ns, zip_dest, zip_data, sts_name=sts, game=server.game)
        svc.adapter.extract(server_id, ns, zip_dest, sts_name=sts, game=server.game)
        svc.adapter.delete_path(server_id, ns, zip_dest, sts_name=sts, game=server.game)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"owner": gh_owner, "repo": gh_repo, "branch": branch, "path": safe_path}


# ── Version upgrade ───────────────────────────────────────────────────────────

_ALLOWED_VERSIONS = {"LATEST", "1.21.4", "1.21.1", "1.20.6", "1.20.4", "1.16.5", "1.14.4", "1.12.2"}


class _VersionBody(_BaseModel):
    version: str


@router.put("/api/v1/servers/{server_id}/version", status_code=204)
def set_version(server_id: str, body: _VersionBody, owner: Owner, svc: Service, request: Request) -> None:
    if body.version not in _ALLOWED_VERSIONS:
        raise HTTPException(status_code=422, detail="지원하지 않는 버전입니다.")
    server = svc.get(owner, server_id)
    svc.adapter.set_version(server_id, server.resource_plan.namespace, body.version, sts_name=server.resource_plan.sts_name)
    updated = server.model_copy(update={"version": body.version})
    svc.repository.save(updated)
    actor_id, actor_name = _actor(request)
    _audit(request, actor_id, actor_name, "server.version", server_id, server.name,
           detail=f"version={body.version}")


# ── Library ───────────────────────────────────────────────────────────────────

def _lib_ns(owner: str) -> str:
    from uuid import NAMESPACE_URL, uuid5
    return f"library-{uuid5(NAMESPACE_URL, owner).hex}"


@router.get("/api/v1/library/fs")
def library_list(owner: Owner, svc: Service, path: str | None = None) -> list[dict]:
    try:
        safe = library_path(path)
        return svc.adapter.library_list_files(_lib_ns(owner), safe)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/api/v1/library/fs/download")
def library_download(owner: Owner, svc: Service, path: str) -> _Response:
    try:
        safe = library_path(path)
        content = svc.adapter.library_read_file(_lib_ns(owner), safe)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    filename = safe.rsplit("/", 1)[-1]
    return _Response(content=content, media_type="application/octet-stream",
                     headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/api/v1/library/fs/upload", status_code=201)
async def library_upload(
    owner: Owner, svc: Service, path: str | None = None,
    file: UploadFile = _File(...),
) -> dict:
    filename = (file.filename or "").strip()
    if not filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=422, detail="파일명이 올바르지 않습니다.")
    try:
        dest = library_path((path or "/library").rstrip("/") + "/" + filename, write=True)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    content = await file.read()
    import functools as _functools
    try:
        await asyncio.get_event_loop().run_in_executor(
            None, _functools.partial(svc.adapter.library_write_file, _lib_ns(owner), dest, content))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"path": dest, "name": filename, "size": len(content)}


@router.delete("/api/v1/library/fs", status_code=204)
def library_delete(owner: Owner, svc: Service, path: str) -> None:
    try:
        safe = library_path(path, write=True)
        svc.adapter.library_delete_path(_lib_ns(owner), safe)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/api/v1/library/fs/mkdir", status_code=201)
def library_mkdir_ep(body: _MkdirBody, owner: Owner, svc: Service) -> dict:
    try:
        safe = library_path(body.path, write=True)
        svc.adapter.library_mkdir(_lib_ns(owner), safe)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"path": safe}


@router.post("/api/v1/library/fs/extract", status_code=200)
def library_extract_ep(body: _ExtractBody, owner: Owner, svc: Service) -> dict:
    try:
        safe = library_path(body.path)
        svc.adapter.library_extract(_lib_ns(owner), safe)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"path": safe}


@router.get("/api/v1/library/storage")
def library_storage_ep(owner: Owner, svc: Service) -> dict:
    svc.adapter.library_ensure(_lib_ns(owner))
    return svc.adapter.library_storage(_lib_ns(owner))


# ── Server clone ──────────────────────────────────────────────────────────────

class _CloneBody(_BaseModel):
    name: str


def template_repo(request: Request) -> TemplateRepository:
    return request.app.state.template_repo  # type: ignore[no-any-return]


TemplateRepo = Annotated[TemplateRepository, Depends(template_repo)]


@router.post("/api/v1/servers/{server_id}/clone", status_code=201)
def clone_server(server_id: str, body: _CloneBody, owner: Owner, svc: Service, request: Request) -> dict:
    from app.models.server import ServerCreate
    # 원본 서버 조회 (owner 검증 포함)
    try:
        src = svc.get(owner, server_id)
    except Exception:
        raise HTTPException(status_code=404, detail="서버를 찾을 수 없습니다.")

    # 원본 서버 PVC 이름 계산 (k8s._pvc_name 로직과 동일)
    src_sts = src.resource_plan.sts_name or f"mc-{src.id.replace('-', '')}"
    src_pvc = f"data-{src_sts}-0"
    src_ns = src.resource_plan.namespace

    # 원본 설정으로 새 서버 생성
    clone_input = ServerCreate(
        name=body.name,
        game=src.game,  # type: ignore[arg-type]
        cpu=src.cpu,
        memory_mb=src.memory_mb,
        storage_gb=src.storage_gb,
        node_id=src.node_id,  # type: ignore[arg-type]
        version=src.version,  # type: ignore[arg-type]
        game_type=src.game_type,  # type: ignore[arg-type]
        server_password=src.server_password,
        world_name=src.world_name,
        server_public=src.server_public,
        map_name=src.map_name,
        gamemode_name=src.gamemode_name,
    )
    try:
        new_server = svc.create(owner, clone_input)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # 새 서버 PVC 이름 계산
    dst_sts = new_server.resource_plan.sts_name or f"mc-{new_server.id.replace('-', '')}"
    dst_pvc = f"data-{dst_sts}-0"
    dst_ns = new_server.resource_plan.namespace

    # 파일 복사
    try:
        svc.adapter.copy_pvc_files(src_ns, src_pvc, dst_ns, dst_pvc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"파일 복사 실패: {exc}")

    actor_id, actor_name = _actor(request)
    _audit(request, actor_id, actor_name, "server.clone", new_server.id, new_server.name,
           detail=f"cloned_from={server_id}")
    return {"id": new_server.id}


# ── Templates ─────────────────────────────────────────────────────────────────

class _SnapshotBody(_BaseModel):
    name: str


class _DeployBody(_BaseModel):
    name: str


@router.get("/api/v1/templates")
def list_templates(owner: Owner, repo: TemplateRepo) -> list[dict]:
    templates = repo.list_by_owner(owner)
    return [
        {
            "id": t.id,
            "name": t.name,
            "game": t.game,
            "cpu": t.cpu,
            "memory_mb": t.memory_mb,
            "storage_gb": t.storage_gb,
            "created_at": t.created_at,
        }
        for t in templates
    ]


@router.post("/api/v1/servers/{server_id}/snapshot", status_code=201)
def snapshot_server(
    server_id: str, body: _SnapshotBody, owner: Owner, svc: Service, repo: TemplateRepo,
    request: Request,
) -> dict:
    from datetime import datetime, timezone
    from uuid import uuid4
    try:
        src = svc.get(owner, server_id)
    except Exception:
        raise HTTPException(status_code=404, detail="서버를 찾을 수 없습니다.")

    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="템플릿 이름이 필요합니다.")

    lib_ns = _lib_ns(owner)
    template_id = str(uuid4())
    archive_path = f"/library/templates/{template_id}.tar.gz"

    try:
        svc.adapter.snapshot_pvc_to_library(
            server_id,
            src.resource_plan.namespace,
            lib_ns,
            archive_path,
            sts_name=src.resource_plan.sts_name,
            game=src.game,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"스냅샷 생성 실패: {exc}")

    template = Template(
        id=template_id,
        owner_id=owner,
        name=name,
        game=src.game,
        cpu=src.cpu,
        memory_mb=src.memory_mb,
        storage_gb=src.storage_gb,
        archive_path=archive_path,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    repo.save(template)

    actor_id, actor_name = _actor(request)
    _audit(request, actor_id, actor_name, "template.snapshot", template_id, name,
           detail=f"source_server={server_id}")
    return {"id": template_id}


@router.post("/api/v1/templates/{template_id}/deploy", status_code=201)
def deploy_template(
    template_id: str, body: _DeployBody, owner: Owner, svc: Service, repo: TemplateRepo,
    request: Request,
) -> dict:
    template = repo.get(template_id)
    if template is None or template.owner_id != owner:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다.")

    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="서버 이름이 필요합니다.")

    deploy_input = ServerCreate(
        name=name,
        game=template.game,  # type: ignore[arg-type]
        cpu=template.cpu,
        memory_mb=template.memory_mb,
        storage_gb=template.storage_gb,
    )
    try:
        new_server = svc.create(owner, deploy_input)
    except InvalidOperation as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    lib_ns = _lib_ns(owner)
    try:
        svc.adapter.restore_library_to_pvc(
            new_server.id,
            new_server.resource_plan.namespace,
            lib_ns,
            template.archive_path,
            sts_name=new_server.resource_plan.sts_name,
            game=new_server.game,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"템플릿 복원 실패: {exc}")

    actor_id, actor_name = _actor(request)
    _audit(request, actor_id, actor_name, "template.deploy", new_server.id, new_server.name,
           detail=f"template_id={template_id}")
    return {"id": new_server.id}


@router.delete("/api/v1/templates/{template_id}", status_code=204)
def delete_template(
    template_id: str, owner: Owner, svc: Service, repo: TemplateRepo,
) -> None:
    template = repo.get(template_id)
    if template is None or template.owner_id != owner:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다.")

    lib_ns = _lib_ns(owner)
    try:
        svc.adapter.library_delete_path(lib_ns, template.archive_path)
    except Exception:
        pass  # 파일이 없어도 메타데이터는 삭제

    repo.delete(template_id)
