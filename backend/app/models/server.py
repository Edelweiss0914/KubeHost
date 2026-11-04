"""Validated API/domain values; user input cannot select infrastructure primitives."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ALLOWED_WORKERS = ("kubehost-worker-01",)
DEMO_OWNER = "demo-user"


class ServerCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9 _-]*$")
    game: Literal["minecraft-java", "valheim", "garrysmod"] = "minecraft-java"
    edition: Literal["paper"] = "paper"
    game_type: Literal["VANILLA", "PAPER", "FORGE", "FABRIC", "MODRINTH", "AUTO_CURSEFORGE"] = "PAPER"
    version: Literal["LATEST", "1.21.4", "1.21.1", "1.20.6", "1.20.4", "1.16.5", "1.14.4", "1.12.2"] = "LATEST"
    modrinth_project: str | None = Field(default=None, max_length=128)
    cf_slug: str | None = Field(default=None, max_length=128)
    cf_api_key: str | None = Field(default=None, exclude=True)  # 런타임 주입, API 노출 안 함
    # Valheim
    server_password: str | None = Field(default=None, max_length=64)
    world_name: str | None = Field(default=None, max_length=64)
    server_public: bool = False
    # Garry's Mod
    map_name: str | None = Field(default=None, max_length=64)
    gamemode_name: str | None = Field(default=None, max_length=32)
    cpu: float = Field(default=1, ge=0.5, le=4, allow_inf_nan=False)
    memory_mb: int = Field(default=2048, ge=1024, le=8192, strict=True)
    storage_gb: int = Field(default=10, ge=5, le=100, strict=True)
    node_id: Literal["kubehost-worker-01"] = "kubehost-worker-01"
    node_port: int | None = Field(default=None, ge=30000, le=32767)


class ResourcePlan(BaseModel):
    namespace: str
    target_node: str
    resources: list[dict[str, Any]]
    warnings: list[str]
    sts_name: str = ""


class Server(ServerCreate):
    id: str
    owner_id: str
    status: Literal["provisioning", "running", "stopped", "error"]
    created_at: datetime
    connection: str | None = None
    resource_plan: ResourcePlan
    logs: list[str]


class Node(BaseModel):
    id: str
    name: str
    role: Literal["worker", "control-plane"]
    status: Literal["Ready", "NotReady"] = "Ready"
    schedulable: bool
    cpu_capacity: int
    memory_mb_capacity: int
    cpu_requested_m: int = 0
    memory_mb_requested: int = 0


class PodContainer(BaseModel):
    name: str
    ready: bool
    state: Literal["running", "waiting", "terminated", "unknown"]
    restart_count: int


class ServerPod(BaseModel):
    server_id: str
    name: str
    namespace: str
    node_id: str | None
    phase: str
    containers: list[PodContainer]
    simulated: bool = False


class ServerSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    difficulty: Literal["peaceful", "easy", "normal", "hard"] = "easy"
    gamemode: Literal["survival", "creative", "adventure", "spectator"] = "survival"
    max_players: int = Field(default=20, ge=1, le=100)
    motd: str = Field(default="A Minecraft Server", max_length=59)
    pvp: bool = True
    online_mode: bool = True
    spawn_protection: int = Field(default=16, ge=0, le=100)
    view_distance: int = Field(default=10, ge=3, le=32)
    ops: str = Field(default="")
    force_gamemode: bool = False


class DeletionResult(BaseModel):
    id: str
    deleted: bool = True
    data_policy: Literal["retained", "deleted"]
