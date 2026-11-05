"""Valheim game definition."""
from __future__ import annotations
from uuid import UUID

from app.games.base import GameDefinition, QuickAccess


class Valheim(GameDefinition):
    slug = "valheim"
    name = "Valheim"
    description = "바이킹 서바이벌"
    steam_app_id = 892970

    icon = "⚔"
    color = "#93c5fd"
    console_placeholder = ""

    capabilities = frozenset({
        "console", "game_settings",
    })

    file_root = "/config"
    quick_access = []  # noqa: RUF012

    sts_prefix = "vh"
    image = "lloesche/valheim-server:latest"
    container_name = "valheim"
    game_port = 2456
    game_protocol = "UDP"

    def service_ports(self) -> list[dict]:
        return [
            {"name": "valheim", "port": 2456, "targetPort": 2456, "protocol": "UDP"},
            {"name": "valheim-query", "port": 2457, "targetPort": 2457, "protocol": "UDP"},
        ]

    def container_ports(self) -> list[dict]:
        return [
            {"containerPort": 2456, "protocol": "UDP", "name": "valheim"},
            {"containerPort": 2457, "protocol": "UDP", "name": "valheim-query"},
        ]

    def container_env(self, request, server_id: UUID) -> list[dict]:
        return [
            {"name": "SERVER_NAME", "value": request.name},
            {"name": "WORLD_NAME", "value": request.world_name or "KubeHostWorld"},
            {"name": "SERVER_PASS", "value": request.server_password or "changeme"},
            {"name": "SERVER_PUBLIC", "value": "1" if request.server_public else "0"},
            {"name": "PUID", "value": "1000"},
            {"name": "PGID", "value": "1000"},
        ]
