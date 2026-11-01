# KubeHost → Codex 전달 안내

## 포함 파일

- `KUBEHOST_PROJECT_CONTEXT.md`: 실제 구축한 클러스터, 검증 기록, 설계 결정, 보안/운영 제약을 정리한 인수인계 문서.
- `CODEX_START_PROMPT.md`: Codex의 **첫 번째 구현 작업** 프롬프트. 실클러스터를 변경하지 않는 mock 기반 웹 MVP 구축을 지시.

## 사용 방법

1. GitHub에 KubeHost 저장소를 만들거나 기존 저장소를 사용합니다.
2. 위 두 파일을 저장소 최상위에 넣고 커밋합니다.
3. Codex에 해당 저장소를 연결하고 `CODEX_START_PROMPT.md`의 지시를 수행하도록 요청합니다.
4. 처음 결과는 로컬/미리보기에서 검증한 뒤 실제 Kubernetes adapter는 별도 작업으로 진행합니다.

## 중요한 구분

- 현재 검증 완료: K3s 2노드, VPN, Flannel, Service/DNS, 수동 Minecraft StatefulSet/Local PVC, 게임 접속, Pod 재생성 후 데이터 유지.
- 현재 리소스 상태: 테스트 Namespace/게임 PVC/PV는 정리됐고 K3s 시스템 Pods는 유지.
- 아직 미구현: 웹 UI/API, 사용자별 자동 Namespace 생성, 실제 K8s 프로비저닝, 파일 관리, NFS 백업·장애 복구.

**민감 정보 주의:** 실제 K3s Server 토큰·kubeconfig·SSH/인증 키는 Markdown에 포함하지 않았습니다. 프로젝트 실서비스 배포 전에는 Worker 에이전트의 토큰 갱신이 완료됐는지와 방화벽·노드 격리 정책을 별도 점검하세요.

