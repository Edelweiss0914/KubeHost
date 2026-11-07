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
    status: str = "ready"  # pending | ready | failed
    template_type: str = "archive"      # "archive" | "pvc_clone"
    source_pvc_name: str | None = None  # pvc_clone: PVC name in source ns
    source_pvc_ns: str | None = None    # pvc_clone: namespace of source PVC
