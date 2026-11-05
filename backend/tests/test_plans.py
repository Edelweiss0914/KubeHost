from uuid import UUID

from app.models.server import ServerCreate
from app.services.plans import build_resource_plan


def test_plan_is_pure_and_constrained():
    request = ServerCreate(name="User visible name", cpu=2, memory_mb=4096, storage_gb=20)
    args = (request, UUID(int=1), UUID(int=2))
    plan = build_resource_plan(*args)
    assert plan == build_resource_plan(*args)
    assert plan.namespace == "tenant-00000000000000000000000000000001"
    assert "User" not in plan.namespace
    kinds = {r["kind"] for r in plan.resources}
    assert {"Namespace", "ResourceQuota", "LimitRange", "StatefulSet", "Service"} <= kinds
    stateful = next(r["spec"] for r in plan.resources if r["kind"] == "StatefulSet")
    assert stateful["replicas"] == 1
    assert stateful["persistentVolumeClaimRetentionPolicy"] == {"whenDeleted": "Retain", "whenScaled": "Retain"}
    claim = stateful["volumeClaimTemplates"][0]["spec"]
    assert claim["storageClassName"] == "local-path"
    assert claim["accessModes"] == ["ReadWriteOnce"]
    assert claim["resources"]["requests"]["storage"] == "20Gi"
    pod = stateful["template"]["spec"]
    assert pod["nodeSelector"] == {"kubernetes.io/hostname": "kubehost-worker-01"}
    assert "tolerations" not in pod
    assert not pod["automountServiceAccountToken"]
    container = pod["containers"][0]
    assert container["resources"]["limits"] == {"cpu": "2.0", "memory": "4096Mi"}
    assert not container["securityContext"]["allowPrivilegeEscalation"]
    services = [r["spec"] for r in plan.resources if r["kind"] == "Service"]
    assert any(s.get("clusterIP") == "None" for s in services)
    external = next(s for s in services if s.get("type") == "NodePort")
    assert "nodePort" not in external["ports"][0]
    assert any("automatically move" in warning for warning in plan.warnings)


def test_tenant_resources_are_shared_but_server_resources_are_unique():
    first = build_resource_plan(ServerCreate(name="First server"), UUID(int=1), UUID(int=2))
    second = build_resource_plan(ServerCreate(name="Second server"), UUID(int=1), UUID(int=3))
    shared_kinds = {"Namespace", "ResourceQuota", "LimitRange"}
    assert [r for r in first.resources if r["kind"] in shared_kinds] == [
        r for r in second.resources if r["kind"] in shared_kinds
    ]
    first_names = {r["metadata"]["name"] for r in first.resources if r["kind"] not in shared_kinds}
    second_names = {r["metadata"]["name"] for r in second.resources if r["kind"] not in shared_kinds}
    assert first_names.isdisjoint(second_names)
    assert any("idempotently" in warning for warning in first.warnings)
    assert any("namespace deletion" in warning for warning in first.warnings)


def test_garrysmod_plan_allows_game_udp_only_for_its_pod():
    plan = build_resource_plan(
        ServerCreate(name="GMod server", game="garrysmod"), UUID(int=1), UUID(int=2)
    )
    policy = next(
        resource for resource in plan.resources
        if resource["kind"] == "NetworkPolicy"
        and resource["metadata"]["name"] == f"{plan.sts_name}-ingress"
    )
    assert policy["metadata"]["namespace"] == plan.namespace
    assert policy["spec"]["podSelector"] == {
        "matchLabels": {"app.kubernetes.io/name": plan.sts_name}
    }
    assert policy["spec"]["ingress"] == [{"ports": [{"port": 27015, "protocol": "UDP"}]}]
