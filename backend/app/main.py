"""Composition root: select adapter based on KUBEHOST_MODE environment variable."""
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.api.auth_routes import auth_router
from app.api.admin_routes import admin_router
from app.services.servers import InvalidOperation, ServerNotFound, ServerService


def create_app() -> FastAPI:
    mode = os.getenv("KUBEHOST_MODE", "mock")

    if mode == "mock":
        from app.adapters.mock import InMemoryServerRepository, MockKubernetesAdapter
        repository: object = InMemoryServerRepository()
        adapter: object = MockKubernetesAdapter()
        auth_service: object = None
    elif mode == "real":
        from app.adapters.k8s import K8sAdapter
        from app.adapters.sqlite_repo import SQLiteServerRepository
        from app.services.auth import AuthService
        kubeconfig = os.getenv("KUBECONFIG", "/etc/rancher/k3s/k3s.yaml")
        db_path = os.getenv("KUBEHOST_DB_PATH", "kubehost.db")
        adapter = K8sAdapter(kubeconfig_path=kubeconfig)
        repo = SQLiteServerRepository(db_path=db_path)
        repository = repo
        auth_service = AuthService(repo)
    else:
        raise RuntimeError(f"Unknown KUBEHOST_MODE: {mode!r}. Use 'mock' or 'real'.")

    application = FastAPI(
        title="KubeHost API",
        version="0.1.0",
        description="K3s game server hosting platform.",
    )
    origins = os.getenv("KUBEHOST_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins.split(","),
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "Authorization", "X-Admin-Secret"],
    )
    application.state.server_service = ServerService(repository, adapter, mode=mode)  # type: ignore[arg-type]
    application.state.auth_service = auth_service
    application.state.mode = mode

    @application.exception_handler(ServerNotFound)
    async def missing(request: Request, exc: ServerNotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @application.exception_handler(InvalidOperation)
    async def conflict(request: Request, exc: InvalidOperation) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    application.include_router(router)
    application.include_router(auth_router)
    application.include_router(admin_router)
    return application


app = create_app()
