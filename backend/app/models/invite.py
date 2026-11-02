from datetime import datetime, timezone
from pydantic import BaseModel


class InviteCode(BaseModel):
    id: str
    code: str
    created_by: str
    created_at: datetime
    used_by: str | None = None
    used_at: datetime | None = None
    expires_at: datetime | None = None
    single_use: bool = True

    @property
    def is_valid(self) -> bool:
        if self.used_by and self.single_use:
            return False
        if self.expires_at and self.expires_at < datetime.now(timezone.utc):
            return False
        return True
