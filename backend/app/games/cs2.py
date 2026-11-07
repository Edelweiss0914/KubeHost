"""Counter-Strike 2 game definition."""
from __future__ import annotations
from uuid import UUID

from app.games.base import GameDefinition, QuickAccess


class CS2(GameDefinition):
    slug = "cs2"
    name = "Counter-Strike 2"
    description = "5v5 택티컬 FPS"
    steam_app_id = 730

    icon = "🎯"
    color = "#e8a435"
    console_placeholder = "status, mp_restartgame 1, changelevel de_dust2 …"

    # Source RCON (TCP) on the same port as the game
    capabilities = frozenset({"file_manager", "rcon", "console"})

    file_root = "/home/steam/cs2-dedicated"
    quick_access = [
        QuickAccess("game/csgo/cfg",  "🔧", "설정",   "server.cfg, autoexec.cfg"),
        QuickAccess("game/csgo/maps", "🗺", "맵",     "커스텀 맵"),
        QuickAccess("game/csgo/logs", "📋", "로그",   "서버 로그"),
    ]

    sts_prefix = "cs2"
    image = "joedwards32/cs2:latest"
    container_name = "cs2"
    game_port = 27015
    game_protocol = "UDP"

    # Source RCON uses TCP on the same port
    rcon_port: int = 27015

    def container_ports(self) -> list[dict]:
        return [
            {"containerPort": 27015, "protocol": "UDP", "name": "game"},
            {"containerPort": 27015, "protocol": "TCP", "name": "rcon"},
        ]

    def service_ports(self) -> list[dict]:
        return [
            {"name": "game", "port": 27015, "targetPort": 27015, "protocol": "UDP"},
            {"name": "rcon", "port": 27015, "targetPort": 27015, "protocol": "TCP"},
        ]

    def pod_security_context(self) -> dict:
        return {
            "runAsNonRoot": True, "runAsUser": 1000,
            "runAsGroup": 1000, "fsGroup": 1000,
            "seccompProfile": {"type": "RuntimeDefault"},
        }

    def container_security_context(self) -> dict:
        return {"allowPrivilegeEscalation": False, "capabilities": {"drop": ["ALL"]}}

    def container_command(self) -> list[str]:
        return ["sh", "-c", "cd /home/steam/cs2-dedicated && exec /home/steam/entry.sh"]

    def extra_resources(self, name: str, namespace: str, labels: dict, request) -> list[dict]:
        return [{
            "apiVersion": "networking.k8s.io/v1", "kind": "NetworkPolicy",
            "metadata": {"name": f"{name}-ingress", "namespace": namespace},
            "spec": {
                "podSelector": {"matchLabels": labels},
                "policyTypes": ["Ingress"],
                "ingress": [
                    {"ports": [{"port": 27015, "protocol": "UDP"}]},
                    # RCON only from kubehost-system namespace
                    {"from": [{"namespaceSelector": {"matchLabels": {
                        "kubernetes.io/metadata.name": "kubehost-system"}}}],
                     "ports": [{"port": 27015, "protocol": "TCP"}]},
                ],
            },
        }]

    def container_env(self, request, server_id: UUID) -> list[dict]:
        from app.services.plans import rcon_password
        env = [
            {"name": "CS2_SERVERNAME",   "value": request.name},
            {"name": "CS2_MAXPLAYERS",   "value": "10"},
            {"name": "CS2_RCONPW",       "value": rcon_password(server_id)},
            {"name": "CS2_CFG_URL",      "value": ""},
            {"name": "CS2_BOT_QUOTA",    "value": "0"},
            {"name": "CS2_GAMETYPE",     "value": "0"},
            {"name": "CS2_GAMEMODE",     "value": "1"},
        ]
        if getattr(request, "cs2_workshop_map", None):
            env.append({"name": "CS2_HOST_WORKSHOP_MAP", "value": request.cs2_workshop_map})
        if getattr(request, "cs2_workshop_collection", None):
            env.append({"name": "CS2_HOST_WORKSHOP_COLLECTION", "value": request.cs2_workshop_collection})
        return env
