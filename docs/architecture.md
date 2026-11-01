# 아키텍처

## 첫 MVP의 실행 경계

브라우저는 FastAPI의 JSON API만 호출합니다. FastAPI는 서버 측에서 입력과 소유권을 검증하고, 순수 함수로 Kubernetes 리소스 **계획**을 만듭니다. `MockKubernetesAdapter`는 계획을 실제 클러스터에 적용하지 않습니다. `KUBEHOST_MODE=mock` 이외의 모드는 앱 시작 시 거부합니다.

```text
React 화면 → API 클라이언트 → FastAPI 라우터 → 서버 서비스 → 저장소 포트
                                              └→ 리소스 계획 빌더 → KubernetesAdapter(mock)
```

백엔드의 `models`는 허용 입력과 응답 형식을 정의합니다. `services`는 상태 전이, 소유권 확인, 테넌트 한도와 계획 생성을 담당합니다. `adapters`는 저장소와 Kubernetes 경계를 표현합니다. 프론트엔드는 `domain` 타입, `api` 통신, `application` 상태 관리, `features` 화면을 분리합니다.

## 데이터와 안전성

초기 저장소는 프로세스 메모리입니다. 앱 재시작 시 서버 목록과 보존 기록이 사라지므로 개발 데모로만 사용합니다. 데모 사용자는 서버에서 고정하며 브라우저가 임의 소유자를 지정할 수 없습니다. 인증·RBAC·실제 Kubernetes adapter는 별도 단계입니다.

계획에는 테넌트 namespace, quota/limit, Worker 제한, StatefulSet과 local-path PVC, 내부 Service와 게임 접근 Service가 포함됩니다. NodePort 번호는 계획에서 지정하지 않습니다. Worker의 로컬 PVC는 노드 장애 시 자동 이동하지 않으며, PVC 자체를 삭제하면 실제 데이터가 삭제될 수 있습니다.

