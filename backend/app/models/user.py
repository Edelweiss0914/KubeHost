from datetime import datetime
from pydantic import BaseModel


class User(BaseModel):
    id: str
    username: str
    password_hash: str
    is_admin: bool = False
    created_at: datetime
    cf_api_key: str | None = None
    cs2_gslt: str | None = None
