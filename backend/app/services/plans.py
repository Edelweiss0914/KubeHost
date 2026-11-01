"""Pure resource planning. These dictionaries are never submitted to a cluster."""
from typing import Any
from uuid import UUID

from app.models.server import ALLOWED_WORKERS, ResourcePlan, ServerCreate


def build_resource_plan(request: ServerCreate, tenant_id: UUID, server_id: UUID) -> ResourcePlan:
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
    resource("Service", f"{name}-headless", {"clusterIP": "None", "selector": labels,
        "ports": [{"name": "minecraft", "port": 25565, "targetPort": 25565}]})
    resource("Service", f"{name}-game", {"type": "NodePort", "selector": labels,
        "ports": [{"name": "minecraft", "port": 25565, "targetPort": 25565,
                   "protocol": "TCP"}]})
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
            "containers": [{"name": "minecraft", "image": "itzg/minecraft-server:2024.12.0-java21",
                "env": [{"name": "EULA", "value": "TRUE"}, {"name": "TYPE", "value": "PAPER"},
                        {"name": "VERSION", "value": request.version},
                        {"name": "MEMORY", "value": f"{int(request.memory_mb * 0.75)}M"}],
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
    return ResourcePlan(namespace=namespace, resources=resources, warnings=[
        "Mock plan only: no Kubernetes resources are applied.",
        "Local PVC data cannot automatically move to another Worker after failure.",
        "local-path size is not a guaranteed disk quota or reservation.",
        "StatefulSet PVC retention does not protect data from explicit PVC or namespace deletion.",
        "NodePort is unassigned; a future cluster adapter must allocate it. No connection is available.",
        "Tenant Namespace, ResourceQuota and LimitRange are shared; a future adapter must upsert them idempotently, never delete them with one server.",
        "Namespace and Pod security alone do not provide complete tenant isolation.",
        "Minecraft version is pinned; Paper build and image digest require verification before real deployment.",
    ])


