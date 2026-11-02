import sqlite3
c = sqlite3.connect('/data/kubehost.db')
print(c.execute('SELECT username, is_admin FROM users').fetchall())
