import urllib.request, json, sqlite3

DB = "/data/kubehost.db"

# 1. DB 현황 확인
conn = sqlite3.connect(DB)
users = conn.execute("SELECT id, username, created_at FROM users").fetchall()
print("현재 사용자:", users)
conn.close()

# 2. 등록 시도
data = json.dumps({"username": "admin", "password": "fpdlschdchd0101"}).encode()
req = urllib.request.Request(
    "http://localhost:8000/api/v1/auth/register",
    data=data,
    headers={"Content-Type": "application/json"},
    method="POST"
)
try:
    resp = urllib.request.urlopen(req)
    print("등록 성공:", resp.read().decode())
except urllib.error.HTTPError as e:
    print("등록 오류:", e.code, e.read().decode())

# 3. 로그인 테스트
data2 = json.dumps({"username": "admin", "password": "fpdlschdchd0101"}).encode()
req2 = urllib.request.Request(
    "http://localhost:8000/api/v1/auth/login",
    data=data2,
    headers={"Content-Type": "application/json"},
    method="POST"
)
try:
    resp2 = urllib.request.urlopen(req2)
    print("로그인 성공:", resp2.read().decode()[:80])
except urllib.error.HTTPError as e:
    print("로그인 오류:", e.code, e.read().decode())
