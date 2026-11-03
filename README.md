# KubeHost

K3s 기반 Minecraft 게임 서버 호스팅 플랫폼입니다.

백엔드(FastAPI + Python), 프론트엔드(React + TypeScript)로 구성되며, 실제 K3s 클러스터 연동 전 단계인 **Mock 모드**와 향후 연동을 위한 **Real 모드** 구조를 분리해 설계했습니다.

## 기능 현황

### 구현 완료

| 기능 | 설명 |
|------|------|
| 사용자 인증 | JWT 기반 로그인·회원가입, bcrypt 비밀번호 해싱, 30일 토큰 |
| 초대 코드 | 단일 사용·만료 시간 설정 가능, 관리자 마스터 키 지원 |
| 서버 관리 UI | 생성·시작·중지·삭제·복구 (Mock 동작) |
| 서버 설정 | 난이도, 게임모드, 최대 플레이어, MOTD, PVP, RCON 등 |
| K8s 리소스 계획 | Namespace, ResourceQuota, NetworkPolicy, StatefulSet, Service 생성 계획 |
| 스케줄러 | 서버 자동 시작/정지, 요일별·시간 설정 |
| 관리자 | 사용자 관리, 초대 코드, 감사 로그, 할당량 설정 |
| 클러스터 맵 | Worker 노드와 배치된 서버 시각화 |
| 감사 로그 | 주요 작업 전체 기록 (actor, action, target, result) |
| 할당량 관리 | CPU·메모리·스토리지·서버 수 사용자별 제한 |

### Mock 동작 (K3s 연동 전)

| 기능 | 상태 |
|------|------|
| 서버 생성·시작·중지·삭제 | 로그 기록만, 실제 K8s 리소스 미생성 |
| 서버 로그 조회 | 빈 배열 반환 |
| 서버 상태 조회 | 항상 `None` 반환 |
| RCON 명령어 실행 | 에러 반환 |
| 노드 목록 | 하드코딩된 2개 노드 (control-plane, worker-01) |
| 파드 토폴로지 | 서버 상태에 따라 시뮬레이션 |

Mock 모드에서는 앱 재시작 시 서버 목록이 초기화됩니다(프로세스 메모리 저장소 사용). Real 모드는 SQLite를 사용합니다.

## 실행

**필요 환경**: Python 3.10 이상, Node.js 20 이상

```bash
# 백엔드
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
python -m pip install -e ".[dev]"
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 프론트엔드 (별도 터미널)
cd frontend
npm install
npm run dev
```

- 앱: http://127.0.0.1:5173
- API 문서: http://127.0.0.1:8000/docs

## 환경변수

백엔드(`backend/.env` 또는 시스템 환경변수):

```env
KUBEHOST_MODE=mock                          # mock | real (기본: mock)
KUBEHOST_JWT_SECRET=<비밀키>                 # 프로덕션에서 반드시 변경
KUBEHOST_ADMIN_SECRET=<마스터키>             # 관리자 초대 코드 (선택)
KUBEHOST_CORS_ORIGINS=http://localhost:5173  # 허용 출처
KUBEHOST_DB_PATH=kubehost.db                # Real 모드 SQLite 경로
KUBECONFIG=/etc/rancher/k3s/k3s.yaml        # Real 모드 kubeconfig 경로
```

프론트엔드(`frontend/.env.local`):

```env
VITE_API_BASE_URL=http://...  # 기본: 같은 출처의 /api/v1
```

## 테스트

```bash
# 백엔드
cd backend
pytest
ruff check app tests
mypy app

# 프론트엔드
cd frontend
npm test
npm run typecheck
npm run lint
```

## 아키텍처

```
React (브라우저)
    │ HTTP + JWT
    ▼
FastAPI 백엔드
  ├─ HTTP 라우터 (routes, auth_routes, admin_routes)
  ├─ 서비스 계층 (servers, auth, plans, scheduler)
  └─ 어댑터 (ports/adapters 패턴)
       ├─ KubernetesAdapter
       │    ├─ MockKubernetesAdapter  ← 현재 사용
       │    └─ K8sAdapter             ← Real 모드 (노드/파드 조회만 구현)
       └─ ServerRepository
            ├─ InMemoryServerRepository  ← Mock 모드
            └─ SQLiteServerRepository    ← Real 모드
```

계층 세부 사항은 [아키텍처](docs/architecture.md), API 목록은 [API 안내](docs/api.md), Real 모드 전환 계획은 [인계 문서](docs/claude-handoff.md)를 참고하세요.

## 보안 주의사항

- `KUBEHOST_JWT_SECRET`, `KUBEHOST_ADMIN_SECRET`은 프로덕션에서 반드시 변경하세요.
- K3s 토큰, kubeconfig, SSH 키, 인증키는 저장소에 추가하지 마세요.
- Real 모드 CORS 설정은 구체적인 origin을 지정하세요.

## 다음 단계

Real 어댑터(`K8sAdapter`)에 아래 기능을 구현하면 실제 K3s 연동이 가능합니다:

1. `create()` — StatefulSet, Service, PVC 생성
2. `get_status()` — Pod 상태 조회
3. `set_state()` — StatefulSet replica 스케일 조작
4. `delete()` — K8s 리소스 삭제
5. `logs()` — Pod 로그 조회
6. `get_settings()` / `patch_settings()` — Env 조회·변경
7. `rcon()` — RCON 명령어 실행

최소 구현 범위와 전제조건은 [인계 문서](docs/claude-handoff.md)에 정리되어 있습니다.
