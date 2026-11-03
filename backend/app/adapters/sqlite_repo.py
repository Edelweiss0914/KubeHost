"""SQLite-backed server repository for durable metadata storage."""
import sqlite3
from contextlib import contextmanager
from typing import Generator

from app.models.invite import InviteCode
from app.models.server import Server
from app.models.user import User


class SQLiteServerRepository:
    def __init__(self, db_path: str = "kubehost.db") -> None:
        self._db_path = db_path
        self._init_db()

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS servers (
                    id TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL,
                    retained INTEGER NOT NULL DEFAULT 0,
                    data TEXT NOT NULL
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_owner ON servers(owner_id, retained)"
            )
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    is_admin INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                )
            """)
            # Migration: add is_admin column to existing DBs
            try:
                conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
                # Set the first-ever registered user as admin
                row = conn.execute("SELECT id FROM users ORDER BY created_at LIMIT 1").fetchone()
                if row:
                    conn.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (row[0],))
            except sqlite3.OperationalError:
                pass  # column already exists
            conn.execute("""
                CREATE TABLE IF NOT EXISTS invite_codes (
                    id TEXT PRIMARY KEY,
                    code TEXT UNIQUE NOT NULL,
                    created_by TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    used_by TEXT,
                    used_at TEXT,
                    expires_at TEXT,
                    single_use INTEGER NOT NULL DEFAULT 1
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    actor_id TEXT NOT NULL,
                    actor_name TEXT NOT NULL,
                    action TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    target_name TEXT NOT NULL,
                    result TEXT NOT NULL DEFAULT 'ok',
                    detail TEXT NOT NULL DEFAULT ''
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(timestamp DESC)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id)"
            )
            conn.execute("""
                CREATE TABLE IF NOT EXISTS user_quotas (
                    user_id TEXT PRIMARY KEY,
                    max_cpu REAL NOT NULL DEFAULT 4,
                    max_memory_mb INTEGER NOT NULL DEFAULT 8192,
                    max_storage_gb INTEGER NOT NULL DEFAULT 100,
                    max_servers INTEGER NOT NULL DEFAULT 10
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS schedules (
                    id TEXT PRIMARY KEY,
                    server_id TEXT NOT NULL,
                    days TEXT NOT NULL DEFAULT '[]',
                    start_time TEXT,
                    stop_time TEXT,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    timezone TEXT NOT NULL DEFAULT 'Asia/Seoul'
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_schedules_server ON schedules(server_id)"
            )

    @contextmanager
    def _connect(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def list_by_owner(self, owner_id: str) -> list[Server]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT data FROM servers WHERE owner_id = ? AND retained = 0", (owner_id,)
            ).fetchall()
        return [Server.model_validate_json(row[0]) for row in rows]

    def get(self, server_id: str) -> Server | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT data FROM servers WHERE id = ? AND retained = 0", (server_id,)
            ).fetchone()
        return Server.model_validate_json(row[0]) if row else None

    def save(self, server: Server) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO servers (id, owner_id, retained, data) VALUES (?, ?, 0, ?)",
                (server.id, server.owner_id, server.model_dump_json()),
            )

    def delete(self, server_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM servers WHERE id = ? AND retained = 0", (server_id,)
            )

    def retain(self, server: Server) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO servers (id, owner_id, retained, data) VALUES (?, ?, 1, ?)",
                (server.id, server.owner_id, server.model_dump_json()),
            )

    def unretain(self, server_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM servers WHERE id = ? AND retained = 1", (server_id,))

    def retained_for(self, owner_id: str) -> list[Server]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT data FROM servers WHERE owner_id = ? AND retained = 1", (owner_id,)
            ).fetchall()
        return [Server.model_validate_json(row[0]) for row in rows]

    # ── User methods ──────────────────────────────────────────────────────────

    def _row_to_user(self, row: tuple) -> User:
        return User(id=row[0], username=row[1], password_hash=row[2],
                    is_admin=bool(row[3]), created_at=row[4])

    def get_by_username(self, username: str) -> User | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, username, password_hash, is_admin, created_at FROM users WHERE username = ?",
                (username,),
            ).fetchone()
        return self._row_to_user(row) if row else None

    def get_user_by_id(self, user_id: str) -> User | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, username, password_hash, is_admin, created_at FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
        return self._row_to_user(row) if row else None

    def save_user(self, user: User) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)",
                (user.id, user.username, user.password_hash, int(user.is_admin), user.created_at.isoformat()),
            )

    def list_users(self) -> list[User]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, username, password_hash, is_admin, created_at FROM users ORDER BY created_at"
            ).fetchall()
        return [self._row_to_user(r) for r in rows]

    def delete_user(self, user_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
            conn.execute("DELETE FROM servers WHERE owner_id = ?", (user_id,))

    def user_count(self) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    # ── Invite code methods ───────────────────────────────────────────────────

    def _row_to_invite(self, row: tuple) -> InviteCode:
        return InviteCode(id=row[0], code=row[1], created_by=row[2], created_at=row[3],
                          used_by=row[4], used_at=row[5], expires_at=row[6],
                          single_use=bool(row[7]))

    def save_invite(self, invite: InviteCode) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO invite_codes (id, code, created_by, created_at, used_by, used_at, expires_at, single_use) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (invite.id, invite.code, invite.created_by,
                 invite.created_at.isoformat(),
                 invite.used_by,
                 invite.used_at.isoformat() if invite.used_at else None,
                 invite.expires_at.isoformat() if invite.expires_at else None,
                 int(invite.single_use)),
            )

    def get_invite_by_code(self, code: str) -> InviteCode | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, code, created_by, created_at, used_by, used_at, expires_at, single_use FROM invite_codes WHERE code = ?",
                (code,),
            ).fetchone()
        return self._row_to_invite(row) if row else None

    def list_invites(self) -> list[InviteCode]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, code, created_by, created_at, used_by, used_at, expires_at, single_use FROM invite_codes ORDER BY created_at DESC"
            ).fetchall()
        return [self._row_to_invite(r) for r in rows]

    def delete_invite(self, invite_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM invite_codes WHERE id = ?", (invite_id,))

    # ── Audit log methods ─────────────────────────────────────────────────────

    def save_audit_log(self, entry: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO audit_logs (id, timestamp, actor_id, actor_name, action, target_id, target_name, result, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (entry["id"], entry["timestamp"], entry["actor_id"], entry["actor_name"],
                 entry["action"], entry["target_id"], entry["target_name"],
                 entry.get("result", "ok"), entry.get("detail", "")),
            )

    def list_audit_logs(
        self, limit: int = 100, offset: int = 0,
        actor_id: str | None = None, action: str | None = None,
    ) -> list[dict]:
        conditions = []
        params: list = []
        if actor_id:
            conditions.append("actor_id = ?")
            params.append(actor_id)
        if action:
            conditions.append("action = ?")
            params.append(action)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        params += [limit, offset]
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT id, timestamp, actor_id, actor_name, action, target_id, target_name, result, detail FROM audit_logs {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
                params,
            ).fetchall()
        keys = ["id", "timestamp", "actor_id", "actor_name", "action", "target_id", "target_name", "result", "detail"]
        return [dict(zip(keys, row)) for row in rows]

    def update_user_admin(self, user_id: str, is_admin: bool) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE users SET is_admin = ? WHERE id = ?", (int(is_admin), user_id))

    # ── User quota methods ────────────────────────────────────────────────────

    def get_user_quota(self, user_id: str) -> dict:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT max_cpu, max_memory_mb, max_storage_gb, max_servers FROM user_quotas WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        if row:
            return {"max_cpu": row[0], "max_memory_mb": row[1], "max_storage_gb": row[2], "max_servers": row[3]}
        return {"max_cpu": 4.0, "max_memory_mb": 8192, "max_storage_gb": 100, "max_servers": 10}

    def set_user_quota(self, user_id: str, max_cpu: float, max_memory_mb: int, max_storage_gb: int, max_servers: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO user_quotas (user_id, max_cpu, max_memory_mb, max_storage_gb, max_servers) VALUES (?, ?, ?, ?, ?)",
                (user_id, max_cpu, max_memory_mb, max_storage_gb, max_servers),
            )

    # ── Schedule methods ──────────────────────────────────────────────────────────

    def _row_to_schedule(self, row: tuple) -> dict:
        import json
        return {
            "id": row[0], "server_id": row[1],
            "days": json.loads(row[2]), "start_time": row[3],
            "stop_time": row[4], "enabled": bool(row[5]), "timezone": row[6],
        }

    def list_schedules(self, server_id: str) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, server_id, days, start_time, stop_time, enabled, timezone FROM schedules WHERE server_id = ?",
                (server_id,),
            ).fetchall()
        return [self._row_to_schedule(r) for r in rows]

    def list_all_schedules(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, server_id, days, start_time, stop_time, enabled, timezone FROM schedules WHERE enabled = 1"
            ).fetchall()
        return [self._row_to_schedule(r) for r in rows]

    def save_schedule(self, schedule: dict) -> None:
        import json
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO schedules (id, server_id, days, start_time, stop_time, enabled, timezone) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (schedule["id"], schedule["server_id"], json.dumps(schedule["days"]),
                 schedule.get("start_time"), schedule.get("stop_time"),
                 int(schedule.get("enabled", True)), schedule.get("timezone", "Asia/Seoul")),
            )

    def delete_schedule(self, schedule_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM schedules WHERE id = ?", (schedule_id,))
