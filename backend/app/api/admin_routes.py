"""Admin-only endpoints: user management, invite codes, tenant overview."""
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

admin_router = APIRouter(prefix="/api/v1/admin")


def _svc(request: Request):  # type: ignore[return]
    return request.app.state.auth_service


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
    _svc(request).delete_user(user_id)


# ── Invite codes ──────────────────────────────────────────────────────────────

class InviteRequest(BaseModel):
    single_use: bool = True
    expires_at: datetime | None = None


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
    return {"id": invite.id, "code": invite.code}


@admin_router.delete("/invite-codes/{invite_id}", status_code=204)
def revoke_invite(invite_id: str, admin: Admin, request: Request) -> None:
    _svc(request).revoke_invite_code(invite_id)


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
