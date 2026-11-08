"""Authentication endpoints: login, register, me."""
import os

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

auth_router = APIRouter(prefix="/api/v1/auth")


def _svc(request: Request):  # type: ignore[return]
    return request.app.state.auth_service


def _auth_audit(
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


class LoginRequest(BaseModel):
    username: str
    password: str = Field(min_length=1)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_-]+$")
    password: str = Field(min_length=8)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


@auth_router.post("/login")
def login(payload: LoginRequest, request: Request) -> dict[str, str]:
    svc = _svc(request)
    try:
        token, user_id = svc.authenticate(payload.username, payload.password)
        request.app.state.server_service.provision_tenant(user_id)
        _auth_audit(request, user_id, payload.username, "auth.login", user_id, payload.username)
        return {"token": token}
    except ValueError as exc:
        _auth_audit(request, "?", payload.username, "auth.login", "?", payload.username, "error", str(exc))
        raise HTTPException(status_code=401, detail=str(exc))


@auth_router.post("/register", status_code=201)
def register(payload: RegisterRequest, request: Request) -> dict[str, str]:
    admin_secret = os.getenv("KUBEHOST_ADMIN_SECRET", "")
    provided = request.headers.get("X-Admin-Secret", "")
    svc = _svc(request)

    first_run = svc.user_count() == 0
    if not first_run:
        # 1) env var master key
        master_ok = admin_secret and provided == admin_secret
        # 2) DB invite code
        db_ok = bool(provided) and svc.validate_invite_code(provided)
        if not master_ok and not db_ok:
            raise HTTPException(status_code=403, detail="유효한 초대 코드가 필요합니다.")

    try:
        user = svc.create_user(payload.username, payload.password)
        # consume DB invite code if it was used (not master key)
        if not first_run and provided and provided != admin_secret:
            svc.consume_invite_code(provided, user.id)
        return {"id": user.id, "username": user.username}
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@auth_router.get("/me")
def me(request: Request) -> dict[str, object]:
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    token = authorization.removeprefix("Bearer ")
    svc = _svc(request)
    try:
        payload = svc.verify_token(token)
        return {
            "id": str(payload["sub"]),
            "username": str(payload["username"]),
            "is_admin": bool(payload.get("is_admin", False)),
        }
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


@auth_router.get("/me/cf-key")
def get_cf_key(request: Request) -> dict[str, object]:
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    token = authorization.removeprefix("Bearer ")
    svc = _svc(request)
    try:
        payload = svc.verify_token(token)
        return {"has_key": svc.get_cf_key_status(str(payload["sub"]))}
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


class CfApiKeyRequest(BaseModel):
    cf_api_key: str | None = None


@auth_router.put("/me/cf-key", status_code=204)
def set_cf_key(payload: CfApiKeyRequest, request: Request) -> None:
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    token = authorization.removeprefix("Bearer ")
    svc = _svc(request)
    try:
        token_payload = svc.verify_token(token)
        svc.set_cf_key(str(token_payload["sub"]), payload.cf_api_key)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


@auth_router.get("/me/gslt")
def get_gslt(request: Request) -> dict[str, object]:
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    token = authorization.removeprefix("Bearer ")
    svc = _svc(request)
    try:
        payload = svc.verify_token(token)
        return {"cs2_gslt": svc.get_gslt(str(payload["sub"]))}
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


class GsltRequest(BaseModel):
    cs2_gslt: str | None = None


@auth_router.put("/me/gslt", status_code=204)
def set_gslt(payload: GsltRequest, request: Request) -> None:
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    token = authorization.removeprefix("Bearer ")
    svc = _svc(request)
    try:
        token_payload = svc.verify_token(token)
        svc.set_gslt(str(token_payload["sub"]), payload.cs2_gslt)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


@auth_router.put("/password", status_code=204)
def change_password(payload: ChangePasswordRequest, request: Request) -> None:
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    token = authorization.removeprefix("Bearer ")
    svc = _svc(request)
    try:
        user_payload = svc.verify_token(token)
        user_id = str(user_payload["sub"])
        svc.change_password(user_id, payload.current_password, payload.new_password)
        _auth_audit(request, user_id, str(user_payload["username"]), "auth.change_password", user_id, str(user_payload["username"]))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
