"""Ports and in-memory adapters. No Kubernetes SDK or network client is present."""
from __future__ import annotations
from typing import Literal

from app.models.server import Node, ResourcePlan, Server


class InMemoryServerRepository:
    """Process-local demo state. Restart clears servers and retained data records."""
    def __init__(self) -> None:
        self._servers: dict[str, Server] = {}
        self.retained: dict[str, Server] = {}

    def list(self, owner_id: str) -> list[Server]:
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


    def retained_for(self, owner_id: str) -> list[Server]:
        return [s.model_copy(deep=True) for s in self.retained.values() if s.owner_id == owner_id]


class MockKubernetesAdapter:
    def nodes(self) -> list[Node]:
        return [Node(id="mock-control-plane", name="mock-control-plane", role="control-plane",
                     schedulable=False, cpu_capacity=4, memory_mb_capacity=8192),
                Node(id="kubehost-worker-01", name="kubehost-worker-01", role="worker",
                     schedulable=True, cpu_capacity=8, memory_mb_capacity=16384)]

    def create(self, plan: ResourcePlan) -> None:
        pass

    def set_state(self, server_id: str, state: Literal["running", "stopped"]) -> None:
        pass

    def delete(self, server_id: str, delete_data: bool) -> None:
        pass



