"""Pure resource planning. These dictionaries are never submitted to a cluster."""
from typing import Any
from uuid import UUID

from app.models.server import ALLOWED_WORKERS, ResourcePlan, ServerCreate

_REAL_WARNINGS = [
    "Local PVC data cannot automatically move to another Worker after failure.",
    "local-path size is not a guaranteed disk quota or reservation.",
    "StatefulSet PVC retention does not protect data from explicit PVC or namespace deletion.",
    "Namespace and Pod security alone do not provide complete tenant isolation.",
    "Minecraft version is pinned; Paper build and image digest require verification before deployment.",
]

_MOCK_WARNINGS = [
    "Mock plan only: no Kubernetes resources are applied.",
    *_REAL_WARNINGS,
    "NodePort is unassigned; a real cluster adapter must allocate it. No connection is available.",
    "Tenant Namespace, ResourceQuota and LimitRange are shared; a real adapter must upsert them idempotently.",
]


def namespace_resources(namespace: str) -> list[dict]:
    """Namespace-level resources shared by all servers of a tenant."""
    return [
        {"apiVersion": "v1", "kind": "Namespace",
         "metadata": {"name": namespace, "labels": {
             "pod-security.kubernetes.io/enforce": "restricted"}}},
        {"apiVersion": "v1", "kind": "ResourceQuota",
         "metadata": {"name": "tenant-quota", "namespace": namespace},
         "spec": {"hard": {
             "requests.cpu": "4", "limits.cpu": "4",
             "requests.memory": "8Gi", "limits.memory": "8Gi",
             "requests.storage": "100Gi", "persistentvolumeclaims": "10", "pods": "10"}}},
        {"apiVersion": "v1", "kind": "LimitRange",
         "metadata": {"name": "container-limits", "namespace": namespace},
         "spec": {"limits": [{"type": "Container",
             "default": {"cpu": "1", "memory": "2048Mi"},
             "defaultRequest": {"cpu": "0.5", "memory": "1024Mi"},
             "max": {"cpu": "4", "memory": "8Gi"}}]}},
        {"apiVersion": "networking.k8s.io/v1", "kind": "NetworkPolicy",
         "metadata": {"name": "tenant-isolation", "namespace": namespace},
         "spec": {
             "podSelector": {},
             "policyTypes": ["Ingress", "Egress"],
             "ingress": [
                 {"from": [{"podSelector": {}}]},
                 {"ports": [{"port": 25565, "protocol": "TCP"}]},
                 {"from": [{"namespaceSelector": {"matchLabels": {
                     "kubernetes.io/metadata.name": "kubehost-system"}}}],
                  "ports": [{"port": 25575, "protocol": "TCP"}]},
             ],
             "egress": [
                 {"ports": [{"port": 53, "protocol": "UDP"}, {"port": 53, "protocol": "TCP"}]},
                 {"to": [{"ipBlock": {"cidr": "0.0.0.0/0"}}]},
             ],
         }},
    ]


def rcon_password(server_id: UUID) -> str:
    return server_id.hex[:16]


def _game_type_env(request: ServerCreate, cf_api_key: str | None = None) -> list[dict]:
    """게임 타입에 따른 itzg 환경변수 목록을 반환."""
    envs: list[dict] = [{"name": "TYPE", "value": request.game_type}]
    if request.game_type == "MODRINTH":
        project = request.modrinth_project or ""
        envs.append({"name": "MODRINTH_PROJECT", "value": project})
        envs.append({"name": "MODRINTH_VERSION", "value": "latest"})
    elif request.game_type == "AUTO_CURSEFORGE":
        envs.append({"name": "CF_API_KEY", "value": cf_api_key or ""})
        envs.append({"name": "CF_SLUG", "value": request.cf_slug or ""})
        envs.append({"name": "CF_VERSION_TYPE", "value": "release"})
    return envs


def build_resource_plan(
    request: ServerCreate, tenant_id: UUID, server_id: UUID, mock: bool = True,
    cf_api_key: str | None = None,
) -> ResourcePlan:
    if request.node_id not in ALLOWED_WORKERS:
        raise ValueError("Worker is not allowed")
    namespace = f"tenant-{tenant_id.hex}"
    name = f"mc-{server_id.hex}"
    labels = {"app.kubernetes.io/name": name}
    memory = f"{request.memory_mb}Mi"
    cpu = str(request.cpu)
    resources: list[dict[str, Any]] = []

    def resource(kind: str, resource_name: str, spec: dict[str, Any], api: str = "v1") -> None:
        resources.append({"apiVersion": api, "kind": kind,
                          "metadata": {"name": resource_name, "namespace": namespace},
                          "spec": spec})

    resources.append({"apiVersion": "v1", "kind": "Namespace",
                      "metadata": {"name": namespace, "labels": {
                          "pod-security.kubernetes.io/enforce": "restricted"}}})
    resource("ResourceQuota", "tenant-quota", {"hard": {
        "requests.cpu": "4", "limits.cpu": "4", "requests.memory": "8Gi",
        "limits.memory": "8Gi", "requests.storage": "100Gi",
        "persistentvolumeclaims": "10", "pods": "10"}})
    resource("LimitRange", "container-limits", {"limits": [{"type": "Container",
        "default": {"cpu": "1", "memory": "2048Mi"},
        "defaultRequest": {"cpu": "0.5", "memory": "1024Mi"},
        "max": {"cpu": "4", "memory": "8Gi"}}]})
    resources.append({"apiVersion": "networking.k8s.io/v1", "kind": "NetworkPolicy",
        "metadata": {"name": "tenant-isolation", "namespace": namespace},
        "spec": {
            "podSelector": {},
            "policyTypes": ["Ingress", "Egress"],
            "ingress": [
                {"from": [{"podSelector": {}}]},
                {"ports": [{"port": 25565, "protocol": "TCP"}]},
                {"from": [{"namespaceSelector": {"matchLabels": {
                    "kubernetes.io/metadata.name": "kubehost-system"}}}],
                 "ports": [{"port": 25575, "protocol": "TCP"}]},
            ],
            "egress": [
                {"ports": [{"port": 53, "protocol": "UDP"}, {"port": 53, "protocol": "TCP"}]},
                {"to": [{"ipBlock": {"cidr": "0.0.0.0/0"}}]},
            ],
        }})
    resource("Service", f"{name}-headless", {"clusterIP": "None", "selector": labels,
        "ports": [{"name": "minecraft", "port": 25565, "targetPort": 25565}]})
    game_port: dict = {"name": "minecraft", "port": 25565, "targetPort": 25565, "protocol": "TCP"}
    if request.node_port is not None:
        game_port["nodePort"] = request.node_port
    resource("Service", f"{name}-game", {"type": "NodePort", "selector": labels,
        "ports": [game_port]})
    resource("StatefulSet", name, {
        "replicas": 1, "serviceName": f"{name}-headless",
        "selector": {"matchLabels": labels},
        "persistentVolumeClaimRetentionPolicy": {"whenDeleted": "Retain", "whenScaled": "Retain"},
        "template": {"metadata": {"labels": labels}, "spec": {
            "automountServiceAccountToken": False,
            "nodeSelector": {"kubernetes.io/hostname": request.node_id},
            "securityContext": {"runAsNonRoot": True, "runAsUser": 1000,
                                "runAsGroup": 1000, "fsGroup": 1000,
                                "seccompProfile": {"type": "RuntimeDefault"}},
            "containers": [{"name": "minecraft", "image": "itzg/minecraft-server:latest",
                "env": [{"name": "EULA", "value": "TRUE"},
                        *_game_type_env(request, cf_api_key),
                        {"name": "VERSION", "value": request.version},
                        {"name": "MEMORY", "value": f"{int(request.memory_mb * 0.75)}M"},
                        {"name": "DIFFICULTY", "value": "easy"},
                        {"name": "GAMEMODE", "value": "survival"},
                        {"name": "MAX_PLAYERS", "value": "20"},
                        {"name": "MOTD", "value": "A Minecraft Server"},
                        {"name": "PVP", "value": "TRUE"},
                        {"name": "ONLINE_MODE", "value": "TRUE"},
                        {"name": "SPAWN_PROTECTION", "value": "16"},
                        {"name": "VIEW_DISTANCE", "value": "10"},
                        {"name": "OPS", "value": ""},
                        {"name": "ENABLE_RCON", "value": "TRUE"},
                        {"name": "RCON_PORT", "value": "25575"},
                        {"name": "RCON_PASSWORD", "value": rcon_password(server_id)}],
                "ports": [{"containerPort": 25565, "name": "minecraft"}],
                "resources": {"requests": {"cpu": cpu, "memory": memory},
                              "limits": {"cpu": cpu, "memory": memory}},
                "securityContext": {"allowPrivilegeEscalation": False,
                                    "capabilities": {"drop": ["ALL"]}},
                "volumeMounts": [{"name": "data", "mountPath": "/data"}]}]}},
        "volumeClaimTemplates": [{"metadata": {"name": "data"}, "spec": {
            "accessModes": ["ReadWriteOnce"], "storageClassName": "local-path",
            "resources": {"requests": {"storage": f"{request.storage_gb}Gi"}}}}],
    }, "apps/v1")
    return ResourcePlan(
        namespace=namespace,
        target_node=request.node_id,
        resources=resources,
        warnings=_MOCK_WARNINGS if mock else _REAL_WARNINGS,
    )
