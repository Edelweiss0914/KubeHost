"""Pure resource planning. These dictionaries are never submitted to a cluster."""
from typing import Any
from uuid import UUID

from app.models.server import ALLOWED_WORKERS, ResourcePlan, ServerCreate

_REAL_WARNINGS = [
    "호스트 서버 장애 시 저장 데이터가 자동으로 다른 서버로 이동하지 않습니다.",
    "저장 공간 크기는 실제 디스크 예약을 보장하지 않습니다.",
    "서버 삭제 시 저장 공간을 직접 삭제하면 데이터가 복구 불가능하게 손실될 수 있습니다.",
    "중요한 월드 데이터는 정기적으로 백업하는 것을 권장합니다.",
    "Minecraft 버전은 고정됩니다. 버전 변경은 서버 재생성이 필요할 수 있습니다.",
]

_MOCK_WARNINGS = [
    "테스트 모드: 실제 서버가 생성되지 않습니다.",
    *_REAL_WARNINGS,
    "접속 포트가 미배정 상태입니다. 실제 클러스터 환경에서 자동으로 배정됩니다.",
    "계정 공간 및 리소스 한도는 실제 환경에서 자동으로 설정됩니다.",
]


def namespace_resources(namespace: str) -> list[dict]:
    """Namespace-level resources shared by all servers of a tenant."""
    return [
        {"apiVersion": "v1", "kind": "Namespace",
         "metadata": {"name": namespace, "labels": {
             "pod-security.kubernetes.io/enforce": "baseline"}}},
        {"apiVersion": "v1", "kind": "ResourceQuota",
         "metadata": {"name": "tenant-quota", "namespace": namespace},
         "spec": {"hard": {
             "requests.cpu": "4", "limits.cpu": "4",
             "requests.memory": "8Gi", "limits.memory": "8Gi",
             "requests.storage": "100Gi", "persistentvolumeclaims": "10", "pods": "10"},
             "scopes": ["NotTerminating"]}},
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
    from app.games.registry import get_game
    if request.node_id not in ALLOWED_WORKERS:
        raise ValueError("Worker is not allowed")
    if cf_api_key is not None:
        request = request.model_copy(update={"cf_api_key": cf_api_key})
    return get_game(request.game).build_plan(request, tenant_id, server_id, mock)
