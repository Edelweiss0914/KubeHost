"""Application use cases: ownership and transitions stay outside HTTP handlers."""
from datetime import datetime, timezone
from threading import RLock
from typing import Literal
from uuid import NAMESPACE_URL, uuid4, uuid5

from app.models.server import DeletionResult, Server, ServerCreate, ServerSettings
from app.ports import KubernetesAdapter, ServerRepository
from app.services.plans import build_resource_plan, namespace_resources


class ServerNotFound(Exception):
    pass


class InvalidOperation(Exception):
    pass


class ServerService:
    def __init__(
        self,
        repository: ServerRepository,
        adapter: KubernetesAdapter,
        mode: str = "mock",
    ) -> None:
        self.repository = repository
        self.adapter = adapter
        self.mode = mode
        self._lock = RLock()

    def provision_tenant(self, owner_id: str) -> None:
        if self.mode != "real":
            return
        namespace = f"tenant-{uuid5(NAMESPACE_URL, owner_id).hex}"
        for res in namespace_resources(namespace):
            try:
                self.adapter.create_resource(res)
            except Exception:
                pass  # already exists — idempotent

    def _sync_status(self, server: Server) -> Server:
        """K8s 실제 상태와 DB 상태를 동기화. 실패 시 기존 상태 유지."""
        try:
            real_status = self.adapter.get_status(server.id, server.resource_plan.namespace, sts_name=server.resource_plan.sts_name)
            if real_status is not None and real_status != server.status:
                server.status = real_status  # type: ignore[assignment]
                self.repository.save(server)
        except Exception:
            pass
        return server

    def get(self, owner_id: str, server_id: str) -> Server:
        server = self.repository.get(server_id)
        if server is None or server.owner_id != owner_id:
            raise ServerNotFound("Server not found")
        return self._sync_status(server)

    def list(self, owner_id: str) -> list[Server]:
        servers = self.repository.list_by_owner(owner_id)
        return [self._sync_status(s) for s in servers]

    def create(self, owner_id: str, request: ServerCreate) -> Server:
        mock = self.mode == "mock"
        with self._lock:
            servers = self.repository.list_by_owner(owner_id)
            retained = self.repository.retained_for(owner_id)
            allocated = servers + retained
            quota = self.repository.get_user_quota(owner_id)
            if (sum(s.cpu for s in servers) + request.cpu > quota["max_cpu"]
                    or sum(s.memory_mb for s in servers) + request.memory_mb > quota["max_memory_mb"]
                    or sum(s.storage_gb for s in allocated) + request.storage_gb > quota["max_storage_gb"]
                    or len(allocated) >= quota["max_servers"]):
                raise InvalidOperation(
                    f"테넌트 리소스 쿼터를 초과했습니다 "
                    f"({quota['max_cpu']} CPU, {quota['max_memory_mb']//1024} GiB RAM, "
                    f"{quota['max_storage_gb']} GiB 스토리지, {quota['max_servers']}개 서버)"
                )
            server_id = uuid4()
            plan = build_resource_plan(
                request, uuid5(NAMESPACE_URL, owner_id), server_id, mock=mock,
                cf_api_key=request.cf_api_key,
            )
            try:
                connection = self.adapter.create(plan)
            except Exception as exc:
                if "already allocated" in str(exc):
                    raise InvalidOperation(
                        f"포트 {request.node_port}는 이미 사용 중입니다. 다른 포트를 선택하세요."
                    )
                raise
            initial_status: Literal["provisioning", "stopped"] = "stopped" if mock else "provisioning"
            log_msg = (
                "[MOCK] Plan created. No cluster was contacted."
                if mock
                else "[K8s] Resources applied to cluster. Server is provisioning."
            )
            server = Server(
                **request.model_dump(),
                id=str(server_id),
                owner_id=owner_id,
                status=initial_status,
                created_at=datetime.now(timezone.utc),
                connection=connection,
                resource_plan=plan,
                logs=[log_msg],
            )
            self.repository.save(server)
            return server

    def set_state(
        self, owner_id: str, server_id: str, state: Literal["running", "stopped"]
    ) -> Server:
        with self._lock:
            server = self.get(owner_id, server_id)
            if server.status == state:
                raise InvalidOperation(f"Server is already {state}")
            self.adapter.set_state(server.id, server.resource_plan.namespace, state, sts_name=server.resource_plan.sts_name)
            server.status = state
            server.logs.append(
                f"[MOCK] Server {state}. No real process was changed."
                if self.mode == "mock"
                else f"[K8s] StatefulSet scaled to {'1' if state == 'running' else '0'} replicas."
            )
            self.repository.save(server)
            return server

    def delete(
        self,
        owner_id: str,
        server_id: str,
        delete_data: bool,
        confirmation: str | None,
    ) -> DeletionResult:
        with self._lock:
            server = self.get(owner_id, server_id)
            if delete_data and confirmation != server.name:
                raise InvalidOperation("Type the exact server name to confirm permanent data deletion")
            self.adapter.delete(server.id, server.resource_plan.namespace, delete_data, sts_name=server.resource_plan.sts_name)
            if not delete_data:
                self.repository.retain(server)
            self.repository.delete(server.id)
            return DeletionResult(
                id=server.id,
                data_policy="deleted" if delete_data else "retained",
            )

    def execute(self, owner_id: str, server_id: str, command: str) -> str:
        server = self.repository.get(server_id)
        if server is None or server.owner_id != owner_id:
            raise ServerNotFound("Server not found")
        if server.game != "minecraft-java":
            raise InvalidOperation("이 게임은 RCON 명령 전송을 아직 지원하지 않습니다.")
        if server.status != "running":
            raise InvalidOperation("서버가 실행 중일 때만 명령어를 사용할 수 있습니다.")
        try:
            return self.adapter.rcon(server_id, server.resource_plan.namespace, command, sts_name=server.resource_plan.sts_name)
        except Exception as exc:
            raise InvalidOperation(str(exc))

    def get_settings(self, owner_id: str, server_id: str) -> dict[str, str]:
        server = self.repository.get(server_id)
        if server is None or server.owner_id != owner_id:
            raise ServerNotFound("Server not found")
        return self.adapter.get_settings(server_id, server.resource_plan.namespace, sts_name=server.resource_plan.sts_name)

    def update_settings(self, owner_id: str, server_id: str, settings: ServerSettings) -> None:
        server = self.repository.get(server_id)
        if server is None or server.owner_id != owner_id:
            raise ServerNotFound("Server not found")
        self.adapter.patch_settings(server_id, server.resource_plan.namespace, {
            "DIFFICULTY": settings.difficulty,
            "GAMEMODE": settings.gamemode,
            "MAX_PLAYERS": str(settings.max_players),
            "MOTD": settings.motd,
            "PVP": "TRUE" if settings.pvp else "FALSE",
            "ONLINE_MODE": "TRUE" if settings.online_mode else "FALSE",
            "SPAWN_PROTECTION": str(settings.spawn_protection),
            "VIEW_DISTANCE": str(settings.view_distance),
            "OPS": settings.ops,
            "FORCE_GAMEMODE": "TRUE" if settings.force_gamemode else "FALSE",
        }, sts_name=server.resource_plan.sts_name)

    def restore(self, owner_id: str, server_id: str) -> Server:
        with self._lock:
            retained = self.repository.retained_for(owner_id)
            server = next((s for s in retained if s.id == server_id), None)
            if server is None:
                raise ServerNotFound("Retained server not found")
            connection = self.adapter.create(server.resource_plan)
            server = server.model_copy(update={
                "status": "provisioning",
                "connection": connection or server.connection,
                "logs": [*server.logs, "[K8s] Restored from retained data. Server is provisioning."],
            })
            self.repository.save(server)
            self.repository.unretain(server_id)
            return server
