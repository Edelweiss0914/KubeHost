"""Real Kubernetes adapter using the kubernetes Python client."""
import re
from typing import Literal

from kubernetes import client, config, utils  # type: ignore[import-untyped]
from kubernetes.client.rest import ApiException  # type: ignore[import-untyped]

from app.models.server import Node, ResourcePlan

_SHARED_KINDS = {"Namespace", "ResourceQuota", "LimitRange", "NetworkPolicy"}


def _parse_memory_mb(quantity: str) -> int:
    """Convert a Kubernetes memory quantity string to MiB."""
    match = re.fullmatch(r"(\d+)(Ki|Mi|Gi|Ti|Pi|k|M|G|T|P)?", quantity.strip())
    if not match:
        return 0
    value, suffix = int(match.group(1)), match.group(2) or ""
    scale = {"Ki": 1 / 1024, "Mi": 1, "Gi": 1024, "Ti": 1024 ** 2,
              "Pi": 1024 ** 3, "k": 1, "M": 1, "G": 1024, "T": 1024 ** 2, "": 1 / (1024 ** 2)}
    return int(value * scale.get(suffix, 1))


class K8sAdapter:
    def __init__(self, kubeconfig_path: str = "/etc/rancher/k3s/k3s.yaml") -> None:
        try:
            config.load_incluster_config()
        except config.ConfigException:
            config.load_kube_config(config_file=kubeconfig_path)
        self._api_client = client.ApiClient()
        self._core = client.CoreV1Api(self._api_client)
        self._apps = client.AppsV1Api(self._api_client)

    def _sts_name(self, server_id: str) -> str:
        return f"mc-{server_id.replace('-', '')}"

    def nodes(self) -> list[Node]:
        result = []
        for n in self._core.list_node().items:
            taints = n.spec.taints or []
            schedulable = not any(t.effect == "NoSchedule" for t in taints)
            role: Literal["worker", "control-plane"] = "worker" if schedulable else "control-plane"
            conds = n.status.conditions or []
            ready = next((c for c in conds if c.type == "Ready"), None)
            node_status: Literal["Ready", "NotReady"] = (
                "Ready" if (ready and ready.status == "True") else "NotReady"
            )
            result.append(Node(
                id=n.metadata.name,
                name=n.metadata.name,
                role=role,
                status=node_status,
                schedulable=schedulable,
                cpu_capacity=int(n.status.capacity.get("cpu", 0)),
                memory_mb_capacity=_parse_memory_mb(n.status.capacity.get("memory", "0Ki")),
            ))
        return result

    def create_resource(self, resource: dict) -> None:
        kind = resource["kind"]
        ignore_conflict = kind in _SHARED_KINDS
        try:
            utils.create_from_dict(self._api_client, resource)
        except utils.FailToCreateError as exc:
            for err in exc.api_exceptions:
                if not (ignore_conflict and err.status == 409):
                    raise

    def create(self, plan: ResourcePlan) -> str | None:
        for resource in plan.resources:
            kind = resource["kind"]
            ignore_conflict = kind in _SHARED_KINDS
            try:
                utils.create_from_dict(self._api_client, resource)
            except utils.FailToCreateError as exc:
                for err in exc.api_exceptions:
                    if not (ignore_conflict and err.status == 409):
                        raise
        game_svc_name = next(
            (r["metadata"]["name"] for r in plan.resources
             if r.get("kind") == "Service" and r.get("spec", {}).get("type") == "NodePort"),
            None,
        )
        return self._read_connection(plan.namespace, plan.target_node, game_svc_name)

    def _read_connection(self, namespace: str, node_name: str, svc_name: str | None) -> str | None:
        try:
            if svc_name:
                game_svc = self._core.read_namespaced_service(svc_name, namespace)
            else:
                return None
            node_port = next(
                (p.node_port for p in (game_svc.spec.ports or []) if p.node_port), None
            )
            if not node_port:
                return None
            node = self._core.read_node(node_name)
            internal_ip = next(
                (a.address for a in (node.status.addresses or []) if a.type == "InternalIP"), None
            )
            return f"{internal_ip}:{node_port}" if internal_ip else None
        except Exception:
            return None

    def get_status(self, server_id: str, namespace: str) -> str | None:
        name = self._sts_name(server_id)
        try:
            sts = self._apps.read_namespaced_stateful_set(name, namespace)
        except ApiException as exc:
            return "error" if exc.status == 404 else None
        if (sts.spec.replicas or 0) == 0:
            return "stopped"
        pods = self._core.list_namespaced_pod(
            namespace, label_selector=f"app.kubernetes.io/name={name}"
        ).items
        if not pods:
            return "provisioning"
        pod = pods[0]
        phase = (pod.status.phase or "Unknown")
        if phase == "Running":
            conds = pod.status.conditions or []
            ready = next((c for c in conds if c.type == "Ready"), None)
            return "running" if (ready and ready.status == "True") else "provisioning"
        if phase in ("Failed", "Unknown"):
            return "error"
        return "provisioning"

    def set_state(self, server_id: str, namespace: str, state: Literal["running", "stopped"]) -> None:
        name = self._sts_name(server_id)
        replicas = 1 if state == "running" else 0
        self._apps.patch_namespaced_stateful_set(name, namespace, {"spec": {"replicas": replicas}})

    def logs(self, server_id: str, namespace: str, tail: int = 300) -> list[str]:
        name = self._sts_name(server_id)
        try:
            pods = self._core.list_namespaced_pod(
                namespace, label_selector=f"app.kubernetes.io/name={name}"
            ).items
            if not pods:
                return []
            raw = self._core.read_namespaced_pod_log(
                pods[0].metadata.name, namespace, tail_lines=tail
            )
            return [line for line in raw.splitlines() if line]
        except ApiException:
            return []

    _SETTINGS_KEYS = {"DIFFICULTY", "GAMEMODE", "MAX_PLAYERS", "MOTD", "PVP",
                      "ONLINE_MODE", "SPAWN_PROTECTION", "VIEW_DISTANCE", "OPS", "FORCE_GAMEMODE"}

    def get_settings(self, server_id: str, namespace: str) -> dict[str, str]:
        name = self._sts_name(server_id)
        try:
            sts = self._apps.read_namespaced_stateful_set(name, namespace)
            env = {e.name: (e.value or "") for e in (sts.spec.template.spec.containers[0].env or [])}
            return {k.lower(): env.get(k, "") for k in self._SETTINGS_KEYS}
        except ApiException:
            return {}

    def patch_settings(self, server_id: str, namespace: str, updates: dict[str, str]) -> None:
        name = self._sts_name(server_id)
        sts = self._apps.read_namespaced_stateful_set(name, namespace)
        current = {e.name: (e.value or "") for e in (sts.spec.template.spec.containers[0].env or [])}
        current.update(updates)
        new_env = [{"name": k, "value": v} for k, v in current.items()]
        self._apps.patch_namespaced_stateful_set(name, namespace, {
            "spec": {"template": {"spec": {"containers": [{"name": "minecraft", "env": new_env}]}}}
        })

    def rcon(self, server_id: str, namespace: str, command: str) -> str:
        import socket, struct  # noqa: E401
        name = self._sts_name(server_id)
        pods = self._core.list_namespaced_pod(
            namespace, label_selector=f"app.kubernetes.io/name={name}"
        ).items
        if not pods:
            raise ValueError("서버가 실행 중이지 않습니다.")
        pod_ip = pods[0].status.pod_ip
        if not pod_ip:
            raise ValueError("파드 IP를 확인할 수 없습니다.")
        sts = self._apps.read_namespaced_stateful_set(name, namespace)
        env = {e.name: (e.value or "") for e in (sts.spec.template.spec.containers[0].env or [])}
        password = env.get("RCON_PASSWORD", "")

        def recv_exact(sock: socket.socket, n: int) -> bytes:
            buf = b""
            while len(buf) < n:
                chunk = sock.recv(n - len(buf))
                if not chunk:
                    raise ValueError("RCON 연결이 끊겼습니다.")
                buf += chunk
            return buf

        def send_packet(sock: socket.socket, req_id: int, ptype: int, payload: str) -> None:
            body = struct.pack("<ii", req_id, ptype) + payload.encode() + b"\x00\x00"
            sock.sendall(struct.pack("<i", len(body)) + body)

        def recv_packet(sock: socket.socket) -> tuple[int, int, str]:
            length = struct.unpack("<i", recv_exact(sock, 4))[0]
            body = recv_exact(sock, length)
            req_id, ptype = struct.unpack("<ii", body[:8])
            payload = body[8:-2].decode("utf-8", errors="replace")
            return req_id, ptype, payload

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(5.0)
            sock.connect((pod_ip, 25575))
            send_packet(sock, 1, 3, password)
            auth_id, _, _ = recv_packet(sock)
            if auth_id == -1:
                raise ValueError("RCON 인증 실패")
            send_packet(sock, 2, 2, command)
            _, _, response = recv_packet(sock)
            return response

    def list_pvcs(self, namespace: str) -> list[str]:
        try:
            pvcs = self._core.list_namespaced_persistent_volume_claim(namespace).items
            return [p.metadata.name for p in pvcs]
        except ApiException:
            return []

    def get_tenant_quota(self, namespace: str) -> dict[str, dict[str, str]]:
        try:
            quota = self._core.read_namespaced_resource_quota("tenant-quota", namespace)
            used = quota.status.used or {}
            hard = quota.status.hard or {}
            return {k: {"used": used.get(k, "0"), "hard": hard[k]} for k in hard}
        except ApiException:
            return {}

    def delete(self, server_id: str, namespace: str, delete_data: bool) -> None:
        name = self._sts_name(server_id)
        for svc_name in (f"{name}-headless", f"{name}-game"):
            try:
                self._core.delete_namespaced_service(svc_name, namespace)
            except ApiException as exc:
                if exc.status != 404:
                    raise
        try:
            self._apps.delete_namespaced_stateful_set(name, namespace)
        except ApiException as exc:
            if exc.status != 404:
                raise
        if delete_data:
            pvcs = self._core.list_namespaced_persistent_volume_claim(namespace).items
            for pvc in pvcs:
                if pvc.metadata.name.startswith(f"data-{name}"):
                    try:
                        self._core.delete_namespaced_persistent_volume_claim(
                            pvc.metadata.name, namespace
                        )
                    except ApiException as exc:
                        if exc.status != 404:
                            raise
