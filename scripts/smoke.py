"""Exercise the mock API through Vite's development proxy."""
import json
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

BASE = "http://127.0.0.1:5173/api/v1"


def call(path: str, method: str = "GET", payload: dict | None = None) -> object:
    body = json.dumps(payload).encode() if payload is not None else None
    request = Request(
        BASE + path,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urlopen(request, timeout=5) as response:
        assert response.status < 300
        return json.load(response)


def wait_for_proxy() -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            result = call("/servers")
            if isinstance(result, list):
                return
        except (URLError, ValueError, TimeoutError):
            pass
        time.sleep(0.25)
    raise RuntimeError("Vite proxy or backend did not become ready")


def main() -> None:
    wait_for_proxy()
    with urlopen("http://127.0.0.1:5173/health", timeout=5) as response:
        health = json.load(response)
    assert health["mode"] == "mock"
    created = call("/servers", "POST", {
        "name": "Smoke world",
        "game": "minecraft-java",
        "edition": "paper",
        "version": "1.21.4",
        "cpu": 1,
        "memory_mb": 2048,
        "storage_gb": 10,
        "node_id": "kubehost-worker-01",
    })
    assert isinstance(created, dict)
    server_id = created["id"]
    assert created["status"] == "stopped"
    assert created["connection"] is None
    assert created["resource_plan"]["namespace"].startswith("tenant-")
    assert len(call("/servers")) == 1
    assert call(f"/servers/{server_id}")["id"] == server_id
    assert call(f"/servers/{server_id}/start", "POST")["status"] == "running"
    assert call(f"/servers/{server_id}/stop", "POST")["status"] == "stopped"
    deleted = call(f"/servers/{server_id}", "DELETE")
    assert deleted["data_policy"] == "retained"
    assert call("/servers") == []
    print("Mock API through Vite proxy: create/list/detail/start/stop/delete passed")


if __name__ == "__main__":
    main()
