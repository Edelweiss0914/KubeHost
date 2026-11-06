"""Rust game definition."""
from __future__ import annotations
from uuid import UUID

from app.games.base import GameDefinition, QuickAccess


class Rust(GameDefinition):
    slug = "rust"
    name = "Rust"
    description = "오픈월드 서바이벌"
    steam_app_id = 252490

    icon = "🪨"
    color = "#c0392b"
    console_placeholder = "WebSocket RCON은 별도 클라이언트를 사용하세요."

    # Rust uses WebSocket RCON — incompatible with Source RCON protocol
    capabilities = frozenset({"file_manager", "console"})

    file_root = "/steamcmd/rust"
    quick_access = [
        QuickAccess("server",       "🔧", "서버 데이터", "월드, 플레이어 데이터"),
        QuickAccess("server/cfg",   "📄", "설정",        "server.cfg"),
    ]

    sts_prefix = "rust"
    image = "didstopia/rust-server:latest"
    container_name = "rust"
    game_port = 28015
    game_protocol = "UDP"

    def container_ports(self) -> list[dict]:
        return [
            {"containerPort": 28015, "protocol": "UDP", "name": "game"},
            {"containerPort": 28016, "protocol": "TCP", "name": "rcon-ws"},
        ]

    def service_ports(self) -> list[dict]:
        return [
            {"name": "game",    "port": 28015, "targetPort": 28015, "protocol": "UDP"},
            {"name": "rcon-ws", "port": 28016, "targetPort": 28016, "protocol": "TCP"},
        ]

    # Rust dedicated server requires root
    def pod_security_context(self) -> dict:
        return {"runAsUser": 0, "runAsGroup": 0, "fsGroup": 0}

    def container_security_context(self) -> dict:
        return {"allowPrivilegeEscalation": True, "runAsNonRoot": False}

    def container_env(self, request, server_id: UUID) -> list[dict]:
        return [
            {"name": "RUST_SERVER_NAME",        "value": request.name},
            {"name": "RUST_SERVER_MAXPLAYERS",   "value": "50"},
            {"name": "RUST_SERVER_WORLDSIZE",    "value": "3000"},
            {"name": "RUST_SERVER_SEED",         "value": "12345"},
            {"name": "RUST_SERVER_IDENTITY",     "value": "rust_server"},
            {"name": "RUST_UPDATE_CHECKING",     "value": "0"},
            {"name": "RUST_START_MODE",          "value": "0"},
        ]
