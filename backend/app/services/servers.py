"""Application use cases: ownership and transitions stay outside HTTP handlers."""
from datetime import datetime, timezone
from threading import RLock
from typing import Literal
from uuid import NAMESPACE_URL, uuid4, uuid5

from app.models.server import DeletionResult, Server, ServerCreate
from app.ports import KubernetesAdapter, ServerRepository
from app.services.plans import build_resource_plan


class ServerNotFound(Exception):
    pass


class InvalidOperation(Exception):
    pass


class ServerService:
    def __init__(self, repository: ServerRepository, adapter: KubernetesAdapter) -> None:
        self.repository = repository
        self.adapter = adapter
        self._lock = RLock()

    def get(self, owner_id: str, server_id: str) -> Server:
        server = self.repository.get(server_id)
        if server is None or server.owner_id != owner_id:
            raise ServerNotFound("Server not found")
        return server

    def create(self, owner_id: str, request: ServerCreate) -> Server:
        with self._lock:
            servers = self.repository.list_by_owner(owner_id)
            retained = self.repository.retained_for(owner_id)
            allocated = servers + retained
            if (sum(s.cpu for s in servers) + request.cpu > 4
                    or sum(s.memory_mb for s in servers) + request.memory_mb > 8192
                    or sum(s.storage_gb for s in allocated) + request.storage_gb > 100
                    or len(allocated) >= 10):
                raise InvalidOperation("Demo tenant resource quota exceeded (4 CPU, 8 GiB RAM, 100 GiB storage, 10 claims)")
            server_id = uuid4()
            plan = build_resource_plan(request, uuid5(NAMESPACE_URL, owner_id), server_id)
            server = Server(**request.model_dump(), id=str(server_id), owner_id=owner_id,
                            status="stopped", created_at=datetime.now(timezone.utc),
                            resource_plan=plan, logs=["[MOCK] Plan created. No cluster was contacted."])
            self.adapter.create(plan)
            self.repository.save(server)
            return server

    def set_state(self, owner_id: str, server_id: str,
                  state: Literal["running", "stopped"]) -> Server:
        with self._lock:
            server = self.get(owner_id, server_id)
            if server.status == state:
                raise InvalidOperation(f"Server is already {state}")
            self.adapter.set_state(server.id, state)
            server.status = state
            server.logs.append(f"[MOCK] Server {state}. No real process was changed.")
            self.repository.save(server)
            return server

    def delete(self, owner_id: str, server_id: str, delete_data: bool,
               confirmation: str | None) -> DeletionResult:
        with self._lock:
            server = self.get(owner_id, server_id)
            if delete_data and confirmation != server.name:
                raise InvalidOperation("Type the exact server name to confirm permanent data deletion")
            self.adapter.delete(server.id, delete_data)
            if not delete_data:
                self.repository.retain(server)
            self.repository.delete(server.id)
            return DeletionResult(id=server.id, data_policy="deleted" if delete_data else "retained")



