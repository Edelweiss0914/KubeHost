# KubeHost
K3s 기반 게임 서버 호스팅 플랫폼입니다. 첫 단계는 실제 클러스터를 조작하지 않는 mock 웹 MVP입니다.

프로젝트 배경은 [인프라 인수인계](KUBEHOST_PROJECT_CONTEXT.md), 개발 범위는 [첫 작업 지시](CODEX_START_PROMPT.md), 브랜치와 커밋 기준은 [변경 이력 관리](CONTRIBUTING.md)를 참고하세요.

## 실행

Python 3.10 이상과 Node.js 20 이상이 필요합니다.

1. `backend`에서 가상 환경을 만들고 `python -m pip install -e ".[dev]"`을 실행합니다.
2. 같은 디렉터리에서 `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`을 실행합니다.
3. `frontend`에서 `npm install`, `npm run dev`를 실행합니다.
4. `http://127.0.0.1:5173`을 엽니다. API 문서는 `http://127.0.0.1:8000/docs`에서 확인합니다.

검증 명령과 상세 환경 설정은 [개발 안내](docs/development.md)를 참고하세요.

## 설계와 범위

첫 MVP는 데모 사용자와 프로세스 메모리 저장소를 사용합니다. 서버 생성·시작·중지·삭제와 Kubernetes 리소스 **계획 조회**는 모두 mock 동작입니다. 실제 Kubernetes API는 호출하지 않습니다. 앱 재시작 시 데모 서버 목록은 초기화됩니다.

계층과 안전 경계는 [아키텍처](docs/architecture.md), 요청 경로는 [API 안내](docs/api.md)에 기록했습니다. K3s 토큰, kubeconfig, SSH 키, 인증키는 저장소에 추가하지 마세요. 실제 클러스터 연동, 인증·RBAC, 데이터 백업은 별도 검토 단계입니다.

운영 UI는 API 주소를 설정으로 분리하고 `/health`의 모드를 표시합니다. 실제 API 연결과 인증·권한 검증은 아직 구현되지 않았으며, [Claude 인계 문서](docs/claude-handoff.md)에 남은 경계를 정리했습니다.
