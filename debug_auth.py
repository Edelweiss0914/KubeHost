import sqlite3
c = sqlite3.connect('/data/kubehost.db')
row = c.execute("SELECT id, username, password_hash, is_admin, created_at FROM users WHERE username = 'admin'").fetchone()
print(f"row: {row}")
print(f"is_admin raw: {row[3]}, bool: {bool(row[3])}")
