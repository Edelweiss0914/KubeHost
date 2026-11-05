import sqlite3

from app.adapters.sqlite_repo import SQLiteServerRepository


def test_existing_database_enables_supported_games(tmp_path):
    db_path = tmp_path / "kubehost.db"
    SQLiteServerRepository(str(db_path))
    with sqlite3.connect(db_path) as conn:
        conn.execute("UPDATE games SET supported = 0 WHERE slug = 'valheim'")
        conn.execute("DELETE FROM games WHERE slug = 'garrysmod'")

    games = SQLiteServerRepository(str(db_path)).list_games()
    supported = {game["slug"] for game in games if game["supported"]}
    assert {"minecraft-java", "valheim", "garrysmod"} <= supported
