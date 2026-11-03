"""Ports and in-memory adapters. No Kubernetes SDK or network client is present."""
from typing import Literal

from app.models.server import Node, PodContainer, ResourcePlan, Server, ServerPod


class InMemoryServerRepository:
    """Process-local demo state. Restart clears servers and retained data records."""
    def __init__(self) -> None:
        self._servers: dict[str, Server] = {}
        self.retained: dict[str, Server] = {}

    def list_by_owner(self, owner_id: str) -> list[Server]:
        return [s.model_copy(deep=True) for s in self._servers.values() if s.owner_id == owner_id]

    def get(self, server_id: str) -> Server | None:
        server = self._servers.get(server_id)
        return server.model_copy(deep=True) if server else None

    def save(self, server: Server) -> None:
        self._servers[server.id] = server.model_copy(deep=True)

    def delete(self, server_id: str) -> None:
        del self._servers[server_id]

    def retain(self, server: Server) -> None:
        self.retained[server.id] = server.model_copy(deep=True)

    def unretain(self, server_id: str) -> None:
        self.retained.pop(server_id, None)

    def retained_for(self, owner_id: str) -> list[Server]:
        return [s.model_copy(deep=True) for s in self.retained.values() if s.owner_id == owner_id]

    _GAMES: list[dict] = [
        {"id": "mc-java",  "slug": "minecraft-java",  "name": "Minecraft Java",         "steam_app_id": None,    "image_url": None, "description": "Paper 서버", "supported": True},
        {"id": "cs2",      "slug": "cs2",              "name": "Counter-Strike 2",        "steam_app_id": 730,     "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/730/capsule_sm_120.jpg",     "description": "팀 기반 FPS",      "supported": False},
        {"id": "valheim",  "slug": "valheim",          "name": "Valheim",                 "steam_app_id": 892970,  "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/892970/capsule_sm_120.jpg",  "description": "바이킹 서바이벌",  "supported": False},
        {"id": "terraria", "slug": "terraria",         "name": "Terraria",                "steam_app_id": 105600,  "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/105600/capsule_sm_120.jpg",  "description": "2D 어드벤처",      "supported": False},
        {"id": "pz",       "slug": "project-zomboid",  "name": "Project Zomboid",         "steam_app_id": 108600,  "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/108600/capsule_sm_120.jpg",  "description": "좀비 서바이벌",    "supported": False},
        {"id": "rust",     "slug": "rust",             "name": "Rust",                    "steam_app_id": 252490,  "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/252490/capsule_sm_120.jpg",  "description": "PvP 서바이벌",     "supported": False},
        {"id": "7d2d",     "slug": "7-days-to-die",    "name": "7 Days to Die",           "steam_app_id": 251570,  "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/251570/capsule_sm_120.jpg",  "description": "좀비 타워 디펜스", "supported": False},
        {"id": "ark",      "slug": "ark-asa",          "name": "ARK: Survival Ascended",  "steam_app_id": 2399830, "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/2399830/capsule_sm_120.jpg", "description": "공룡 서바이벌",    "supported": False},
    ]

    def list_games(self) -> list[dict]:
        return list(self._GAMES)


class MockKubernetesAdapter:
    def nodes(self) -> list[Node]:
        return [Node(id="mock-control-plane", name="mock-control-plane", role="control-plane",
                     schedulable=False, cpu_capacity=4, memory_mb_capacity=8192),
                Node(id="kubehost-worker-01", name="kubehost-worker-01", role="worker",
                     schedulable=True, cpu_capacity=8, memory_mb_capacity=16384)]

    def list_server_pods(self, server: Server) -> list[ServerPod]:
        if server.status not in ("running", "provisioning"):
            return []
        name = f"mc-{server.id.replace('-', '')}-0"
        running = server.status == "running"
        return [ServerPod(
            server_id=server.id,
            name=name,
            namespace=server.resource_plan.namespace,
            node_id=server.node_id,
            phase="Running" if running else "Pending",
            containers=[PodContainer(name="minecraft", ready=running,
                                     state="running" if running else "waiting", restart_count=0)],
            simulated=True,
        )]

    def create(self, plan: ResourcePlan) -> str | None:
        return None

    def get_status(self, server_id: str, namespace: str) -> str | None:
        return None

    def set_state(self, server_id: str, namespace: str, state: Literal["running", "stopped"]) -> None:
        pass

    def delete(self, server_id: str, namespace: str, delete_data: bool) -> None:
        pass

    def logs(self, server_id: str, namespace: str, tail: int = 100) -> list[str]:
        return []

    def list_pvcs(self, namespace: str) -> list[str]:
        return []

    def get_settings(self, server_id: str, namespace: str) -> dict[str, str]:
        return {}

    def patch_settings(self, server_id: str, namespace: str, updates: dict[str, str]) -> None:
        pass

    def rcon(self, server_id: str, namespace: str, command: str) -> str:
        cmd = command.lstrip("/").strip().lower()
        if cmd == "list":
            return "There are 2 of a max of 20 players online: Steve, Alex"
        if cmd == "whitelist list":
            return "There are 3 whitelisted players: Steve, Alex, Notch"
        if cmd.startswith("whitelist add "):
            name = command.strip().split()[-1]
            return f"Added {name} to the whitelist"
        if cmd.startswith("whitelist remove "):
            name = command.strip().split()[-1]
            return f"Removed {name} from the whitelist"
        if cmd.startswith("op "):
            name = command.strip().split()[-1]
            return f"Made {name} a server operator"
        if cmd.startswith("deop "):
            name = command.strip().split()[-1]
            return f"Made {name} no longer a server operator"
        return "[MOCK] 명령어가 실행됐습니다."

    def get_tenant_quota(self, namespace: str) -> dict[str, dict[str, str]]:
        return {
            "requests.cpu":    {"used": "1",    "hard": "4"},
            "requests.memory": {"used": "2Gi",  "hard": "8Gi"},
            "requests.storage":{"used": "10Gi", "hard": "100Gi"},
            "pods":            {"used": "1",    "hard": "10"},
        }

    def update_tenant_quota(self, namespace: str, max_cpu: float, max_memory_mb: int, max_storage_gb: int, max_servers: int) -> None:
        pass


