import socket
import struct
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.adapters.k8s import K8sAdapter
from app.adapters.mock import InMemoryServerRepository, MockKubernetesAdapter
from app.models.server import ServerCreate
from app.services.servers import ServerService
from app.services.gmod_storage import gmod_file_init_container, gmod_volume_mounts


def _packet(request_id: int, packet_type: int, payload: str = "") -> bytes:
    body = struct.pack("<ii", request_id, packet_type) + payload.encode() + b"\x00\x00"
    return struct.pack("<i", len(body)) + body


def test_gmod_rcon_authenticates_and_uses_source_port(monkeypatch):
    adapter = object.__new__(K8sAdapter)
    adapter._core = MagicMock()
    adapter._apps = MagicMock()
    adapter._core.list_namespaced_pod.return_value.items = [
        SimpleNamespace(status=SimpleNamespace(pod_ip="10.42.1.2"))
    ]
    adapter._apps.read_namespaced_stateful_set.return_value.spec.template.spec.containers = [
        SimpleNamespace(env=[SimpleNamespace(name="RCON_PASSWORD", value="secret")])
    ]
    adapter._apps.read_namespaced_stateful_set.return_value.spec.template.spec.init_containers = []

    class FakeSocket:
        def __init__(self):
            self.incoming = (
                _packet(1, 0) + _packet(1, 2)
                + _packet(2, 0, "hostname: ") + _packet(2, 0, "Test")
                + _packet(3, 0) + _packet(3, 0, "\x00\x01\x00\x00")
            )
            self.sent = []
            self.address = None

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            pass

        def settimeout(self, _timeout):
            pass

        def connect(self, address):
            self.address = address

        def sendall(self, data):
            self.sent.append(data)

        def recv(self, size):
            chunk, self.incoming = self.incoming[:size], self.incoming[size:]
            return chunk

    fake_socket = FakeSocket()
    monkeypatch.setattr(socket, "socket", lambda *_args: fake_socket)

    assert adapter.rcon("server-id", "tenant", "status", sts_name="gmod-id", port=27015) == "hostname: Test"
    assert fake_socket.address == ("10.42.1.2", 27015)
    assert fake_socket.sent == [
        _packet(1, 3, "secret"), _packet(2, 2, "status"), _packet(3, 0),
    ]


def test_existing_gmod_gets_rcon_settings_before_start():
    adapter = object.__new__(K8sAdapter)
    adapter._api_client = MagicMock()
    def serialize(item):
        if hasattr(item, "mount_path"):
            return {"name": item.name, "mountPath": item.mount_path}
        if hasattr(item, "name"):
            return {"name": item.name, "value": item.value}
        return item

    adapter._api_client.sanitize_for_serialization.side_effect = serialize
    adapter._apps = MagicMock()
    adapter._networking = MagicMock()
    adapter._networking.read_namespaced_network_policy.return_value.spec.ingress = [
        {"ports": [{"port": 27015, "protocol": "UDP"}]}
    ]
    adapter._apps.read_namespaced_stateful_set.return_value.spec.template.spec.containers = [
        SimpleNamespace(
            name="garrysmod",
            env=[SimpleNamespace(name="MAP", value="gm_flatgrass")],
            volume_mounts=[SimpleNamespace(name="data", mount_path="/home/gmod/server")],
        )
    ]

    adapter.configure_gmod_rcon("server-id", "tenant", "secret", sts_name="gmod-id")

    policy_patch = adapter._networking.patch_namespaced_network_policy.call_args.args[2]
    assert policy_patch["spec"]["ingress"][-1]["ports"] == [{"port": 27015, "protocol": "TCP"}]
    stateful_patch = adapter._apps.patch_namespaced_stateful_set.call_args.args[2]
    env = {item["name"]: item["value"] for item in stateful_patch["spec"]["template"]["spec"]["containers"][0]["env"]}
    assert env == {
        "MAP": "gm_flatgrass", "RCON_PASSWORD": "secret",
        "ARGS": "+rcon_password secret", "AUTOUPDATE": "0",
    }
    mounts = stateful_patch["spec"]["template"]["spec"]["containers"][0]["volumeMounts"]
    assert mounts == [{"$patch": "replace"}, *gmod_volume_mounts()]
    init = stateful_patch["spec"]["template"]["spec"]["initContainers"]
    assert init == [gmod_file_init_container()]


def test_existing_gmod_reconciles_rcon_when_started():
    adapter = MockKubernetesAdapter()
    adapter.configure_gmod_rcon = MagicMock()
    repository = InMemoryServerRepository()
    service = ServerService(repository, adapter, mode="mock")
    server = service.create("owner", ServerCreate(name="GMod server", game="garrysmod"))
    service.mode = "real"

    service.set_state("owner", server.id, "running")

    adapter.configure_gmod_rcon.assert_called_once()
    assert adapter.configure_gmod_rcon.call_args.args[:2] == (server.id, server.resource_plan.namespace)
