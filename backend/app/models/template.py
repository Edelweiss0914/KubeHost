"""Template domain model."""
from dataclasses import dataclass


@dataclass
class Template:
    id: str
    owner_id: str
    name: str
    game: str
    cpu: float
    memory_mb: int
    storage_gb: int
    archive_path: str  # 라이브러리 내 경로 e.g. /library/templates/{id}.tar.gz
    created_at: str    # ISO 8601
    is_public: bool = False
    description: str = ""
