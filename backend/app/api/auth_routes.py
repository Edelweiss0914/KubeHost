"""Authentication endpoints: login, register, me."""
import os

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

auth_router = APIRouter(prefix="/api/v1/auth")


def _svc(request: Request):  # type: ignore[return]
    return request.app.state.auth_service


class LoginRequest(BaseModel):
    username: str
    password: str = Field(min_length=1)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_-]+$")
    password: str = Field(min_length=8)


@auth_router.post("/login")
def login(payload: LoginRequest, request: Request) -> dict[str, str]:
    svc = _svc(request)
    try:
        token, user_id = svc.authenticate(payload.username, payload.password)
        request.app.state.server_service.provision_tenant(user_id)
        return {"token": token}
    except ValueError as exc:
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
