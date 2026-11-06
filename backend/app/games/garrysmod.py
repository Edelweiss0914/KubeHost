"""Garry's Mod game definition."""
from __future__ import annotations
from uuid import UUID

from app.games.base import GameDefinition, QuickAccess
from app.services.gmod_storage import GMOD_IMAGE, GMOD_ROOT, gmod_file_init_container, gmod_volume_mounts


class GarrysMod(GameDefinition):
    slug = "garrysmod"
    name = "Garry's Mod"
    description = "샌드박스"
    steam_app_id = 4000

    icon = "🔧"
    color = "#fbbf24"
    console_placeholder = "status, changelevel gm_construct …"

    capabilities = frozenset({
        "file_manager", "rcon", "console", "game_settings",
    })

    file_root = GMOD_ROOT
    quick_access = [
        QuickAccess("addons",    "🧩", "애드온",      "커스텀 Lua·맵·게임모드"),
        QuickAccess("cfg",       "🔧", "설정",        "server.cfg 등 서버 설정"),
        QuickAccess("data",      "💾", "저장 데이터", "게임·애드온 저장 파일"),
        QuickAccess("gamemodes", "🎮", "게임모드",    "기본·커스텀 게임모드"),
        QuickAccess("maps",      "🗺", "맵",          "기본·커스텀 맵"),
        QuickAccess("lua",       "📜", "Lua",         "서버 스크립트"),
    ]

    sts_prefix = "gmod"
    image = GMOD_IMAGE
    container_name = "garrysmod"
    game_port = 27015
    game_protocol = "UDP"
    rcon_port = 27015

    def volume_mounts(self) -> list[dict]:
        return gmod_volume_mounts()

    def init_containers(self) -> list[dict]:
        return [gmod_file_init_container()]

    def container_ports(self) -> list[dict]:
        return [
            {"containerPort": 27015, "protocol": "UDP", "name": "gmod"},
            {"containerPort": 27015, "protocol": "TCP", "name": "gmod-rcon"},
        ]

    def pod_security_context(self) -> dict:
        return {"runAsUser": 1000, "runAsGroup": 1000, "fsGroup": 1000}

    def container_security_context(self) -> dict:
        return {"allowPrivilegeEscalation": False}

    def extra_resources(self, name: str, namespace: str, labels: dict, request) -> list[dict]:
        return [{
            "apiVersion": "networking.k8s.io/v1", "kind": "NetworkPolicy",
            "metadata": {"name": f"{name}-ingress", "namespace": namespace},
            "spec": {
                "podSelector": {"matchLabels": labels},
                "policyTypes": ["Ingress"],
                "ingress": [
                    {"ports": [{"port": 27015, "protocol": "UDP"}]},
                    {"from": [{"namespaceSelector": {"matchLabels": {
                        "kubernetes.io/metadata.name": "kubehost-system"}}}],
                     "ports": [{"port": 27015, "protocol": "TCP"}]},
                ],
            },
        }]

    def container_env(self, request, server_id: UUID) -> list[dict]:
        from app.services.plans import rcon_password
        return [
            {"name": "GAMEMODE", "value": request.gamemode_name or "sandbox"},
            {"name": "MAP", "value": request.map_name or "gm_flatgrass"},
            {"name": "MAXPLAYERS", "value": "16"},
            {"name": "NAME", "value": request.name},
            {"name": "RCON_PASSWORD", "value": rcon_password(server_id)},
            {"name": "ARGS", "value": f"+rcon_password {rcon_password(server_id)}"},
            {"name": "AUTOUPDATE", "value": "0"},
        ]
