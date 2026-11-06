"""Real Kubernetes adapter using the kubernetes Python client."""
import os
import re
import socket
import struct
from typing import Literal

from kubernetes import client, config, utils  # type: ignore[import-untyped]
from kubernetes.client.rest import ApiException  # type: ignore[import-untyped]

from app.models.server import Node, PodContainer, ResourcePlan, Server, ServerPod
from app.services.file_paths import file_path, library_path
from app.services.gmod_storage import GMOD_ROOT, GMOD_IMAGE, gmod_file_init_container, gmod_volume_mounts

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
        self._networking = client.NetworkingV1Api(self._api_client)
        self._frp_public_ip = os.getenv("FRP_PUBLIC_IP", "")

    @staticmethod
    def _fresh_core() -> "client.CoreV1Api":
        """exec 호출마다 새 ApiClient 생성 — WebSocket이 커넥션 풀을 오염시키는 문제 방지."""
        return client.CoreV1Api(client.ApiClient())

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
        name = server.resource_plan.sts_name or self._sts_name(server.id)
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

    def _delete_resource(self, kind: str, name: str, namespace: str) -> None:
        try:
            if kind == "Service":
                self._core.delete_namespaced_service(name, namespace)
            elif kind == "StatefulSet":
                self._apps.delete_namespaced_stateful_set(name, namespace)
            elif kind == "PersistentVolumeClaim":
                self._core.delete_namespaced_persistent_volume_claim(name, namespace)
        except ApiException as exc:
            if exc.status != 404:
                raise

    def create(self, plan: ResourcePlan) -> str | None:
        for resource in plan.resources:
            kind = resource["kind"]
            ignore_conflict = kind in _SHARED_KINDS
            try:
                utils.create_from_dict(self._api_client, resource)
            except utils.FailToCreateError as exc:
                for err in exc.api_exceptions:
                    if err.status == 409 and not ignore_conflict:
                        name = resource["metadata"]["name"]
                        ns = resource["metadata"].get("namespace", plan.namespace)
                        self._delete_resource(kind, name, ns)
                        utils.create_from_dict(self._api_client, resource)
                    elif not (ignore_conflict and err.status == 409):
                        raise
        game_svc_name = next(
            (r["metadata"]["name"] for r in plan.resources
             if r.get("kind") == "Service" and r.get("spec", {}).get("type") == "NodePort"),
            None,
        )
        result = self._read_connection(plan.namespace, plan.target_node, game_svc_name)
        if result and game_svc_name and self._frp_public_ip:
            from app.services.frp import register_proxy
            try:
                register_proxy(game_svc_name, int(result.split(":")[-1]))
            except Exception:
                pass
        return result

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
            host = self._frp_public_ip or internal_ip
            return f"{host}:{node_port}" if host else None
        except Exception:
            return None

    def get_status(self, server_id: str, namespace: str, sts_name: str | None = None) -> str | None:
        name = sts_name or self._sts_name(server_id)
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

    def configure_gmod_rcon(
        self, server_id: str, namespace: str, password: str,
        sts_name: str | None = None,
    ) -> None:
        """Prepare an existing GMod pod template before scaling it back up."""
        name = sts_name or f"gmod-{server_id.replace('-', '')}"
        rcon_ingress = {"from": [{"namespaceSelector": {"matchLabels": {
            "kubernetes.io/metadata.name": "kubehost-system"}}}],
            "ports": [{"port": 27015, "protocol": "TCP"}]}
        policy_name = f"{name}-ingress"
        try:
            policy = self._networking.read_namespaced_network_policy(policy_name, namespace)
        except ApiException as exc:
            if exc.status != 404:
                raise
            self._networking.create_namespaced_network_policy(namespace, {
                "apiVersion": "networking.k8s.io/v1", "kind": "NetworkPolicy",
                "metadata": {"name": policy_name, "namespace": namespace},
                "spec": {"podSelector": {"matchLabels": {"app.kubernetes.io/name": name}},
                         "policyTypes": ["Ingress"],
                         "ingress": [
                             {"ports": [{"port": 27015, "protocol": "UDP"}]},
                             rcon_ingress,
                         ]},
            })
        else:
            ingress = [self._api_client.sanitize_for_serialization(rule)
                       for rule in (policy.spec.ingress or [])]
            if rcon_ingress not in ingress:
                self._networking.patch_namespaced_network_policy(
                    policy_name, namespace, {"spec": {"ingress": [*ingress, rcon_ingress]}}
                )

        sts = self._apps.read_namespaced_stateful_set(name, namespace)
        container = sts.spec.template.spec.containers[0]
        env = [self._api_client.sanitize_for_serialization(item) for item in (container.env or [])]
        values = {item["name"]: item.get("value", "") for item in env}
        args = re.sub(r"(?:^|\s)\+rcon_password\s+\S+", "", values.get("ARGS", "")).strip()
        args = f"{args} +rcon_password {password}".strip()
        updates = {"RCON_PASSWORD": password, "ARGS": args, "AUTOUPDATE": "0"}
        old_mounts = [self._api_client.sanitize_for_serialization(item)
                      for item in (container.volume_mounts or [])]
        if not any(item["name"] == "data" for item in old_mounts):
            raise ValueError("GMod 데이터 볼륨 마운트를 찾을 수 없습니다.")
        mounts = [item for item in old_mounts if item["name"] != "data"] + gmod_volume_mounts()
        init_containers = sts.spec.template.spec.init_containers or []
        needs_init = not any(item.name == "prepare-gmod-files" for item in init_containers)
        if old_mounts != mounts or needs_init or any(
            values.get(key) != value for key, value in updates.items()
        ):
            env = [item for item in env if item["name"] not in updates]
            env.extend({"name": key, "value": value} for key, value in updates.items())
            pod_patch: dict = {"containers": [{
                "name": container.name, "env": env,
                "volumeMounts": [{"$patch": "replace"}, *mounts],
            }]}
            if needs_init:
                pod_patch["initContainers"] = [gmod_file_init_container()]
            self._apps.patch_namespaced_stateful_set(name, namespace, {
                "spec": {"template": {"spec": pod_patch}}
            })

    def set_state(self, server_id: str, namespace: str, state: Literal["running", "stopped"], sts_name: str | None = None) -> None:
        name = sts_name or self._sts_name(server_id)
        replicas = 1 if state == "running" else 0
        self._apps.patch_namespaced_stateful_set(name, namespace, {"spec": {"replicas": replicas}})

    def logs(self, server_id: str, namespace: str, tail: int = 300, sts_name: str | None = None) -> list[str]:
        name = sts_name or self._sts_name(server_id)
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

    def get_settings(self, server_id: str, namespace: str, sts_name: str | None = None) -> dict[str, str]:
        name = sts_name or self._sts_name(server_id)
        try:
            sts = self._apps.read_namespaced_stateful_set(name, namespace)
            env = {e.name: (e.value or "") for e in (sts.spec.template.spec.containers[0].env or [])}
            return {k.lower(): env.get(k, "") for k in self._SETTINGS_KEYS}
        except ApiException:
            return {}

    def patch_settings(self, server_id: str, namespace: str, updates: dict[str, str], sts_name: str | None = None) -> None:
        name = sts_name or self._sts_name(server_id)
        sts = self._apps.read_namespaced_stateful_set(name, namespace)
        current = {e.name: (e.value or "") for e in (sts.spec.template.spec.containers[0].env or [])}
        current.update(updates)
        new_env = [{"name": k, "value": v} for k, v in current.items()]
        container_name = sts.spec.template.spec.containers[0].name
        self._apps.patch_namespaced_stateful_set(name, namespace, {
            "spec": {"template": {"spec": {"containers": [{"name": container_name, "env": new_env}]}}}
        })

    def rcon(
        self, server_id: str, namespace: str, command: str,
        sts_name: str | None = None, port: int = 25575,
    ) -> str:
        name = sts_name or self._sts_name(server_id)
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
        if not password:
            raise ValueError("RCON이 설정되지 않았습니다. 서버를 중지한 뒤 다시 시작하세요.")

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
            if length < 10 or length > 4 * 1024 * 1024:
                raise ValueError("RCON 응답 크기가 올바르지 않습니다.")
            body = recv_exact(sock, length)
            req_id, ptype = struct.unpack("<ii", body[:8])
            payload = body[8:-2].decode("utf-8", errors="replace")
            return req_id, ptype, payload

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(5.0)
            sock.connect((pod_ip, port))
            send_packet(sock, 1, 3, password)
            for _ in range(3):
                auth_id, auth_type, _ = recv_packet(sock)
                if auth_id == -1:
                    raise ValueError("RCON 인증 실패")
                if auth_id == 1 and auth_type == 2:
                    break
            else:
                raise ValueError("RCON 인증 응답이 올바르지 않습니다.")
            send_packet(sock, 2, 2, command)
            if port == 27015:
                # Source RCON can split output; an empty response-value request
                # produces a sentinel after the command's final packet.
                send_packet(sock, 3, 0, "")
                responses: list[str] = []
                for _ in range(64):
                    response_id, _, response = recv_packet(sock)
                    if response_id == 2:
                        responses.append(response)
                    elif response_id == 3 and response:
                        return "".join(responses)
                raise ValueError("RCON 응답이 너무 깁니다.")
            for _ in range(3):
                response_id, _, response = recv_packet(sock)
                if response_id == 2:
                    return response
            raise ValueError("RCON 명령 응답이 올바르지 않습니다.")

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

    def delete(self, server_id: str, namespace: str, delete_data: bool, sts_name: str | None = None) -> None:
        name = sts_name or self._sts_name(server_id)
        if self._frp_public_ip:
            from app.services.frp import unregister_proxy
            unregister_proxy(f"{name}-game")
        if name.startswith("gmod-"):
            try:
                self._networking.delete_namespaced_network_policy(f"{name}-ingress", namespace)
            except ApiException as exc:
                if exc.status != 404:
                    raise
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
    def set_version(self, server_id: str, namespace: str, version: str, sts_name: str | None = None) -> None:
        name = sts_name or self._sts_name(server_id)
        sts = self._apps.read_namespaced_stateful_set(name, namespace)
        current = {e.name: (e.value or "") for e in (sts.spec.template.spec.containers[0].env or [])}
        current["VERSION"] = version
        new_env = [{"name": k, "value": v} for k, v in current.items()]
        self._apps.patch_namespaced_stateful_set(name, namespace, {
            "spec": {"template": {"spec": {"containers": [{"name": "minecraft", "env": new_env}]}}}
        })

    # ── Pod exec helper ──────────────────────────────────────────────────────
    def _exec_in_pod(self, server_id: str, namespace: str, command: list[str],
                     stdin_data: bytes | None = None, sts_name: str | None = None) -> str:
        from kubernetes.stream import stream  # type: ignore[import-untyped]
        core = self._fresh_core()
        name = sts_name or self._sts_name(server_id)
        pods = core.list_namespaced_pod(
            namespace, label_selector=f"app.kubernetes.io/name={name}"
        ).items
        if not pods:
            raise ValueError("파드가 실행 중이지 않습니다.")
        pod_name = pods[0].metadata.name
        resp = stream(
            core.connect_get_namespaced_pod_exec,
            pod_name, namespace,
            command=command,
            stdin=stdin_data is not None,
            stdout=True, stderr=True, tty=False,
            _preload_content=False,
        )
        if stdin_data is not None:
            _CHUNK = 256 * 1024  # 256 KB — WebSocket 내부 버퍼 폭발 방지
            for _off in range(0, len(stdin_data), _CHUNK):
                resp.write_stdin(stdin_data[_off:_off + _CHUNK])
        out = ""
        err = ""
        while resp.is_open():
            resp.update(timeout=60)
            if resp.peek_stdout():
                out += resp.read_stdout()
            if resp.peek_stderr():
                err += resp.read_stderr()
        returncode = resp.returncode
        resp.close()
        if returncode not in (0, None):
            raise ValueError(err.strip() or f"파드 명령이 실패했습니다 ({returncode}).")
        return out

    # ── JVM memory ───────────────────────────────────────────────────────────
    def get_jvm(self, server_id: str, namespace: str, sts_name: str | None = None) -> int:
        name = sts_name or self._sts_name(server_id)
        try:
            sts = self._apps.read_namespaced_stateful_set(name, namespace)
            env = {e.name: (e.value or "") for e in (sts.spec.template.spec.containers[0].env or [])}
            raw = env.get("MEMORY", "0M")
            return int(raw.rstrip("MmGg")) if raw else 0
        except ApiException:
            return 0

    def set_jvm(self, server_id: str, namespace: str, memory_mb: int, sts_name: str | None = None) -> None:
        name = sts_name or self._sts_name(server_id)
        sts = self._apps.read_namespaced_stateful_set(name, namespace)
        current = {e.name: (e.value or "") for e in (sts.spec.template.spec.containers[0].env or [])}
        current["MEMORY"] = f"{memory_mb}M"
        new_env = [{"name": k, "value": v} for k, v in current.items()]
        self._apps.patch_namespaced_stateful_set(name, namespace, {
            "spec": {"template": {"spec": {"containers": [{"name": "minecraft", "env": new_env}]}}}
        })

    def get_auto_restart(self, server_id: str, namespace: str, sts_name: str | None = None) -> bool:
        name = sts_name or self._sts_name(server_id)
        try:
            sts = self._apps.read_namespaced_stateful_set(name, namespace)
            env = {e.name: (e.value or "") for e in (sts.spec.template.spec.containers[0].env or [])}
            return env.get("RESTART_ON_CRASH", "false").lower() == "true"
        except Exception:
            return False

    def set_auto_restart(self, server_id: str, namespace: str, enabled: bool, sts_name: str | None = None) -> None:
        name = sts_name or self._sts_name(server_id)
        sts = self._apps.read_namespaced_stateful_set(name, namespace)
        current = {e.name: (e.value or "") for e in (sts.spec.template.spec.containers[0].env or [])}
        current["RESTART_ON_CRASH"] = "true" if enabled else "false"
        new_env = [{"name": k, "value": v} for k, v in current.items()]
        self._apps.patch_namespaced_stateful_set(name, namespace, {
            "spec": {"template": {"spec": {"containers": [{"name": "minecraft", "env": new_env}]}}}
        })

    # ── server.properties ────────────────────────────────────────────────────
    def get_raw_properties(self, server_id: str, namespace: str, sts_name: str | None = None) -> str:
        try:
            return self._exec_in_pod(server_id, namespace,
                                     ["cat", "/data/server.properties"], sts_name=sts_name)
        except Exception:
            return ""

    def set_raw_properties(self, server_id: str, namespace: str, content: str, sts_name: str | None = None) -> None:
        self._exec_in_pod(server_id, namespace,
                          ["sh", "-c", "cat > /data/server.properties"],
                          stdin_data=content.encode("utf-8"), sts_name=sts_name)

    # ── World backups ─────────────────────────────────────────────────────────
    def list_backups(self, server_id: str, namespace: str, sts_name: str | None = None) -> list[str]:
        try:
            out = self._exec_in_pod(server_id, namespace,
                ["sh", "-c", "ls /data/backups/*.tar.gz 2>/dev/null | xargs -I{} basename {} || true"],
                sts_name=sts_name)
            return [f.strip() for f in out.strip().splitlines() if f.strip().endswith(".tar.gz")]
        except Exception:
            return []

    def create_backup(self, server_id: str, namespace: str, sts_name: str | None = None) -> str:
        from datetime import datetime, timezone
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        filename = f"world-{ts}.tar.gz"
        self._exec_in_pod(server_id, namespace, [
            "sh", "-c",
            f"mkdir -p /data/backups && "
            f"tar -czf /data/backups/{filename} -C /data "
            f"$(ls -d /data/world /data/world_nether /data/world_the_end 2>/dev/null | xargs -I{{}} basename {{}})"
            f" 2>/dev/null || true"
        ], sts_name=sts_name)
        return filename

    def restore_backup(self, server_id: str, namespace: str, filename: str, sts_name: str | None = None) -> None:
        if "/" in filename or ".." in filename:
            raise ValueError("잘못된 파일명입니다.")
        self._exec_in_pod(server_id, namespace, [
            "sh", "-c",
            f"tar -xzf /data/backups/{filename} -C /data"
        ], sts_name=sts_name)

    def delete_backup(self, server_id: str, namespace: str, filename: str, sts_name: str | None = None) -> None:
        if "/" in filename or ".." in filename:
            raise ValueError("잘못된 파일명입니다.")
        self._exec_in_pod(server_id, namespace, ["rm", f"/data/backups/{filename}"], sts_name=sts_name)

    # ── Plugin management ─────────────────────────────────────────────────────
    def list_plugins(self, server_id: str, namespace: str, sts_name: str | None = None) -> list[str]:
        try:
            out = self._exec_in_pod(server_id, namespace,
                ["sh", "-c", "ls /data/plugins/*.jar 2>/dev/null | xargs -I{} basename {} || true"],
                sts_name=sts_name)
            return [f.strip() for f in out.strip().splitlines() if f.strip().endswith(".jar")]
        except Exception:
            return []

    def upload_plugin(self, server_id: str, namespace: str, filename: str, content: bytes, sts_name: str | None = None) -> None:
        if "/" in filename or ".." in filename:
            raise ValueError("잘못된 파일명입니다.")
        import base64
        b64 = base64.b64encode(content).decode()
        self._exec_in_pod(server_id, namespace, [
            "sh", "-c",
            f"mkdir -p /data/plugins && echo '{b64}' | base64 -d > /data/plugins/{filename}"
        ], sts_name=sts_name)

    def delete_plugin(self, server_id: str, namespace: str, filename: str, sts_name: str | None = None) -> None:
        if "/" in filename or ".." in filename:
            raise ValueError("잘못된 파일명입니다.")
        self._exec_in_pod(server_id, namespace, ["rm", f"/data/plugins/{filename}"], sts_name=sts_name)

    # ── File Manager ─────────────────────────────────────────────────────────

    def _require_gmod_file_mount(self, server_id: str, namespace: str, sts_name: str | None) -> None:
        name = sts_name or f"gmod-{server_id.replace('-', '')}"
        sts = self._apps.read_namespaced_stateful_set(name, namespace)
        mounts = sts.spec.template.spec.containers[0].volume_mounts or []
        if not any(m.mount_path == GMOD_ROOT and m.sub_path == "game-files" for m in mounts):
            raise ValueError("GMod 파일 매니저를 사용하려면 서버를 중지한 뒤 다시 시작하세요.")
        pods = self._core.list_namespaced_pod(
            namespace, label_selector=f"app.kubernetes.io/name={name}"
        ).items
        for pod in pods:
            if pod.status.phase != "Running":
                continue
            pod_mounts = pod.spec.containers[0].volume_mounts or []
            if not any(m.mount_path == GMOD_ROOT and m.sub_path == "game-files" for m in pod_mounts):
                raise ValueError("GMod 파드가 새 파일 저장소로 재시작되기를 기다려 주세요.")

    def _pvc_name(self, server_id: str, sts_name: str | None = None) -> str:
        return f"data-{sts_name or self._sts_name(server_id)}-0"

    def _get_server_node(self, server_id: str, namespace: str, sts_name: str | None = None) -> str:
        name = sts_name or self._sts_name(server_id)
        try:
            sts = self._apps.read_namespaced_stateful_set(name, namespace)
            ns_map = sts.spec.template.spec.node_selector or {}
            return ns_map.get("kubernetes.io/hostname", "")
        except ApiException:
            return ""

    def _exec_in_temp_pod(
        self, namespace: str, pvc_name: str, node_name: str,
        command: list[str], stdin_data: bytes | None = None,
        game: str = "minecraft-java",
    ) -> str:
        import time
        from uuid import uuid4
        from kubernetes.stream import stream  # type: ignore[import-untyped]

        pod_name = f"kubehost-fs-{uuid4().hex[:8]}"
        gmod = game == "garrysmod"
        library = game == "library"
        image = GMOD_IMAGE if gmod else "itzg/minecraft-server:latest"
        if gmod:
            mounts = gmod_volume_mounts()
        elif library:
            mounts = [{"name": "data", "mountPath": "/library"}]
        else:
            mounts = [{"name": "data", "mountPath": "/data"}]
        pod_body = {
            "apiVersion": "v1", "kind": "Pod",
            "metadata": {
                "name": pod_name, "namespace": namespace,
                "labels": {"app.kubernetes.io/managed-by": "kubehost",
                           "kubehost.io/role": "filemanager"},
            },
            "spec": {
                "restartPolicy": "Never",
                "activeDeadlineSeconds": 360,
                "automountServiceAccountToken": False,
                "securityContext": {
                    "runAsNonRoot": True, "runAsUser": 1000, "runAsGroup": 1000,
                    "fsGroup": 1000, "seccompProfile": {"type": "RuntimeDefault"},
                },
                **({"nodeSelector": {"kubernetes.io/hostname": node_name}} if node_name else {}),
                **({"initContainers": [gmod_file_init_container()]} if gmod else {}),
                "containers": [{
                    "name": "fs",
                    "image": image,
                    "command": ["/bin/sh", "-c", "sleep 300"],
                    "securityContext": {
                        "allowPrivilegeEscalation": False,
                        "capabilities": {"drop": ["ALL"]},
                    },
                    "volumeMounts": mounts,
                }],
                "volumes": [{"name": "data", "persistentVolumeClaim": {"claimName": pvc_name}}],
            },
        }
        core = self._fresh_core()
        try:
            core.create_namespaced_pod(namespace, pod_body)
            for _ in range(300 if gmod else 30):
                pod = core.read_namespaced_pod(pod_name, namespace)
                phase = (pod.status.phase if pod.status else None)
                cs = (pod.status.container_statuses or []) if pod.status else []
                if phase == "Running" and cs and cs[0].ready:
                    break
                time.sleep(1)
            else:
                raise RuntimeError("임시 파드 준비 타임아웃 (30초)")

            resp = stream(
                core.connect_get_namespaced_pod_exec,
                pod_name, namespace,
                command=command,
                stdin=stdin_data is not None,
                stdout=True, stderr=True, tty=False,
                _preload_content=False,
            )
            if stdin_data is not None:
                _CHUNK = 256 * 1024
                for _off in range(0, len(stdin_data), _CHUNK):
                    resp.write_stdin(stdin_data[_off:_off + _CHUNK])
            out = ""
            err = ""
            while resp.is_open():
                resp.update(timeout=15)
                if resp.peek_stdout():
                    out += resp.read_stdout()
                if resp.peek_stderr():
                    err += resp.read_stderr()
            returncode = resp.returncode
            resp.close()
            if returncode not in (0, None):
                raise ValueError(err.strip() or f"임시 파드 명령이 실패했습니다 ({returncode}).")
            return out
        finally:
            try:
                core.delete_namespaced_pod(pod_name, namespace)
            except Exception:
                pass

    def _exec_anywhere(
        self, server_id: str, namespace: str,
        command: list[str], stdin_data: bytes | None = None,
        sts_name: str | None = None,
        game: str = "minecraft-java",
    ) -> str:
        """실행 중인 파드 우선, 없으면 임시 파드로 폴백."""
        try:
            return self._exec_in_pod(server_id, namespace, command, stdin_data, sts_name)
        except ValueError:
            pvc = self._pvc_name(server_id, sts_name)
            node = self._get_server_node(server_id, namespace, sts_name)
            return self._exec_in_temp_pod(namespace, pvc, node, command, stdin_data, game)

    _MAX_FILE_BYTES = 1024 * 1024 * 1024  # 1 GiB

    def list_files(self, server_id: str, namespace: str, path: str, sts_name: str | None = None, game: str = "minecraft-java") -> list[dict]:
        safe = file_path(game, path)
        if game == "garrysmod":
            self._require_gmod_file_mount(server_id, namespace, sts_name)
        # glob for loop — 파이프 없이 안정적으로 각 항목을 출력
        cmd = [
            "sh", "-c",
            f"for fp in '{safe}'/* '{safe}'/.*; do "
            f"  [ -e \"$fp\" ] || continue; "
            f"  name=$(basename \"$fp\"); "
            f"  [ \"$name\" = '.' ] || [ \"$name\" = '..' ] && continue; "
            f"  if [ -d \"$fp\" ]; then t=d; else t=f; fi; "
            f"  sz=$(stat -c %s \"$fp\" 2>/dev/null || echo 0); "
            f"  mt=$(stat -c %Y \"$fp\" 2>/dev/null || echo 0); "
            f"  printf '%s\\t%s\\t%s\\t%s\\n' \"$t\" \"$sz\" \"$mt\" \"$name\"; "
            f"done",
        ]
        out = self._exec_anywhere(server_id, namespace, cmd, sts_name=sts_name, game=game)
        entries = []
        for line in out.strip().splitlines():
            parts = line.split("\t", 3)
            if len(parts) != 4:
                continue
            ftype, size_s, mtime_s, name = parts
            name = name.strip()
            if not name or name in (".", ".."):
                continue
            entries.append({
                "name": name,
                "type": "dir" if ftype.strip() == "d" else "file",
                "size": int(size_s) if size_s.strip().isdigit() else 0,
                "modified": int(mtime_s) if mtime_s.strip().isdigit() else 0,
            })
        return sorted(entries, key=lambda e: (e["type"] == "file", e["name"].lower()))

    def read_file(self, server_id: str, namespace: str, path: str, sts_name: str | None = None, game: str = "minecraft-java") -> bytes:
        import base64
        safe = file_path(game, path)
        if game == "garrysmod":
            self._require_gmod_file_mount(server_id, namespace, sts_name)
        size_out = self._exec_anywhere(server_id, namespace,
            ["sh", "-c", f"stat -c %s '{safe}' 2>/dev/null || echo 0"], sts_name=sts_name, game=game)
        size = int(size_out.strip()) if size_out.strip().isdigit() else 0
        if size > self._MAX_FILE_BYTES:
            raise ValueError(f"파일이 너무 큽니다 ({size // (1024 * 1024)} MiB, 최대 1 GiB).")
        out = self._exec_anywhere(server_id, namespace,
            ["sh", "-c", f"base64 -w 0 '{safe}' 2>/dev/null"], sts_name=sts_name, game=game)
        return base64.b64decode(out.strip())

    def write_file(self, server_id: str, namespace: str, path: str, content: bytes, sts_name: str | None = None, game: str = "minecraft-java") -> None:
        if len(content) > self._MAX_FILE_BYTES:
            raise ValueError(f"파일이 너무 큽니다 ({len(content) // (1024 * 1024)} MiB, 최대 1 GiB).")
        safe = file_path(game, path, write=True)
        if game == "garrysmod":
            self._require_gmod_file_mount(server_id, namespace, sts_name)
        parent = safe.rsplit("/", 1)[0] or "/data"
        # head -c N reads exactly N bytes from stdin then exits → EOF 대기 없음, base64 오버헤드 없음
        self._exec_anywhere(server_id, namespace,
            ["sh", "-c", f"mkdir -p '{parent}' && head -c {len(content)} > '{safe}'"],
            stdin_data=content, sts_name=sts_name, game=game)

    def delete_path(self, server_id: str, namespace: str, path: str, sts_name: str | None = None, game: str = "minecraft-java") -> None:
        safe = file_path(game, path, write=True)
        if game == "garrysmod":
            self._require_gmod_file_mount(server_id, namespace, sts_name)
            if safe in {f"{GMOD_ROOT}/{folder}" for folder in ("data", "addons", "cfg")}:
                raise ValueError("마운트된 폴더는 삭제할 수 없습니다.")
        self._exec_anywhere(server_id, namespace, ["sh", "-c", f"rm -rf '{safe}'"], sts_name=sts_name, game=game)

    def mkdir(self, server_id: str, namespace: str, path: str, sts_name: str | None = None, game: str = "minecraft-java") -> None:
        safe = file_path(game, path, write=True)
        if game == "garrysmod":
            self._require_gmod_file_mount(server_id, namespace, sts_name)
        self._exec_anywhere(server_id, namespace, ["sh", "-c", f"mkdir -p '{safe}'"], sts_name=sts_name, game=game)

    def extract(self, server_id: str, namespace: str, path: str, sts_name: str | None = None, game: str = "minecraft-java") -> None:
        safe = file_path(game, path)
        if not safe.endswith(".zip"):
            raise ValueError("ZIP 파일만 압축 해제할 수 있습니다.")
        if game == "garrysmod":
            self._require_gmod_file_mount(server_id, namespace, sts_name)
        dest = safe.rsplit("/", 1)[0]
        self._exec_anywhere(
            server_id, namespace,
            ["sh", "-c", f"unzip -o '{safe}' -d '{dest}'"],
            sts_name=sts_name, game=game,
        )

    # ── Library ───────────────────────────────────────────────────────────────

    def _get_pvc_node(self, namespace: str, pvc_name: str) -> str:
        try:
            pvc = self._core.read_namespaced_persistent_volume_claim(pvc_name, namespace)
            pv_name = pvc.spec.volume_name
            if not pv_name:
                return ""
            pv = self._core.read_persistent_volume(pv_name)
            affinity = pv.spec.node_affinity
            if affinity and affinity.required:
                for term in (affinity.required.node_selector_terms or []):
                    for expr in (term.match_expressions or []):
                        if expr.key == "kubernetes.io/hostname" and expr.values:
                            return expr.values[0]
            return ""
        except ApiException:
            return ""

    def _ensure_library_namespace(self, namespace: str) -> None:
        try:
            self._core.read_namespace(namespace)
        except ApiException as exc:
            if exc.status != 404:
                raise
            try:
                self._core.create_namespace({
                    "apiVersion": "v1", "kind": "Namespace",
                    "metadata": {"name": namespace, "labels": {
                        "pod-security.kubernetes.io/enforce": "baseline"}},
                })
            except ApiException as ce:
                if ce.status != 409:
                    raise

    def _ensure_library_pvc(self, namespace: str) -> None:
        self._ensure_library_namespace(namespace)
        try:
            self._core.read_namespaced_persistent_volume_claim("library", namespace)
        except ApiException as exc:
            if exc.status != 404:
                raise
            self._core.create_namespaced_persistent_volume_claim(namespace, {
                "apiVersion": "v1", "kind": "PersistentVolumeClaim",
                "metadata": {"name": "library", "namespace": namespace},
                "spec": {
                    "accessModes": ["ReadWriteOnce"],
                    "storageClassName": "kubehost-local",
                    "resources": {"requests": {"storage": "10Gi"}},
                },
            })

    def _exec_in_library_pod(self, namespace: str, command: list[str], stdin_data: bytes | None = None) -> str:
        self._ensure_library_pvc(namespace)
        node = self._get_pvc_node(namespace, "library")
        return self._exec_in_temp_pod(namespace, "library", node, command, stdin_data, game="library")

    def library_ensure(self, namespace: str) -> None:
        self._ensure_library_pvc(namespace)

    def library_list_files(self, namespace: str, path: str) -> list[dict]:
        safe = library_path(path)
        cmd = ["sh", "-c",
            f"for fp in '{safe}'/* '{safe}'/.*; do "
            f"  [ -e \"$fp\" ] || continue; "
            f"  name=$(basename \"$fp\"); "
            f"  [ \"$name\" = '.' ] || [ \"$name\" = '..' ] && continue; "
            f"  if [ -d \"$fp\" ]; then t=d; else t=f; fi; "
            f"  sz=$(stat -c %s \"$fp\" 2>/dev/null || echo 0); "
            f"  mt=$(stat -c %Y \"$fp\" 2>/dev/null || echo 0); "
            f"  printf '%s\\t%s\\t%s\\t%s\\n' \"$t\" \"$sz\" \"$mt\" \"$name\"; "
            f"done"]
        out = self._exec_in_library_pod(namespace, cmd)
        entries = []
        for line in out.strip().splitlines():
            parts = line.split("\t", 3)
            if len(parts) != 4:
                continue
            ftype, size_s, mtime_s, name = parts
            name = name.strip()
            if not name or name in (".", ".."):
                continue
            entries.append({
                "name": name,
                "type": "dir" if ftype.strip() == "d" else "file",
                "size": int(size_s) if size_s.strip().isdigit() else 0,
                "modified": int(mtime_s) if mtime_s.strip().isdigit() else 0,
            })
        return sorted(entries, key=lambda e: (e["type"] == "file", e["name"].lower()))

    def library_read_file(self, namespace: str, path: str) -> bytes:
        import base64
        safe = library_path(path)
        out = self._exec_in_library_pod(namespace, ["sh", "-c", f"base64 -w 0 '{safe}' 2>/dev/null"])
        return base64.b64decode(out.strip())

    def library_write_file(self, namespace: str, path: str, content: bytes) -> None:
        if len(content) > self._MAX_FILE_BYTES:
            raise ValueError("파일이 너무 큽니다.")
        safe = library_path(path, write=True)
        parent = safe.rsplit("/", 1)[0] or "/library"
        self._exec_in_library_pod(namespace,
            ["sh", "-c", f"mkdir -p '{parent}' && head -c {len(content)} > '{safe}'"],
            stdin_data=content)

    def library_delete_path(self, namespace: str, path: str) -> None:
        safe = library_path(path, write=True)
        self._exec_in_library_pod(namespace, ["sh", "-c", f"rm -rf '{safe}'"])

    def library_mkdir(self, namespace: str, path: str) -> None:
        safe = library_path(path, write=True)
        self._exec_in_library_pod(namespace, ["sh", "-c", f"mkdir -p '{safe}'"])

    def library_extract(self, namespace: str, path: str) -> None:
        safe = library_path(path)
        if not safe.endswith(".zip"):
            raise ValueError("ZIP 파일만 압축 해제할 수 있습니다.")
        dest = safe.rsplit("/", 1)[0]
        self._exec_in_library_pod(namespace, ["sh", "-c", f"unzip -o '{safe}' -d '{dest}'"])

    def library_storage(self, namespace: str) -> dict:
        self._ensure_library_pvc(namespace)
        try:
            pvc = self._core.read_namespaced_persistent_volume_claim("library", namespace)
            raw = (pvc.spec.resources.requests or {}).get("storage", "10Gi")
            if raw.endswith("Gi"):
                total = int(raw[:-2]) * 1024 ** 3
            elif raw.endswith("Mi"):
                total = int(raw[:-2]) * 1024 ** 2
            else:
                total = 10 * 1024 ** 3
        except Exception:
            total = 10 * 1024 ** 3
        try:
            out = self._exec_in_library_pod(namespace, ["sh", "-c", "du -sb /library 2>/dev/null | cut -f1"])
            used = int(out.strip()) if out.strip().isdigit() else 0
        except Exception:
            used = 0
        return {"used_bytes": used, "total_bytes": total}

    # ── PVC copy (clone) ──────────────────────────────────────────────────────

    def copy_pvc_files(self, src_namespace: str, src_pvc: str, dst_namespace: str, dst_pvc: str) -> None:
        """두 PVC를 동시에 마운트하는 임시 파드를 띄워 cp -a /src/. /dst/ 를 실행한다."""
        import time
        from uuid import uuid4

        node_name = self._get_pvc_node(src_namespace, src_pvc)
        pod_name = f"kubehost-clone-{uuid4().hex[:8]}"
        pod_body = {
            "apiVersion": "v1", "kind": "Pod",
            "metadata": {
                "name": pod_name, "namespace": src_namespace,
                "labels": {"app.kubernetes.io/managed-by": "kubehost",
                           "kubehost.io/role": "clone"},
            },
            "spec": {
                "restartPolicy": "Never",
                "activeDeadlineSeconds": 360,
                "automountServiceAccountToken": False,
                "securityContext": {
                    "runAsNonRoot": True, "runAsUser": 1000, "runAsGroup": 1000,
                    "fsGroup": 1000, "seccompProfile": {"type": "RuntimeDefault"},
                },
                **({"nodeSelector": {"kubernetes.io/hostname": node_name}} if node_name else {}),
                "containers": [{
                    "name": "copy",
                    "image": "busybox:stable",
                    "command": ["sh", "-c", "cp -a /src/. /dst/ && echo done"],
                    "securityContext": {
                        "allowPrivilegeEscalation": False,
                        "capabilities": {"drop": ["ALL"]},
                    },
                    "volumeMounts": [
                        {"name": "src", "mountPath": "/src"},
                        {"name": "dst", "mountPath": "/dst"},
                    ],
                }],
                "volumes": [
                    {"name": "src", "persistentVolumeClaim": {"claimName": src_pvc}},
                    {"name": "dst", "persistentVolumeClaim": {"claimName": dst_pvc}},
                ],
            },
        }
        core = self._fresh_core()
        try:
            core.create_namespaced_pod(src_namespace, pod_body)
            for _ in range(300):
                pod = core.read_namespaced_pod(pod_name, src_namespace)
                phase = pod.status.phase if pod.status else None
                if phase == "Succeeded":
                    break
                if phase in ("Failed", "Unknown"):
                    raise RuntimeError(f"파일 복사 파드가 실패했습니다 (phase={phase}).")
                time.sleep(1)
            else:
                raise RuntimeError("파일 복사 타임아웃 (300초).")
        finally:
            try:
                core.delete_namespaced_pod(pod_name, src_namespace)
            except Exception:
                pass

    # ── Template snapshot / restore ───────────────────────────────────────────

    def snapshot_pvc_to_library(self, server_id: str, namespace: str, library_namespace: str,
                                archive_path: str, sts_name: str | None = None,
                                game: str = "minecraft-java") -> None:
        """서버 PVC 내용을 tar.gz로 묶어 라이브러리에 저장한다.

        namespace 경계를 넘기 위해:
          1. 서버 namespace의 임시 파드에서 tar czf → stdout (stdin_data 없음)으로 읽기
          2. library_write_file()로 라이브러리 PVC에 저장
        """
        pvc = self._pvc_name(server_id, sts_name)
        node = self._get_server_node(server_id, namespace, sts_name)
        # tar 결과를 stdout으로 출력 (바이너리를 base64로 감싸 텍스트로 전달)
        cmd = ["sh", "-c", "tar czf - -C /data . 2>/dev/null | base64 -w 0"]
        b64_out = self._exec_in_temp_pod(namespace, pvc, node, cmd, game=game)
        import base64
        archive_bytes = base64.b64decode(b64_out.strip())
        if len(archive_bytes) > self._MAX_FILE_BYTES:
            raise ValueError(
                f"스냅샷 크기가 너무 큽니다 ({len(archive_bytes) // (1024 * 1024)} MiB, 최대 1 GiB)."
            )
        self.library_write_file(library_namespace, archive_path, archive_bytes)

    def restore_library_to_pvc(self, server_id: str, namespace: str, library_namespace: str,
                               archive_path: str, sts_name: str | None = None,
                               game: str = "minecraft-java") -> None:
        """라이브러리의 tar.gz를 서버 PVC에 복원한다.

        namespace 경계를 넘기 위해:
          1. library_read_file()로 tar.gz 읽기
          2. 서버 namespace의 임시 파드에 stdin으로 전달하여 tar xzf
        """
        archive_bytes = self.library_read_file(library_namespace, archive_path)
        pvc = self._pvc_name(server_id, sts_name)
        node = self._get_server_node(server_id, namespace, sts_name)
        cmd = ["sh", "-c", "tar xzf - -C /data 2>/dev/null"]
        self._exec_in_temp_pod(namespace, pvc, node, cmd, stdin_data=archive_bytes, game=game)
