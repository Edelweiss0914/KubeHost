# Codex 첫 작업 프롬프트 — KubeHost MVP

아래 지시를 Codex에 전달하고, 같은 저장소에 `KUBEHOST_PROJECT_CONTEXT.md`를 넣어 먼저 읽게 하세요.

---

당신은 Kubernetes/K3s 멀티테넌트 게임서버 호스팅 플랫폼 **KubeHost**의 리드 풀스택 개발자이자 인프라 엔지니어입니다.

## 선행 지시

1. 저장소의 `KUBEHOST_PROJECT_CONTEXT.md`를 **반드시 먼저 읽고** 실제 완료된 인프라 상태와 미구현 기능을 구분하세요.
2. 기존 저장소를 먼저 조사하고 기존 코드/규칙이 있으면 존중하세요. 빈 저장소라면 아래 구조로 새 프로젝트를 시작하세요.
3. 비밀정보를 생성·요구·출력·커밋하지 마세요. 특히 K3s Server token, 관리자 kubeconfig, SSH 키, Tailscale 인증키는 저장소에 넣지 않습니다.
4. 실제 Kubernetes 클러스터에 연결하거나 리소스를 변경하지 마세요. **첫 PR은 mock 모드만** 구현해야 합니다.
5. NFS, Longhorn, Ceph, HA, 게임서버 백업 자동화는 이번 작업 범위에서 제외합니다.

## 이번 작업의 목적

**사용자가 웹페이지에서 Minecraft 서버를 만들고 상태를 조회할 수 있는 KubeHost MVP 프론트엔드 + 백엔드 골격을 동작 가능한 코드로 구현**하세요. 실제 K3s 호출은 이번 PR에서 제외하고 mock adapter로 동작을 검증합니다.

## 권장 스택

- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: Python 3 / FastAPI / Pydantic
- 데이터: 초기 mock 저장소 또는 개발용 SQLite (선택 이유 문서화)
- 테스트: 프론트 유닛/컴포넌트 테스트와 백엔드 pytest
- 설정: `.env.example`, 환경별 구성 분리

## 필수 화면

1. **대시보드**: 서버 수, 실행/중지 수, 노드 상태 카드(실제 API 연동 전에는 '데모 데이터' 표시), 최근 작업.
2. **서버 목록**: 서버 이름, 게임 종류, 상태, Worker, CPU/RAM/디스크, 접속 주소(생성 전에는 없음).
3. **서버 생성 폼**: 서버 이름, Minecraft Java/Paper, 버전(기본값과 pinning), 메모리/CPU/스토리지 용량, 배포 Worker 선택. 필드 검증 및 사용자 친화적 오류.
4. **서버 상세**: 상태, 서버 설정, 생성된 Kubernetes 리소스 계획(JSON/요약), 로그 mock, 시작/중지/삭제 동작(모두 mock).
5. 모바일/데스크톱 반응형, 로딩·빈 상태·오류 상태 구현. 접근 가능한 라벨과 키보드 상호작용 포함.

## 필수 Backend API (실제 Kubernetes 작업 금지)

- `GET /health`
- `GET /api/v1/nodes` — mock 노드 상태
- `GET /api/v1/servers` — mock 서버 목록
- `POST /api/v1/servers` — 요청 검증 후 mock 서버 생성
- `GET /api/v1/servers/{id}` — 상세 및 리소스 계획
- `POST /api/v1/servers/{id}/start`
- `POST /api/v1/servers/{id}/stop`
- `DELETE /api/v1/servers/{id}` — 데이터 유지/삭제 정책 명시 및 확인 절차를 고려해 설계

서버 생성 시 **Kubernetes 리소스 계획**을 명시적으로 생성하는 순수 함수/서비스 계층을 구현하세요:

- 테넌트 namespace (이름은 임의 사용자 입력 그대로 쓰지 않고 검증된 opaque identifier 사용)
- ResourceQuota, LimitRange
- StatefulSet replicas=1, Paper 서버, Local PVC (`storageClassName: local-path`, RWO)
- 내부 headless Service 및 별도 게임 접근 Service의 계획
- Pod가 `kubehost-worker-01` 같은 허용된 Worker에만 배포되는 제약
- PVC retention 정책 `Retain` 및 데이터 삭제에 대한 별도 명시

이 계획은 mock 모드에서 **실행하지 않고** 화면과 API 응답에서 확인 가능해야 합니다. NodePort는 하드코딩하지 않고 할당 정책 또는 미할당 상태를 설계하세요. K3s Control Plane에는 NoSchedule taint가 있으므로 일반 게임 Pod를 배포하지 않습니다.

## 설계 및 안전 제약

- 프론트엔드가 Kubernetes API를 직접 호출하지 않습니다.
- 장래 실제 Kubernetes 연동을 위해 `KubernetesAdapter` 인터페이스와 `MockKubernetesAdapter`를 분리하세요. 실제 adapter는 이번 PR에서 동작시키지 마세요.
- 사용자의 권한/소유권 검증을 적용 가능한 도메인 구조를 먼저 설계하고, 데모 인증이라는 점을 명확히 표시하세요. 인증을 구현하지 않은 상태를 production-ready라고 표현하지 마세요.
- 임의 YAML 제출, 사용자 명령 실행, privileged 컨테이너, hostPath 직접 노출, 토큰 표시 기능을 넣지 않습니다.
- 입력은 서버 측에서 검증하고 허용된 게임 종류/버전/리소스 범위만 허용합니다.
- Local PV는 Worker 장애 시 다른 Worker로 자동 이동하지 않는다는 내용을 UI/문서에 분명히 표시합니다.
- 모든 데이터와 노드 IP는 개발 mock 데이터임을 명시하고 실제 접근 정보를 코드에 고정하지 않습니다.

## 권장 저장소 구조 (기존 구조가 있다면 맞춰 조정)

```text
kubehost/
├── README.md
├── KUBEHOST_PROJECT_CONTEXT.md
├── CODEX_START_PROMPT.md
├── frontend/
│   ├── src/
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── services/
│   │   └── adapters/
│   ├── tests/
│   └── pyproject.toml
├── docs/
│   ├── architecture.md
│   ├── api.md
│   └── development.md
├── .env.example
└── .gitignore
```

## 완료 조건 (Acceptance Criteria)

- 로컬 개발 환경에서 프론트엔드/백엔드가 실행되고 UI가 API와 통신한다.
- 테스트 서버 생성 → 목록 표시 → 상세 조회 → mock 시작/중지/삭제까지 시연 가능하다.
- 입력 유효성 검증, 서버별 소유권 고려, 상태 오류 처리, 모바일 화면 테스트가 있다.
- Kubernetes 계획 생성 로직에 대한 테스트가 있고 `local-path` PVC 및 Worker 배치 제약을 검증한다.
- API 스키마(OpenAPI)와 설치/실행/테스트 방법이 README에 문서화된다.
- 실제 K3s 클러스터의 리소스 생성·수정·삭제가 발생하지 않는다.
- lint, type-check, 테스트를 실행하고 결과를 보고한다.

## 구현 절차

1. 저장소 분석과 간단한 구현 계획을 작성한다.
2. 모노레포 골격과 실행 가능한 FastAPI/React 앱을 만든다.
3. mock 데이터 모델/API/adapter 및 Kubernetes 리소스 계획 빌더를 구현한다.
4. 대시보드·서버 생성 폼·목록·상세를 API에 연동한다.
5. 검증 테스트와 문서화를 완료한다.
6. 마지막에 변경 파일, 실행법, 테스트 결과, 후속 PR 항목을 요약한다.

이번 작업이 끝난 뒤 후속 PR로 **RBAC를 적용한 실제 Kubernetes adapter**, 사용자 인증, 게임서버 시작/중지 및 파일 관리, 접속 서비스 설계를 순서대로 제안하세요. **단, 이번 PR에서 실클러스터를 조작하지 마세요.**

