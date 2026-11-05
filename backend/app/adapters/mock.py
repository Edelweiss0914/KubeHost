"""Ports and in-memory adapters. No Kubernetes SDK or network client is present."""
from typing import Literal

from app.models.server import Node, PodContainer, ResourcePlan, Server, ServerPod
from app.models.template import Template
from app.services.file_paths import file_path, file_root


class InMemoryServerRepository:
    """Process-local demo state. Restart clears servers and retained data records."""
    def __init__(self) -> None:
        self._servers: dict[str, Server] = {}
        self.retained: dict[str, Server] = {}
        self._ops: dict[str, list[str]] = {}
        self._bans: dict[str, list[str]] = {}

    def list_by_owner(self, owner_id: str) -> list[Server]:
        return [s.model_copy(deep=True) for s in self._servers.values() if s.owner_id == owner_id]

    def get(self, server_id: str) -> Server | None:
        server = self._servers.get(server_id)
        return server.model_copy(deep=True) if server else None

    def save(self, server: Server) -> None:
        self._servers[server.id] = server.model_copy(deep=True)

    def delete(self, server_id: str) -> None:
        del self._servers[server_id]

    def retain(self, server: Server) -> None:
        self.retained[server.id] = server.model_copy(deep=True)

    def unretain(self, server_id: str) -> None:
        self.retained.pop(server_id, None)

    def retained_for(self, owner_id: str) -> list[Server]:
        return [s.model_copy(deep=True) for s in self.retained.values() if s.owner_id == owner_id]

    def get_user_quota(self, user_id: str) -> dict:
        return {"max_cpu": 4.0, "max_memory_mb": 8192, "max_storage_gb": 100, "max_servers": 10}

    _GAMES: list[dict] = [
        {"id": "mc-java",  "slug": "minecraft-java",  "name": "Minecraft Java",         "steam_app_id": None,    "image_url": None, "description": "Paper 서버", "supported": True},
        {"id": "cs2",      "slug": "cs2",              "name": "Counter-Strike 2",        "steam_app_id": 730,     "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/730/capsule_sm_120.jpg",     "description": "팀 기반 FPS",      "supported": False},
        {"id": "valheim",  "slug": "valheim",          "name": "Valheim",                 "steam_app_id": 892970,  "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/892970/capsule_sm_120.jpg",  "description": "바이킹 서바이벌",  "supported": True},
        {"id": "gmod",     "slug": "garrysmod",        "name": "Garry's Mod",             "steam_app_id": 4000,    "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/4000/capsule_sm_120.jpg",     "description": "샌드박스",         "supported": True},
        {"id": "terraria", "slug": "terraria",         "name": "Terraria",                "steam_app_id": 105600,  "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/105600/capsule_sm_120.jpg",  "description": "2D 어드벤처",      "supported": False},
        {"id": "pz",       "slug": "project-zomboid",  "name": "Project Zomboid",         "steam_app_id": 108600,  "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/108600/capsule_sm_120.jpg",  "description": "좀비 서바이벌",    "supported": False},
        {"id": "rust",     "slug": "rust",             "name": "Rust",                    "steam_app_id": 252490,  "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/252490/capsule_sm_120.jpg",  "description": "PvP 서바이벌",     "supported": False},
        {"id": "7d2d",     "slug": "7-days-to-die",    "name": "7 Days to Die",           "steam_app_id": 251570,  "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/251570/capsule_sm_120.jpg",  "description": "좀비 타워 디펜스", "supported": False},
        {"id": "ark",      "slug": "ark-asa",          "name": "ARK: Survival Ascended",  "steam_app_id": 2399830, "image_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/2399830/capsule_sm_120.jpg", "description": "공룡 서바이벌",    "supported": False},
    ]

    def list_games(self) -> list[dict]:
        return list(self._GAMES)

    def list_ops(self, server_id: str) -> list[str]:
        return list(self._ops.get(server_id, []))

    def add_op(self, server_id: str, player_name: str) -> None:
        self._ops.setdefault(server_id, [])
        if player_name not in self._ops[server_id]:
            self._ops[server_id].append(player_name)

    def remove_op(self, server_id: str, player_name: str) -> None:
        if server_id in self._ops:
            self._ops[server_id] = [n for n in self._ops[server_id] if n != player_name]

    def list_bans(self, server_id: str) -> list[str]:
        return list(self._bans.get(server_id, []))

    def add_ban(self, server_id: str, player_name: str) -> None:
        self._bans.setdefault(server_id, [])
        if player_name not in self._bans[server_id]:
            self._bans[server_id].append(player_name)

    def remove_ban(self, server_id: str, player_name: str) -> None:
        if server_id in self._bans:
            self._bans[server_id] = [n for n in self._bans[server_id] if n != player_name]


class MockKubernetesAdapter:
    def __init__(self) -> None:
        self._jvm: dict[str, int] = {}
        self._properties: dict[str, str] = {}
        self._backups: dict[str, list[str]] = {}
        self._fs: dict[str, dict[str, dict]] = {}
        self._auto_restart: dict[str, bool] = {}
        self._library: dict[str, dict[str, dict]] = {}

    _MOCK_PROPERTIES = (
        "difficulty=easy\ngamemode=survival\nmax-players=20\n"
        "motd=A Minecraft Server\npvp=true\nonline-mode=true\n"
        "spawn-protection=16\nview-distance=10\nwhite-list=false\n"
        "enable-rcon=true\nrcon.port=25575\n"
    )

    def nodes(self) -> list[Node]:
        return [Node(id="mock-control-plane", name="mock-control-plane", role="control-plane",
                     schedulable=False, cpu_capacity=4, memory_mb_capacity=8192,
                     cpu_requested_m=0, memory_mb_requested=0),
                Node(id="kubehost-worker-01", name="kubehost-worker-01", role="worker",
                     schedulable=True, cpu_capacity=8, memory_mb_capacity=16384,
                     cpu_requested_m=2000, memory_mb_requested=4096)]

    def list_server_pods(self, server: Server) -> list[ServerPod]:
        if server.status not in ("running", "provisioning"):
            return []
        name = f"mc-{server.id.replace('-', '')}-0"
        running = server.status == "running"
        return [ServerPod(
            server_id=server.id,
            name=name,
            namespace=server.resource_plan.namespace,
            node_id=server.node_id,
            phase="Running" if running else "Pending",
            containers=[PodContainer(name="minecraft", ready=running,
                                     state="running" if running else "waiting", restart_count=0)],
            simulated=True,
        )]

    def create(self, plan: ResourcePlan) -> str | None:
        return None

    def get_status(self, server_id: str, namespace: str) -> str | None:
        return None

    def set_state(self, server_id: str, namespace: str, state: Literal["running", "stopped"], sts_name: str | None = None) -> None:
        pass

    def delete(
        self, server_id: str, namespace: str, delete_data: bool,
        sts_name: str | None = None,
    ) -> None:
        pass

    def logs(self, server_id: str, namespace: str, tail: int = 100) -> list[str]:
        return []

    def list_pvcs(self, namespace: str) -> list[str]:
        return []

    def get_settings(self, server_id: str, namespace: str, sts_name: str | None = None) -> dict[str, str]:
        return {}

    def patch_settings(self, server_id: str, namespace: str, updates: dict[str, str], sts_name: str | None = None) -> None:
        pass

    def configure_gmod_rcon(
        self, server_id: str, namespace: str, password: str,
        sts_name: str | None = None,
    ) -> None:
        pass

    def rcon(
        self, server_id: str, namespace: str, command: str,
        sts_name: str | None = None, port: int = 25575,
    ) -> str:
        if port == 27015:
            return f"[MOCK] Garry's Mod: {command}"
        cmd = command.lstrip("/").strip().lower()
        if cmd == "list":
            return "There are 2 of a max of 20 players online: Steve, Alex"
        if cmd == "whitelist list":
            return "There are 3 whitelisted players: Steve, Alex, Notch"
        if cmd.startswith("whitelist add "):
            name = command.strip().split()[-1]
            return f"Added {name} to the whitelist"
        if cmd.startswith("whitelist remove "):
            name = command.strip().split()[-1]
            return f"Removed {name} from the whitelist"
        if cmd.startswith("op "):
            name = command.strip().split()[-1]
            return f"Made {name} a server operator"
        if cmd.startswith("deop "):
            name = command.strip().split()[-1]
            return f"Made {name} no longer a server operator"
        if cmd.startswith("ban "):
            name = command.strip().split()[-1]
            return f"Banned player {name}"
        if cmd.startswith("pardon "):
            name = command.strip().split()[-1]
            return f"Unbanned player {name}"
        if cmd == "banlist":
            return "There are 0 IP bans"
        return "[MOCK] 명령어가 실행됐습니다."

    def get_tenant_quota(self, namespace: str) -> dict[str, dict[str, str]]:
        return {
            "requests.cpu":    {"used": "1",    "hard": "4"},
            "requests.memory": {"used": "2Gi",  "hard": "8Gi"},
            "requests.storage":{"used": "10Gi", "hard": "100Gi"},
            "pods":            {"used": "1",    "hard": "10"},
        }

    def update_tenant_quota(self, namespace: str, max_cpu: float, max_memory_mb: int, max_storage_gb: int, max_servers: int) -> None:
        pass

    def get_jvm(self, server_id: str, namespace: str) -> int:
        return self._jvm.get(server_id, 1536)

    def set_jvm(self, server_id: str, namespace: str, memory_mb: int) -> None:
        self._jvm[server_id] = memory_mb

    def get_auto_restart(self, server_id: str, namespace: str) -> bool:
        return self._auto_restart.get(server_id, False)

    def set_auto_restart(self, server_id: str, namespace: str, enabled: bool) -> None:
        self._auto_restart[server_id] = enabled

    def get_raw_properties(self, server_id: str, namespace: str) -> str:
        return self._properties.get(server_id, self._MOCK_PROPERTIES)

    def set_raw_properties(self, server_id: str, namespace: str, content: str) -> None:
        self._properties[server_id] = content

    def list_backups(self, server_id: str, namespace: str) -> list[str]:
        return list(self._backups.get(server_id, []))

    def create_backup(self, server_id: str, namespace: str) -> str:
        from datetime import datetime, timezone
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        filename = f"world-{ts}.tar.gz"
        self._backups.setdefault(server_id, []).append(filename)
        return filename

    def restore_backup(self, server_id: str, namespace: str, filename: str) -> None:
        pass  # no-op in mock

    def delete_backup(self, server_id: str, namespace: str, filename: str) -> None:
        if server_id in self._backups:
            self._backups[server_id] = [f for f in self._backups[server_id] if f != filename]

    def set_version(self, server_id: str, namespace: str, version: str) -> None:
        pass  # DB update handled by route layer

    # ── File Manager ─────────────────────────────────────────────────────────

    _DEFAULT_FS: list[tuple[str, str, int]] = [
        # (path, type, size)
        ("/data/plugins", "dir", 0),
        ("/data/plugins/EssentialsX-2.20.1.jar", "file", 1_258_291),
        ("/data/plugins/LuckPerms-Bukkit-5.4.jar", "file", 987_654),
        ("/data/mods", "dir", 0),
        ("/data/config", "dir", 0),
        ("/data/world", "dir", 0),
        ("/data/server.properties", "file", 1_024),
        ("/data/ops.json", "file", 128),
        ("/data/whitelist.json", "file", 64),
    ]
    _EPOCH = 1_700_000_000

    _GMOD_FS = [
        ("data", "dir", 0), ("addons", "dir", 0), ("cfg", "dir", 0),
        ("maps", "dir", 0), ("gamemodes", "dir", 0), ("lua", "dir", 0),
        ("cfg/server.cfg", "file", 128),
    ]

    def _fs_for(self, server_id: str, game: str = "minecraft-java") -> dict[str, dict]:
        if server_id not in self._fs:
            source = self._DEFAULT_FS if game == "minecraft-java" else [
                (f"{file_root(game)}/{path}", kind, size) for path, kind, size in self._GMOD_FS
            ]
            self._fs[server_id] = {
                path: {"name": path.rsplit("/", 1)[-1], "type": ftype,
                       "size": size, "modified": self._EPOCH, "content": b""}
                for path, ftype, size in source
            }
        return self._fs[server_id]

    def list_files(self, server_id: str, namespace: str, path: str,
                   sts_name: str | None = None, game: str = "minecraft-java") -> list[dict]:
        path = file_path(game, path).rstrip("/")
        fs = self._fs_for(server_id, game)
        entries = []
        for fpath, entry in fs.items():
            parent = fpath.rsplit("/", 1)[0]
            if parent == path:
                entries.append({"name": entry["name"], "type": entry["type"],
                                 "size": entry["size"], "modified": entry["modified"]})
        return sorted(entries, key=lambda e: (e["type"] == "file", e["name"].lower()))

    def read_file(self, server_id: str, namespace: str, path: str,
                  sts_name: str | None = None, game: str = "minecraft-java") -> bytes:
        path = file_path(game, path)
        fs = self._fs_for(server_id, game)
        entry = fs.get(path)
        if entry is None:
            raise ValueError("파일을 찾을 수 없습니다.")
        return entry.get("content", b"")

    def write_file(self, server_id: str, namespace: str, path: str, content: bytes,
                   sts_name: str | None = None, game: str = "minecraft-java") -> None:
        import time
        path = file_path(game, path, write=True)
        fs = self._fs_for(server_id, game)
        name = path.rsplit("/", 1)[-1]
        # Ensure parent dir entry exists
        parent = path.rsplit("/", 1)[0]
        if parent not in fs and parent != "/data":
            pname = parent.rsplit("/", 1)[-1]
            fs[parent] = {"name": pname, "type": "dir", "size": 0,
                          "modified": int(time.time()), "content": b""}
        fs[path] = {"name": name, "type": "file", "size": len(content),
                    "modified": int(time.time()), "content": content}

    def delete_path(self, server_id: str, namespace: str, path: str,
                    sts_name: str | None = None, game: str = "minecraft-java") -> None:
        path = file_path(game, path, write=True)
        if game == "garrysmod" and path in {
            f"{file_root(game)}/{folder}" for folder in ("data", "addons", "cfg")
        }:
            raise ValueError("마운트된 폴더는 삭제할 수 없습니다.")
        fs = self._fs_for(server_id, game)
        to_del = [k for k in fs if k == path or k.startswith(path + "/")]
        for k in to_del:
            del fs[k]

    def extract(self, server_id: str, namespace: str, path: str,
                sts_name: str | None = None, game: str = "minecraft-java") -> None:
        pass  # mock: no-op

    def mkdir(self, server_id: str, namespace: str, path: str,
              sts_name: str | None = None, game: str = "minecraft-java") -> None:
        import time
        path = file_path(game, path, write=True)
        fs = self._fs_for(server_id, game)
        name = path.rsplit("/", 1)[-1]
        fs[path] = {"name": name, "type": "dir", "size": 0,
                    "modified": int(time.time()), "content": b""}

    # ── Library ───────────────────────────────────────────────────────────────

    def _lib_for(self, namespace: str) -> dict[str, dict]:
        if namespace not in self._library:
            self._library[namespace] = {}
        return self._library[namespace]

    def library_ensure(self, namespace: str) -> None:
        self._lib_for(namespace)

    def library_list_files(self, namespace: str, path: str) -> list[dict]:
        from app.services.file_paths import library_path
        safe = library_path(path).rstrip("/")
        lib = self._lib_for(namespace)
        entries = []
        for fpath, entry in lib.items():
            parent = fpath.rsplit("/", 1)[0]
            if parent == safe:
                entries.append({"name": entry["name"], "type": entry["type"],
                                 "size": entry["size"], "modified": entry["modified"]})
        return sorted(entries, key=lambda e: (e["type"] == "file", e["name"].lower()))

    def library_read_file(self, namespace: str, path: str) -> bytes:
        from app.services.file_paths import library_path
        safe = library_path(path)
        entry = self._lib_for(namespace).get(safe)
        if entry is None:
            raise ValueError("파일을 찾을 수 없습니다.")
        return entry.get("content", b"")

    def library_write_file(self, namespace: str, path: str, content: bytes) -> None:
        import time
        from app.services.file_paths import library_path
        safe = library_path(path, write=True)
        lib = self._lib_for(namespace)
        lib[safe] = {"name": safe.rsplit("/", 1)[-1], "type": "file",
                     "size": len(content), "modified": int(time.time()), "content": content}

    def library_delete_path(self, namespace: str, path: str) -> None:
        from app.services.file_paths import library_path
        safe = library_path(path, write=True)
        lib = self._lib_for(namespace)
        keys = [k for k in lib if k == safe or k.startswith(safe + "/")]
        for k in keys:
            del lib[k]

    def library_mkdir(self, namespace: str, path: str) -> None:
        import time
        from app.services.file_paths import library_path
        safe = library_path(path, write=True)
        lib = self._lib_for(namespace)
        lib[safe] = {"name": safe.rsplit("/", 1)[-1], "type": "dir",
                     "size": 0, "modified": int(time.time())}

    def library_extract(self, namespace: str, path: str) -> None:
        pass  # mock no-op


    def library_storage(self, namespace: str) -> dict:
        lib = self._lib_for(namespace)
        used = sum(e.get("size", 0) for e in lib.values() if e.get("type") == "file")
        return {"used_bytes": used, "total_bytes": 10 * 1024 ** 3}

    def copy_pvc_files(self, src_namespace: str, src_pvc: str, dst_namespace: str, dst_pvc: str) -> None:
        pass  # mock no-op

    def snapshot_pvc_to_library(self, server_id: str, namespace: str, library_namespace: str,
                                archive_path: str, sts_name: str | None = None,
                                game: str = "minecraft-java") -> None:
        pass  # mock no-op

    def restore_library_to_pvc(self, server_id: str, namespace: str, library_namespace: str,
                               archive_path: str, sts_name: str | None = None,
                               game: str = "minecraft-java") -> None:
        pass  # mock no-op


class InMemoryTemplateRepository:
    """Process-local in-memory template store."""

    def __init__(self) -> None:
        self._templates: dict[str, Template] = {}

    def list_by_owner(self, owner_id: str) -> list[Template]:
        return [t for t in self._templates.values() if t.owner_id == owner_id]

    def get(self, template_id: str) -> Template | None:
        return self._templates.get(template_id)

    def save(self, template: Template) -> None:
        self._templates[template.id] = template

    def delete(self, template_id: str) -> None:
        self._templates.pop(template_id, None)
