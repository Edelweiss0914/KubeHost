"""Admin-only endpoints: user management, invite codes, tenant overview."""
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

admin_router = APIRouter(prefix="/api/v1/admin")


def _svc(request: Request):  # type: ignore[return]
    return request.app.state.auth_service


def _admin_audit(
    request: Request, actor_id: str, actor_name: str,
    action: str, target_id: str, target_name: str,
    result: str = "ok", detail: str = "",
) -> None:
    try:
        from uuid import uuid4
        from datetime import datetime, timezone
        repo = request.app.state.server_service.repository
        repo.save_audit_log({
            "id": str(uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actor_id": actor_id, "actor_name": actor_name,
            "action": action, "target_id": target_id,
            "target_name": target_name, "result": result, "detail": detail,
        })
    except Exception:
        pass


def require_admin(request: Request, authorization: str = Header(default="")) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    token = authorization.removeprefix("Bearer ")
    svc = _svc(request)
    try:
        payload = svc.verify_token(token)
        if not payload.get("is_admin"):
            raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
        return str(payload["sub"])
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


Admin = Annotated[str, Depends(require_admin)]


# ── Users ─────────────────────────────────────────────────────────────────────

@admin_router.get("/users")
def list_users(admin: Admin, request: Request) -> list[dict]:
    users = _svc(request).list_users()
    return [{"id": u.id, "username": u.username, "is_admin": u.is_admin,
             "created_at": u.created_at.isoformat()} for u in users]


@admin_router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: str, admin: Admin, request: Request) -> None:
    if user_id == admin:
        raise HTTPException(status_code=400, detail="자신의 계정은 삭제할 수 없습니다.")
    svc = _svc(request)
    user = svc._repo.get_user_by_id(user_id)
    username = user.username if user else user_id
    svc.delete_user(user_id)
    _admin_audit(request, admin, admin, "user.delete", user_id, username)


# ── Invite codes ──────────────────────────────────────────────────────────────

class InviteRequest(BaseModel):
    single_use: bool = True
    expires_at: datetime | None = None


class UserQuotaRequest(BaseModel):
    max_cpu: float
    max_memory_mb: int
    max_storage_gb: int
    max_servers: int


@admin_router.get("/invite-codes")
def list_invites(admin: Admin, request: Request) -> list[dict]:
    codes = _svc(request).list_invite_codes()
    return [{
        "id": c.id, "code": c.code, "single_use": c.single_use,
        "created_at": c.created_at.isoformat(),
        "expires_at": c.expires_at.isoformat() if c.expires_at else None,
        "used_by": c.used_by,
        "used_at": c.used_at.isoformat() if c.used_at else None,
        "is_valid": c.is_valid,
    } for c in codes]


@admin_router.post("/invite-codes", status_code=201)
def create_invite(payload: InviteRequest, admin: Admin, request: Request) -> dict:
    invite = _svc(request).generate_invite_code(
        created_by=admin,
        single_use=payload.single_use,
        expires_at=payload.expires_at,
    )
    _admin_audit(request, admin, admin, "invite.create", invite.id, invite.code)
    return {"id": invite.id, "code": invite.code}


@admin_router.delete("/invite-codes/{invite_id}", status_code=204)
def revoke_invite(invite_id: str, admin: Admin, request: Request) -> None:
    _svc(request).revoke_invite_code(invite_id)
    _admin_audit(request, admin, admin, "invite.revoke", invite_id, invite_id)


# ── Tenant overview ───────────────────────────────────────────────────────────

@admin_router.get("/overview")
def overview(admin: Admin, request: Request) -> list[dict]:
    svc = _svc(request)
    server_svc = request.app.state.server_service
    users = svc.list_users()
    result = []
    for user in users:
        from uuid import NAMESPACE_URL, uuid5
        namespace = f"tenant-{uuid5(NAMESPACE_URL, user.id).hex}"
        servers = server_svc.repository.list_by_owner(user.id)
        quota = server_svc.adapter.get_tenant_quota(namespace)
        result.append({
            "user_id": user.id,
            "username": user.username,
            "is_admin": user.is_admin,
            "namespace": namespace,
            "server_count": len(servers),
            "quota": quota,
        })
    return result


# ── Audit logs ────────────────────────────────────────────────────────────────

@admin_router.get("/audit-logs")
def audit_logs(
    admin: Admin,
    request: Request,
    actor_id: str | None = None,
    action: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    repo = request.app.state.server_service.repository
    return repo.list_audit_logs(limit=limit, offset=offset, actor_id=actor_id, action=action)


# ── Toggle admin ──────────────────────────────────────────────────────────────

@admin_router.post("/users/{user_id}/toggle-admin")
def toggle_admin(user_id: str, admin: Admin, request: Request) -> dict:
    if user_id == admin:
        raise HTTPException(status_code=400, detail="자신의 권한은 변경할 수 없습니다.")
    svc = _svc(request)
    user = svc._repo.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    new_admin = not user.is_admin
    svc._repo.update_user_admin(user_id, new_admin)
    _admin_audit(request, admin, admin, "user.toggle_admin", user_id, user.username,
                 detail=f"is_admin={new_admin}")
    return {"id": user_id, "is_admin": new_admin}


# ── Force stop ────────────────────────────────────────────────────────────────

@admin_router.post("/servers/{server_id}/force-stop")
def force_stop(server_id: str, admin: Admin, request: Request) -> dict:
    server_svc = request.app.state.server_service
    server = server_svc.repository.get(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="서버를 찾을 수 없습니다.")
    try:
        updated = server_svc.set_state(server.owner_id, server_id, "stopped")
        _admin_audit(request, admin, admin, "server.force_stop", server_id, server.name)
        return {"id": updated.id, "status": updated.status}
    except Exception as exc:
        _admin_audit(request, admin, admin, "server.force_stop", server_id, server.name, "error", str(exc))
        raise HTTPException(status_code=422, detail=str(exc))


# ── All servers (admin view) ──────────────────────────────────────────────────

@admin_router.get("/servers")
def all_servers(admin: Admin, request: Request) -> list[dict]:
    server_svc = request.app.state.server_service
    svc = _svc(request)
    users = {u.id: u.username for u in svc.list_users()}
    result = []
    for user_id, username in users.items():
        for server in server_svc.repository.list_by_owner(user_id):
            result.append({
                "id": server.id,
                "name": server.name,
                "status": server.status,
                "owner_id": user_id,
                "owner_name": username,
                "node_id": server.node_id,
                "cpu": server.cpu,
                "memory_mb": server.memory_mb,
                "created_at": server.created_at.isoformat() if hasattr(server.created_at, 'isoformat') else str(server.created_at),
            })
    return result


# ── User quotas ───────────────────────────────────────────────────────────────

@admin_router.get("/users/{user_id}/quota")
def get_user_quota(user_id: str, admin: Admin, request: Request) -> dict:
    repo = request.app.state.server_service.repository
    return repo.get_user_quota(user_id)


@admin_router.put("/users/{user_id}/quota", status_code=204)
def set_user_quota(user_id: str, payload: UserQuotaRequest, admin: Admin, request: Request) -> None:
    from uuid import NAMESPACE_URL, uuid5
    svc = _svc(request)
    user = svc._repo.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    server_svc = request.app.state.server_service
    repo = server_svc.repository
    repo.set_user_quota(user_id, payload.max_cpu, payload.max_memory_mb, payload.max_storage_gb, payload.max_servers)
    namespace = f"tenant-{uuid5(NAMESPACE_URL, user_id).hex}"
    try:
        server_svc.adapter.update_tenant_quota(
            namespace, payload.max_cpu, payload.max_memory_mb, payload.max_storage_gb, payload.max_servers
        )
    except Exception:
        pass  # 네임스페이스 미존재 시 무시
    _admin_audit(request, admin, admin, "user.set_quota", user_id, user.username,
                 detail=f"cpu={payload.max_cpu} mem={payload.max_memory_mb} storage={payload.max_storage_gb} servers={payload.max_servers}")
