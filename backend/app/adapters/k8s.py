"""Real Kubernetes adapter using the kubernetes Python client."""
import re
from typing import Literal

from kubernetes import client, config, utils  # type: ignore[import-untyped]
from kubernetes.client.rest import ApiException  # type: ignore[import-untyped]

from app.models.server import Node, PodContainer, ResourcePlan, Server, ServerPod

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

    def _node_allocations(self) -> dict[str, tuple[int, int]]:
        """Return {node_name: (cpu_millicores, memory_mb)} summed from all pod requests."""
        allocs: dict[str, tuple[int, int]] = {}
        try:
            pods = self._core.list_pod_for_all_namespaces(field_selector="status.phase!=Failed,status.phase!=Succeeded").items
        except Exception:
            return allocs
        for pod in pods:
            node = pod.spec.node_name
            if not node:
                continue
            cpu_m, mem_mb = allocs.get(node, (0, 0))
            for container in (pod.spec.containers or []):
                req = (container.resources.requests or {}) if container.resources else {}
                raw_cpu = req.get("cpu", "0")
                if raw_cpu.endswith("m"):
                    cpu_m += int(raw_cpu[:-1])
                else:
                    try:
                        cpu_m += int(float(raw_cpu) * 1000)
                    except ValueError:
                        pass
                mem_mb += _parse_memory_mb(req.get("memory", "0Ki"))
            allocs[node] = (cpu_m, mem_mb)
        return allocs

    def nodes(self) -> list[Node]:
        result = []
        allocs = self._node_allocations()
        for n in self._core.list_node().items:
            taints = n.spec.taints or []
            schedulable = not any(t.effect == "NoSchedule" for t in taints)
            role: Literal["worker", "control-plane"] = "worker" if schedulable else "control-plane"
            conds = n.status.conditions or []
            ready = next((c for c in conds if c.type == "Ready"), None)
            node_status: Literal["Ready", "NotReady"] = (
                "Ready" if (ready and ready.status == "True") else "NotReady"
            )
            cpu_m, mem_mb = allocs.get(n.metadata.name, (0, 0))
            result.append(Node(
                id=n.metadata.name,
                name=n.metadata.name,
                role=role,
                status=node_status,
                schedulable=schedulable,
                cpu_capacity=int(n.status.capacity.get("cpu", 0)),
                memory_mb_capacity=_parse_memory_mb(n.status.capacity.get("memory", "0Ki")),
                cpu_requested_m=cpu_m,
                memory_mb_requested=mem_mb,
            ))
        return result

    def list_server_pods(self, server: Server) -> list[ServerPod]:
        name = self._sts_name(server.id)
        pods = self._core.list_namespaced_pod(
            server.resource_plan.namespace,
            label_selector=f"app.kubernetes.io/name={name}",
        ).items
        result: list[ServerPod] = []
        for pod in pods:
            labels = pod.metadata.labels or {}
            if labels.get("app.kubernetes.io/name") != name:
                continue
            statuses = {status.name: status for status in (pod.status.container_statuses or [])}
            containers: list[PodContainer] = []
            for container in (pod.spec.containers or []):
                status = statuses.get(container.name)
                state: Literal["running", "waiting", "terminated", "unknown"] = "unknown"
                if status and status.state:
                    if status.state.running:
                        state = "running"
                    elif status.state.waiting:
                        state = "waiting"
                    elif status.state.terminated:
                        state = "terminated"
                containers.append(PodContainer(
                    name=container.name,
                    ready=bool(status and status.ready),
                    state=state,
                    restart_count=status.restart_count if status else 0,
                ))
            result.append(ServerPod(
                server_id=server.id,
                name=pod.metadata.name,
                namespace=server.resource_plan.namespace,
                node_id=pod.spec.node_name,
                phase=pod.status.phase or "Unknown",
                containers=containers,
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

    def update_tenant_quota(self, namespace: str, max_cpu: float, max_memory_mb: int, max_storage_gb: int, max_servers: int) -> None:
        cpu_str = str(int(max_cpu)) if max_cpu == int(max_cpu) else str(max_cpu)
        mem_str = f"{max_memory_mb // 1024}Gi" if max_memory_mb % 1024 == 0 else f"{max_memory_mb}Mi"
        hard = {
            "requests.cpu": cpu_str, "limits.cpu": cpu_str,
            "requests.memory": mem_str, "limits.memory": mem_str,
            "requests.storage": f"{max_storage_gb}Gi",
            "persistentvolumeclaims": str(max_servers),
            "pods": str(max_servers),
        }
        body = {"spec": {"hard": hard}}
        try:
            self._core.patch_namespaced_resource_quota("tenant-quota", namespace, body)
        except ApiException as exc:
            if exc.status == 404:
                pass  # 네임스페이스/쿼터가 아직 생성되지 않은 경우 무시
            else:
                raise

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

    # ── Version upgrade ───────────────────────────────────────────────────────
    def set_version(self, server_id: str, namespace: str, version: str) -> None:
        name = self._sts_name(server_id)
        sts = self._apps.read_namespaced_stateful_set(name, namespace)
        current = {e.name: (e.value or "") for e in (sts.spec.template.spec.containers[0].env or [])}
        current["VERSION"] = version
        new_env = [{"name": k, "value": v} for k, v in current.items()]
        self._apps.patch_namespaced_stateful_set(name, namespace, {
            "spec": {"template": {"spec": {"containers": [{"name": "minecraft", "env": new_env}]}}}
        })

    # ── Pod exec helper ──────────────────────────────────────────────────────
    def _exec_in_pod(self, server_id: str, namespace: str, command: list[str],
                     stdin_data: bytes | None = None) -> str:
        from kubernetes.stream import stream  # type: ignore[import-untyped]
        name = self._sts_name(server_id)
        pods = self._core.list_namespaced_pod(
            namespace, label_selector=f"app.kubernetes.io/name={name}"
        ).items
        if not pods:
            raise ValueError("파드가 실행 중이지 않습니다.")
        pod_name = pods[0].metadata.name
        resp = stream(
            self._core.connect_get_namespaced_pod_exec,
            pod_name, namespace,
            command=command,
            stdin=stdin_data is not None,
            stdout=True, stderr=True, tty=False,
            _preload_content=False,
        )
        if stdin_data is not None:
            resp.write_stdin(stdin_data.decode("utf-8", errors="replace"))
        out = ""
        while resp.is_open():
            resp.update(timeout=10)
            if resp.peek_stdout():
                out += resp.read_stdout()
        resp.close()
        return out

    # ── JVM memory ───────────────────────────────────────────────────────────
    def get_jvm(self, server_id: str, namespace: str) -> int:
        name = self._sts_name(server_id)
        try:
            sts = self._apps.read_namespaced_stateful_set(name, namespace)
            env = {e.name: (e.value or "") for e in (sts.spec.template.spec.containers[0].env or [])}
            raw = env.get("MEMORY", "0M")
            return int(raw.rstrip("MmGg")) if raw else 0
        except ApiException:
            return 0

    def set_jvm(self, server_id: str, namespace: str, memory_mb: int) -> None:
        name = self._sts_name(server_id)
        sts = self._apps.read_namespaced_stateful_set(name, namespace)
        current = {e.name: (e.value or "") for e in (sts.spec.template.spec.containers[0].env or [])}
        current["MEMORY"] = f"{memory_mb}M"
        new_env = [{"name": k, "value": v} for k, v in current.items()]
        self._apps.patch_namespaced_stateful_set(name, namespace, {
            "spec": {"template": {"spec": {"containers": [{"name": "minecraft", "env": new_env}]}}}
        })

    # ── server.properties ────────────────────────────────────────────────────
    def get_raw_properties(self, server_id: str, namespace: str) -> str:
        try:
            return self._exec_in_pod(server_id, namespace,
                                     ["cat", "/data/server.properties"])
        except Exception:
            return ""

    def set_raw_properties(self, server_id: str, namespace: str, content: str) -> None:
        self._exec_in_pod(server_id, namespace,
                          ["sh", "-c", "cat > /data/server.properties"],
                          stdin_data=content.encode("utf-8"))

    # ── World backups ─────────────────────────────────────────────────────────
    def list_backups(self, server_id: str, namespace: str) -> list[str]:
        try:
            out = self._exec_in_pod(server_id, namespace,
                ["sh", "-c", "ls /data/backups/*.tar.gz 2>/dev/null | xargs -I{} basename {} || true"])
            return [f.strip() for f in out.strip().splitlines() if f.strip().endswith(".tar.gz")]
        except Exception:
            return []

    def create_backup(self, server_id: str, namespace: str) -> str:
        from datetime import datetime, timezone
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        filename = f"world-{ts}.tar.gz"
        self._exec_in_pod(server_id, namespace, [
            "sh", "-c",
            f"mkdir -p /data/backups && "
            f"tar -czf /data/backups/{filename} -C /data "
            f"$(ls -d /data/world /data/world_nether /data/world_the_end 2>/dev/null | xargs -I{{}} basename {{}})"
            f" 2>/dev/null || true"
        ])
        return filename

    def restore_backup(self, server_id: str, namespace: str, filename: str) -> None:
        if "/" in filename or ".." in filename:
            raise ValueError("잘못된 파일명입니다.")
        self._exec_in_pod(server_id, namespace, [
            "sh", "-c",
            f"tar -xzf /data/backups/{filename} -C /data"
        ])

    def delete_backup(self, server_id: str, namespace: str, filename: str) -> None:
        if "/" in filename or ".." in filename:
            raise ValueError("잘못된 파일명입니다.")
        self._exec_in_pod(server_id, namespace, ["rm", f"/data/backups/{filename}"])

    # ── Plugin management ─────────────────────────────────────────────────────
    def list_plugins(self, server_id: str, namespace: str) -> list[str]:
        try:
            out = self._exec_in_pod(server_id, namespace,
                ["sh", "-c", "ls /data/plugins/*.jar 2>/dev/null | xargs -I{} basename {} || true"])
            return [f.strip() for f in out.strip().splitlines() if f.strip().endswith(".jar")]
        except Exception:
            return []

    def upload_plugin(self, server_id: str, namespace: str, filename: str, content: bytes) -> None:
        if "/" in filename or ".." in filename:
            raise ValueError("잘못된 파일명입니다.")
        import base64
        b64 = base64.b64encode(content).decode()
        self._exec_in_pod(server_id, namespace, [
            "sh", "-c",
            f"mkdir -p /data/plugins && echo '{b64}' | base64 -d > /data/plugins/{filename}"
        ])

    def delete_plugin(self, server_id: str, namespace: str, filename: str) -> None:
        if "/" in filename or ".." in filename:
            raise ValueError("잘못된 파일명입니다.")
        self._exec_in_pod(server_id, namespace, ["rm", f"/data/plugins/{filename}"])
