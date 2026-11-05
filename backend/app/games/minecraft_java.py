"""Minecraft Java Edition game definition."""
from __future__ import annotations
from uuid import UUID

from app.games.base import GameDefinition, QuickAccess


class MinecraftJava(GameDefinition):
    slug = "minecraft-java"
    name = "Minecraft Java"
    description = "Paper 서버"
    steam_app_id = None

    capabilities = frozenset({
        "file_manager", "rcon", "console", "backups",
        "properties", "jvm", "game_settings", "auto_restart",
    })

    file_root = "/data"
    quick_access = [
        QuickAccess("plugins",       "☕", "플러그인",   "Paper/Spigot 플러그인 (.jar)"),
        QuickAccess("mods",          "⚙",  "모드",       "Forge/Fabric 모드 (.jar)"),
        QuickAccess("config",        "🔧", "설정",       "플러그인·모드 설정 파일"),
        QuickAccess("world",         "🌍", "오버월드",   "메인 월드 세이브 데이터"),
        QuickAccess("world_nether",  "🔥", "네더",       "네더 차원 세이브 데이터"),
        QuickAccess("world_the_end", "🐉", "엔드",       "엔드 차원 세이브 데이터"),
        QuickAccess("backups",       "💾", "백업",       "월드 백업 (.tar.gz)"),
        QuickAccess("logs",          "📋", "로그",       "서버 실행 로그"),
        QuickAccess("resourcepacks", "🎨", "리소스팩",   "서버 리소스팩"),
        QuickAccess("datapacks",     "📦", "데이터팩",   "월드 데이터팩"),
    ]

    sts_prefix = "mc"
    image = "itzg/minecraft-server:latest"
    container_name = "minecraft"
    game_port = 25565
    game_protocol = "TCP"

    def container_ports(self) -> list[dict]:
        return [
            {"containerPort": 25565, "name": "minecraft"},
            {"containerPort": 25575, "name": "rcon"},
        ]

    def container_env(self, request, server_id: UUID) -> list[dict]:
        from app.services.plans import _game_type_env, rcon_password
        return [
            {"name": "EULA", "value": "TRUE"},
            *_game_type_env(request),
            {"name": "VERSION", "value": request.version},
            {"name": "MEMORY", "value": f"{int(request.memory_mb * 0.75)}M"},
            {"name": "DIFFICULTY", "value": "easy"},
            {"name": "GAMEMODE", "value": "survival"},
            {"name": "MAX_PLAYERS", "value": "20"},
            {"name": "MOTD", "value": "A Minecraft Server"},
            {"name": "PVP", "value": "TRUE"},
            {"name": "ONLINE_MODE", "value": "TRUE"},
            {"name": "SPAWN_PROTECTION", "value": "16"},
            {"name": "VIEW_DISTANCE", "value": "10"},
            {"name": "OPS", "value": ""},
            {"name": "ENABLE_RCON", "value": "TRUE"},
            {"name": "RCON_PORT", "value": "25575"},
            {"name": "RCON_PASSWORD", "value": rcon_password(server_id)},
        ]
