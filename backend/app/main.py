"""Composition root: only mock adapters can be selected in this MVP."""
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.adapters.mock import InMemoryServerRepository, MockKubernetesAdapter
from app.api.routes import router
from app.services.servers import InvalidOperation, ServerNotFound, ServerService


def create_app() -> FastAPI:
    if os.getenv("KUBEHOST_MODE", "mock") != "mock":
        raise RuntimeError("Only KUBEHOST_MODE=mock is supported")
    application = FastAPI(title="KubeHost Mock API", version="0.1.0",
                          description="Development demo identity and process-local storage. No Kubernetes calls.")
    origins = os.getenv("KUBEHOST_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    application.add_middleware(CORSMiddleware, allow_origins=origins.split(","),
                               allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type"])
    application.state.server_service = ServerService(InMemoryServerRepository(), MockKubernetesAdapter())

    @application.exception_handler(ServerNotFound)
    async def missing(request: Request, exc: ServerNotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @application.exception_handler(InvalidOperation)
    async def conflict(request: Request, exc: InvalidOperation) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    application.include_router(router)
    return application


app = create_app()

