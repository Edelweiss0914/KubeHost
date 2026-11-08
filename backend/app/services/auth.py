"""Authentication: password hashing, JWT issuance and verification."""
import os
import secrets
from datetime import datetime, timezone, timedelta
from uuid import uuid4

import jwt
from passlib.context import CryptContext  # type: ignore[import-untyped]

from app.models.invite import InviteCode
from app.models.user import User

_SECRET = os.getenv("KUBEHOST_JWT_SECRET", "dev-secret-change-in-production")
_ALGORITHM = "HS256"
_EXPIRE_DAYS = 30

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    def __init__(self, repository: object) -> None:
        self._repo = repository  # type: ignore[assignment]

    def create_user(self, username: str, password: str) -> User:
        if self._repo.get_by_username(username):  # type: ignore[union-attr]
            raise ValueError("이미 존재하는 사용자명입니다.")
        is_admin = self._repo.user_count() == 0  # type: ignore[union-attr]
        user = User(
            id=str(uuid4()),
            username=username,
            password_hash=_pwd.hash(password),
            is_admin=is_admin,
            created_at=datetime.now(timezone.utc),
        )
        self._repo.save_user(user)  # type: ignore[union-attr]
        return user

    def authenticate(self, username: str, password: str) -> tuple[str, str]:
        user: User | None = self._repo.get_by_username(username)  # type: ignore[union-attr]
        if not user or not _pwd.verify(password, user.password_hash):
            raise ValueError("잘못된 사용자명 또는 비밀번호입니다.")
        payload = {
            "sub": user.id,
            "username": user.username,
            "is_admin": user.is_admin,
            "exp": datetime.now(timezone.utc) + timedelta(days=_EXPIRE_DAYS),
        }
        return jwt.encode(payload, _SECRET, algorithm=_ALGORITHM), user.id

    def verify_token(self, token: str) -> dict[str, object]:
        try:
            return jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
        except jwt.ExpiredSignatureError:
            raise ValueError("토큰이 만료됐습니다. 다시 로그인하세요.")
        except jwt.InvalidTokenError:
            raise ValueError("유효하지 않은 토큰입니다.")

    def validate_invite_code(self, code: str) -> bool:
        """Check DB invite codes. Env var master key is checked in the route."""
        invite: InviteCode | None = self._repo.get_invite_by_code(code)  # type: ignore[union-attr]
        if not invite or not invite.is_valid:
            return False
        return True

    def consume_invite_code(self, code: str, used_by: str) -> None:
        invite: InviteCode | None = self._repo.get_invite_by_code(code)  # type: ignore[union-attr]
        if invite and invite.single_use:
            invite = invite.model_copy(update={
                "used_by": used_by,
                "used_at": datetime.now(timezone.utc),
            })
            self._repo.save_invite(invite)  # type: ignore[union-attr]

    def generate_invite_code(
        self,
        created_by: str,
        single_use: bool = True,
        expires_at: datetime | None = None,
    ) -> InviteCode:
        invite = InviteCode(
            id=str(uuid4()),
            code=secrets.token_urlsafe(12),
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            single_use=single_use,
            expires_at=expires_at,
        )
        self._repo.save_invite(invite)  # type: ignore[union-attr]
        return invite

    def list_invite_codes(self) -> list[InviteCode]:
        return self._repo.list_invites()  # type: ignore[union-attr]

    def revoke_invite_code(self, invite_id: str) -> None:
        self._repo.delete_invite(invite_id)  # type: ignore[union-attr]

    def list_users(self) -> list[User]:
        return self._repo.list_users()  # type: ignore[union-attr]

    def delete_user(self, user_id: str) -> None:
        self._repo.delete_user(user_id)  # type: ignore[union-attr]

    def user_count(self) -> int:
        return self._repo.user_count()  # type: ignore[union-attr]

    def change_password(self, user_id: str, current_password: str, new_password: str) -> None:
        user: User | None = self._repo.get_user_by_id(user_id)  # type: ignore[union-attr]
        if not user:
            raise ValueError("사용자를 찾을 수 없습니다.")
        if not _pwd.verify(current_password, user.password_hash):
            raise ValueError("현재 비밀번호가 올바르지 않습니다.")
        updated = user.model_copy(update={"password_hash": _pwd.hash(new_password)})
        self._repo.save_user(updated)  # type: ignore[union-attr]

    def get_cf_key_status(self, user_id: str) -> bool:
        user: User | None = self._repo.get_user_by_id(user_id)  # type: ignore[union-attr]
        if not user:
            raise ValueError("사용자를 찾을 수 없습니다.")
        return bool(user.cf_api_key)

    def set_cf_key(self, user_id: str, cf_api_key: str | None) -> None:
        user: User | None = self._repo.get_user_by_id(user_id)  # type: ignore[union-attr]
        if not user:
            raise ValueError("사용자를 찾을 수 없습니다.")
        updated = user.model_copy(update={"cf_api_key": cf_api_key or None})
        self._repo.save_user(updated)  # type: ignore[union-attr]

    def get_gslt(self, user_id: str) -> str | None:
        user: User | None = self._repo.get_user_by_id(user_id)  # type: ignore[union-attr]
        if not user:
            raise ValueError("사용자를 찾을 수 없습니다.")
        return user.cs2_gslt

    def set_gslt(self, user_id: str, cs2_gslt: str | None) -> None:
        user: User | None = self._repo.get_user_by_id(user_id)  # type: ignore[union-attr]
        if not user:
            raise ValueError("사용자를 찾을 수 없습니다.")
        updated = user.model_copy(update={"cs2_gslt": cs2_gslt or None})
        self._repo.save_user(updated)  # type: ignore[union-attr]

    def get_user_by_id(self, user_id: str) -> User | None:
        return self._repo.get_user_by_id(user_id)  # type: ignore[union-attr]
