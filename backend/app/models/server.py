"""Validated API/domain values; user input cannot select infrastructure primitives."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ALLOWED_WORKERS = ("kubehost-worker-01",)
DEMO_OWNER = "demo-user"


class ServerCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9 _-]*$")
    game: Literal["minecraft-java"] = "minecraft-java"
    edition: Literal["paper"] = "paper"
    version: Literal["1.21.4"] = "1.21.4"
    cpu: float = Field(default=1, ge=0.5, le=4, allow_inf_nan=False)
    memory_mb: int = Field(default=2048, ge=1024, le=8192, strict=True)
    storage_gb: int = Field(default=10, ge=5, le=100, strict=True)
    node_id: Literal["kubehost-worker-01"] = "kubehost-worker-01"


class ResourcePlan(BaseModel):
    namespace: str
    resources: list[dict[str, Any]]
    warnings: list[str]


class Server(ServerCreate):
    id: str
    owner_id: str
    status: Literal["running", "stopped"]
    created_at: datetime
    connection: str | None = None
    resource_plan: ResourcePlan
    logs: list[str]


class Node(BaseModel):
    id: str
    name: str
    role: Literal["worker", "control-plane"]
    status: Literal["Ready"] = "Ready"
    schedulable: bool
    cpu_capacity: int
    memory_mb_capacity: int
    mock: bool = True


class DeletionResult(BaseModel):
    id: str
    deleted: bool = True
    data_policy: Literal["retained", "deleted"]
    mock: bool = True

