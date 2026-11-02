# Mock API

기본 주소는 `http://127.0.0.1:8000`입니다. 자동 생성 OpenAPI 문서는 `/docs`, 원본 스키마는 `/openapi.json`에서 확인합니다. 응답은 mock 데이터이며 실제 K3s 상태를 나타내지 않습니다.

| 메서드 | 경로 | 기능 |
|---|---|---|
| GET | `/health` | 앱 상태 및 mock 모드 |
| GET | `/api/v1/nodes` | 데모 노드 목록 |
| GET | `/api/v1/servers` | 데모 소유자의 서버 목록 |
| POST | `/api/v1/servers` | 검증 후 서버와 리소스 계획 생성 |
| GET | `/api/v1/servers/{id}` | 서버 및 리소스 계획 조회 |
| POST | `/api/v1/servers/{id}/start` | mock 실행 상태로 전환 |
| POST | `/api/v1/servers/{id}/stop` | mock 중지 상태로 전환 |
| DELETE | `/api/v1/servers/{id}` | mock 서버 삭제 |

생성 본문 예시:

```json
{"name":"demo-server","game":"minecraft-java","edition":"paper","version":"1.21.4","cpu":1,"memory_mb":2048,"storage_gb":10,"node_id":"kubehost-worker-01"}
```

삭제는 `delete_data=false`가 기본값입니다. `delete_data=true`이면 쿼리의 `confirmation`에 서버 이름을 정확히 넣어야 합니다. 두 경우 모두 실제 PVC를 변경하지 않습니다. 오류는 유효하지 않은 입력에 422, 없는 서버 또는 타 소유자 서버에 404, 잘못된 상태 전이나 한도 초과에 409를 반환합니다.
