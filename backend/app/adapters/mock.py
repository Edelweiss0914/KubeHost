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
