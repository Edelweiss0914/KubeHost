#!/bin/bash
POD=$(kubectl get pod -n kubehost-system -l app=kubehost-backend -o jsonpath='{.items[0].metadata.name}')
echo "Pod: $POD"
kubectl exec -n kubehost-system $POD -- python3 - << 'EOF'
import sqlite3
c = sqlite3.connect('/data/kubehost.db')
try:
    c.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
    print("is_admin 컬럼 추가됨")
except Exception as e:
    print(f"이미 존재하거나 오류: {e}")
# 첫 번째 사용자를 관리자로 설정
row = c.execute("SELECT id, username FROM users ORDER BY created_at LIMIT 1").fetchone()
if row:
    c.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (row[0],))
    print(f"관리자 설정: {row[1]}")
c.commit()
print(c.execute("SELECT username, is_admin FROM users").fetchall())
EOF
