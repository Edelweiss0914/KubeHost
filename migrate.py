import sqlite3
c = sqlite3.connect('/data/kubehost.db')
try:
    c.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
    print("is_admin column added")
except Exception as e:
    print(f"skip: {e}")
row = c.execute("SELECT id, username FROM users ORDER BY created_at LIMIT 1").fetchone()
if row:
    c.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (row[0],))
    print(f"admin set: {row[1]}")
c.commit()
print(c.execute("SELECT username, is_admin FROM users").fetchall())
