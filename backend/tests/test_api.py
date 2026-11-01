import pytest
from fastapi.testclient import TestClient

from app.api.routes import current_owner
from app.main import create_app


@pytest.fixture
def client():
    return TestClient(create_app())


def test_lifecycle_and_retention(client):
    assert client.get("/health").json()["mode"] == "mock"
    assert client.get("/api/v1/servers").json() == []
    response = client.post("/api/v1/servers", json={"name": "My server"})
    assert response.status_code == 201
    server = response.json()
    server_id = server["id"]
    assert server["status"] == "stopped"
    assert server["connection"] is None
    assert client.get(f"/api/v1/servers/{server_id}").json() == server
    assert len(client.get("/api/v1/servers").json()) == 1
    assert client.post(f"/api/v1/servers/{server_id}/stop").status_code == 409
    assert client.post(f"/api/v1/servers/{server_id}/start").json()["status"] == "running"
    assert client.post(f"/api/v1/servers/{server_id}/start").status_code == 409
    assert client.post(f"/api/v1/servers/{server_id}/stop").json()["status"] == "stopped"
    assert client.delete(f"/api/v1/servers/{server_id}").json()["data_policy"] == "retained"
    assert server_id in client.app.state.server_service.repository.retained
    assert client.get(f"/api/v1/servers/{server_id}").status_code == 404


def test_permanent_delete_requires_exact_name(client):
    server = client.post("/api/v1/servers", json={"name": "Confirm me"}).json()
    url = f"/api/v1/servers/{server['id']}"
    assert client.delete(url, params={"delete_data": True}).status_code == 409
    assert client.get(url).status_code == 200
    assert client.delete(url, params={"delete_data": True, "confirmation": "Confirm me"}).json()["data_policy"] == "deleted"
    assert not client.app.state.server_service.repository.retained


@pytest.mark.parametrize("payload", [
    {"name": "x"}, {"name": "../escape"}, {"name": "valid", "node_id": "k3s-server"},
    {"name": "valid", "version": "latest"}, {"name": "valid", "cpu": 5},
    {"name": "valid", "memory_mb": 512}, {"name": "valid", "storage_gb": 101},
    {"name": "valid", "owner_id": "victim"}, {"name": "valid", "command": "sh"},
])
def test_input_validation(client, payload):
    assert client.post("/api/v1/servers", json=payload).status_code == 422


def test_ownership_for_every_operation(client):
    server = client.post("/api/v1/servers", json={"name": "Private demo"}).json()
    url = f"/api/v1/servers/{server['id']}"
    client.app.dependency_overrides[current_owner] = lambda: "other-user"
    assert client.get("/api/v1/servers").json() == []
    assert client.get(url).status_code == 404
    assert client.post(f"{url}/start").status_code == 404
    assert client.post(f"{url}/stop").status_code == 404
    assert client.delete(url).status_code == 404
    client.app.dependency_overrides.clear()
    assert client.get(url).status_code == 200


def test_quota_counts_retained_storage(client):
    server = client.post("/api/v1/servers", json={"name": "Large world", "storage_gb": 100}).json()
    client.delete(f"/api/v1/servers/{server['id']}")
    assert client.post("/api/v1/servers", json={"name": "Another world"}).status_code == 409


def test_no_real_adapter_can_be_enabled(monkeypatch):
    monkeypatch.setenv("KUBEHOST_MODE", "real")
    with pytest.raises(RuntimeError, match="Only KUBEHOST_MODE=mock"):
        create_app()


def test_mock_nodes_and_openapi(client):
    nodes = client.get("/api/v1/nodes").json()
    assert all(node["mock"] for node in nodes)
    assert not next(node for node in nodes if node["role"] == "control-plane")["schedulable"]
    assert "/api/v1/servers" in client.get("/openapi.json").json()["paths"]

