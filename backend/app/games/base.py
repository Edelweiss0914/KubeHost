"""Game definition base class and shared types."""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from uuid import UUID

if TYPE_CHECKING:
    from app.models.server import ResourcePlan, ServerCreate


@dataclass(frozen=True)
class QuickAccess:
    folder: str
    icon: str
    label: str
    desc: str


class GameDefinition:
    """
    Self-describing game driver.
    Each game declares its capabilities, file layout, and K8s resource shape.
    Adding a new game = one file in app/games/ + entry in registry.
    """

    # ── identity ──────────────────────────────────────────────────────────────
    slug: str = ""
    name: str = ""
    description: str = ""
    steam_app_id: int | None = None

    # ── UI presentation ───────────────────────────────────────────────────────
    icon: str = "⬡"
    color: str = "#6b7280"
    console_placeholder: str = ""

    # ── UI capabilities ───────────────────────────────────────────────────────
    # file_manager  → 파일 탭
    # rcon          → RCON 콘솔 탭
    # console       → 콘솔 탭 (범용)
    # backups       → 백업 버튼
    # properties    → server.properties 편집기
    # jvm           → JVM 메모리 설정
    # game_settings → 게임별 설정 패널
    # workshop      → Steam Workshop 연동
    # auto_restart  → 자동 재시작 토글
    capabilities: frozenset[str] = frozenset()

    # ── file manager ──────────────────────────────────────────────────────────
    file_root: str = "/data"
    quick_access: list[QuickAccess] = []  # noqa: RUF012

    # ── K8s identity ──────────────────────────────────────────────────────────
    sts_prefix: str = ""
    image: str = ""
    container_name: str = ""
    game_port: int = 0
    game_protocol: str = "TCP"

    # ── K8s resource builders ─────────────────────────────────────────────────

    def volume_mounts(self) -> list[dict]:
        return [{"name": "data", "mountPath": self.file_root}]

    def init_containers(self) -> list[dict]:
        return []

    def container_ports(self) -> list[dict]:
        return [{"containerPort": self.game_port, "protocol": self.game_protocol, "name": "game"}]

    def container_env(self, request: "ServerCreate", server_id: UUID) -> list[dict]:
        raise NotImplementedError

    def pod_security_context(self) -> dict:
        return {
            "runAsNonRoot": True, "runAsUser": 1000,
            "runAsGroup": 1000, "fsGroup": 1000,
            "seccompProfile": {"type": "RuntimeDefault"},
        }

    def container_security_context(self) -> dict:
        return {"allowPrivilegeEscalation": False, "capabilities": {"drop": ["ALL"]}}

    def service_ports(self) -> list[dict]:
        return [{"name": "game", "port": self.game_port,
                 "targetPort": self.game_port, "protocol": self.game_protocol}]

    def extra_resources(self, name: str, namespace: str, labels: dict, request: "ServerCreate") -> list[dict]:
        """게임별 추가 K8s 리소스 (예: GMod NetworkPolicy)."""
        return []

    def build_plan(
        self,
        request: "ServerCreate",
        tenant_id: UUID,
        server_id: UUID,
        mock: bool = True,
    ) -> "ResourcePlan":
        from app.models.server import ALLOWED_WORKERS, ResourcePlan
        from app.services.plans import _MOCK_WARNINGS, _REAL_WARNINGS, namespace_resources

        if request.node_id not in ALLOWED_WORKERS:
            raise ValueError("Worker is not allowed")

        namespace = f"tenant-{tenant_id.hex}"
        name = f"{self.sts_prefix}-{server_id.hex}"
        labels = {"app.kubernetes.io/name": name}
        memory = f"{request.memory_mb}Mi"
        cpu = str(request.cpu)

        resources: list[dict[str, Any]] = []
        resources.extend(namespace_resources(namespace))

        # Headless service
        resources.append({
            "apiVersion": "v1", "kind": "Service",
            "metadata": {"name": f"{name}-headless", "namespace": namespace},
            "spec": {"clusterIP": "None", "selector": labels, "ports": self.service_ports()},
        })

        # NodePort service
        node_svc_ports = []
        for p in self.service_ports():
            port_spec = dict(p)
            if p["name"] == "game" and request.node_port is not None:
                port_spec["nodePort"] = request.node_port
            node_svc_ports.append(port_spec)
        resources.append({
            "apiVersion": "v1", "kind": "Service",
            "metadata": {"name": f"{name}-game", "namespace": namespace},
            "spec": {"type": "NodePort", "selector": labels, "ports": node_svc_ports},
        })

        resources.extend(self.extra_resources(name, namespace, labels, request))

        pod_spec: dict[str, Any] = {
            "automountServiceAccountToken": False,
            "nodeSelector": {"kubernetes.io/hostname": request.node_id},
            "securityContext": self.pod_security_context(),
            "containers": [{
                "name": self.container_name, "image": self.image,
                "env": self.container_env(request, server_id),
                "ports": self.container_ports(),
                "resources": {"requests": {"cpu": cpu, "memory": memory},
                              "limits": {"cpu": cpu, "memory": memory}},
                "securityContext": self.container_security_context(),
                "volumeMounts": self.volume_mounts(),
            }],
        }
        inits = self.init_containers()
        if inits:
            pod_spec["initContainers"] = inits

        resources.append({
            "apiVersion": "apps/v1", "kind": "StatefulSet",
            "metadata": {"name": name, "namespace": namespace},
            "spec": {
                "replicas": 1, "serviceName": f"{name}-headless",
                "selector": {"matchLabels": labels},
                "persistentVolumeClaimRetentionPolicy": {"whenDeleted": "Retain", "whenScaled": "Retain"},
                "template": {"metadata": {"labels": labels}, "spec": pod_spec},
                "volumeClaimTemplates": [{"metadata": {"name": "data"}, "spec": {
                    "accessModes": ["ReadWriteOnce"], "storageClassName": "kubehost-local",
                    "resources": {"requests": {"storage": f"{request.storage_gb}Gi"}},
                }}],
            },
        })

        return ResourcePlan(
            namespace=namespace,
            target_node=request.node_id,
            resources=resources,
            warnings=_MOCK_WARNINGS if mock else _REAL_WARNINGS,
            sts_name=name,
        )

    def to_dict(self) -> dict:
        return {
            "slug": self.slug,
            "name": self.name,
            "description": self.description,
            "capabilities": sorted(self.capabilities),
            "file_root": self.file_root,
            "quick_access": [
                {"folder": qa.folder, "icon": qa.icon, "label": qa.label, "desc": qa.desc}
                for qa in self.quick_access
            ],
            "icon": self.icon,
            "color": self.color,
            "console_placeholder": self.console_placeholder,
        }
