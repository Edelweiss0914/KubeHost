# KubeHost 실클러스터 연동 인계

## 현재 기준

- 문서/변경관리: `docs/change-management` (초안 PR #1)
- mock MVP: `feat/mock-mvp` (초안 PR #2, 기준 브랜치 `docs/change-management`)
- 후속 작업 브랜치: `feat/cluster-server-create` (기준 브랜치 `feat/mock-mvp`)
- 최신 mock MVP CI: 백엔드 17개, 프론트엔드 11개 테스트 및 Vite 프록시 통합 스모크 통과.
- API는 현재 mock adapter와 프로세스 메모리 저장소만 사용한다. 실제 클러스터 리소스를 생성하지 않는다.

## 기존 코드 경계

- `backend/app/models/server.py`: 입력 허용 범위, 응답 모델.
- `backend/app/services/plans.py`: 순수 Kubernetes 리소스 계획 생성.
- `backend/app/services/servers.py`: 소유권, 한도, 상태 전이.
- `backend/app/ports.py`: 애플리케이션 소유 포트.
- `backend/app/adapters/mock.py`: mock 구현.
- `backend/app/main.py`: 실행 모드 선택과 의존성 연결. 현재 mock 이외 거부.
- `frontend/src/domain`, `api`, `application`, `features`: 타입/검증, HTTP, 상태, 화면.

## 다음 구현의 최소 범위

1. 실제 클러스터 생성 기능은 **새 adapter와 서비스 경계**로 추가하고 mock을 기본값으로 유지한다. 명시적인 모드·쓰기 허용 플래그가 없으면 Kubernetes 변경을 거부한다.
2. 첫 실클러스터 단계는 관리자가 미리 만든 **전용 namespace**에서 Minecraft StatefulSet 1개와 local-path PVC, 내부 headless Service 및 ClusterIP 게임 Service를 생성하고 상태를 조회하는 데 집중한다. 공개 NodePort·인터넷 접속은 별도 설계한다.
3. 앱 ServiceAccount에는 해당 namespace의 필요한 리소스 권한만 부여한다. Namespace 자동 생성은 cluster-scoped 권한이 필요하므로 이후 별도 단계로 둔다.
4. 프로세스 재시작 후에도 실제 서버를 찾을 수 있도록 StatefulSet 라벨/어노테이션 기반 재조회 또는 영속 메타데이터 저장소를 설계한다. 인메모리 목록만으로 실서버를 관리하지 않는다.
5. API 생성 성공과 게임 준비 완료를 구분한다. StatefulSet/Pod/PVC 상태를 읽고 `provisioning`, `running`, `error` 등을 표시한다. Kubernetes API 호출은 서버 측에서만 한다.
6. 생성 실패 시 이미 만든 Service/StatefulSet/PVC를 무조건 삭제하지 않는다. 재시도와 데이터 보존 정책을 명확히 하고 감사 로그를 남긴다.
7. 실제 삭제·시작·중지, 사용자 인증·테넌트별 namespace, NodePort/외부 접근, 파일 관리, 백업/복구는 후속 PR로 분리한다.

## 절대 경계

- 토큰, kubeconfig, SSH 키, Tailscale 인증키를 저장소·채팅·로그에 넣지 않는다.
- 이 문서만으로 클러스터에 접속하거나 리소스를 적용하지 않는다. 실환경 적용은 별도 검토 후 수행한다.
- `local-path` PVC는 Worker SSD에 묶인다. StatefulSet의 Retain은 PVC 또는 namespace 명시 삭제를 막지 않는다.
- 데모 인증·인메모리 저장소를 유지한 상태를 운영 준비 완료라고 표시하지 않는다.

## 검증

- Kubernetes 클라이언트는 가짜 API 객체로 테스트하고 생성 순서, namespace/Worker 제한, NodePort 미노출, 재시작 후 조회, 오류/재시도 경계를 검증한다.
- 기존 mock 테스트와 CI를 모두 유지한다.
- 실클러스터 연결 테스트는 읽기 전용 사전 점검과 명시적 적용 검토를 분리해 기록한다.

