"""HTTP translation only; demo identity is deliberately server-controlled."""
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.models.server import DEMO_OWNER, DeletionResult, Node, Server, ServerCreate
from app.services.servers import ServerService

router = APIRouter()


def current_owner() -> str:
    return DEMO_OWNER


def service(request: Request) -> ServerService:
    result: ServerService = request.app.state.server_service
    return result


Owner = Annotated[str, Depends(current_owner)]
Service = Annotated[ServerService, Depends(service)]


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "mock", "authentication": "demo"}


@router.get("/api/v1/nodes", response_model=list[Node])
def nodes(svc: Service) -> list[Node]:
    return svc.adapter.nodes()


@router.get("/api/v1/servers", response_model=list[Server])
def servers(owner: Owner, svc: Service) -> list[Server]:
    return svc.repository.list(owner)


@router.post("/api/v1/servers", response_model=Server, status_code=201)
def create(payload: ServerCreate, owner: Owner, svc: Service) -> Server:
    return svc.create(owner, payload)


@router.get("/api/v1/servers/{server_id}", response_model=Server)
def detail(server_id: str, owner: Owner, svc: Service) -> Server:
    return svc.get(owner, server_id)


@router.post("/api/v1/servers/{server_id}/start", response_model=Server)
def start(server_id: str, owner: Owner, svc: Service) -> Server:
    return svc.set_state(owner, server_id, "running")


@router.post("/api/v1/servers/{server_id}/stop", response_model=Server)
def stop(server_id: str, owner: Owner, svc: Service) -> Server:
    return svc.set_state(owner, server_id, "stopped")


@router.delete("/api/v1/servers/{server_id}", response_model=DeletionResult)
def delete(server_id: str, owner: Owner, svc: Service, delete_data: bool = False,
           confirmation: str | None = None) -> DeletionResult:
    return svc.delete(owner, server_id, delete_data, confirmation)

