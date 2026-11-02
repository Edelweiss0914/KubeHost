# 로컬 개발

## 요구 사항

Python 3.10 이상, Node.js 20 이상, npm이 필요합니다. 개발 단계에서 실제 K3s 접근 권한이나 kubeconfig는 필요하지 않습니다.

## 백엔드

```bash
cd backend
python -m venv .venv
# 가상 환경 활성화 후
python -m pip install -e ".[dev]"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## 프론트엔드

```bash
cd frontend
npm install
npm run dev
```

Vite가 `/api` 요청을 로컬 백엔드로 프록시합니다. 브라우저에서 `http://127.0.0.1:5173`에 접속합니다.

## 검증

```bash
cd backend
pytest
ruff check app tests
mypy app

cd ../frontend
npm run lint
npm run typecheck
npm test
npm run build
```

현재 작업 환경에 Python 실행 파일이 제공되지 않으면 백엔드 명령은 실행할 수 없습니다. 이 경우 결과를 통과로 간주하지 않고 실행 불가 사유를 PR에 기록합니다.

CI는 백엔드와 프론트엔드를 함께 띄운 뒤 `python scripts/smoke.py`로 Vite 프록시를 경유한 생성·조회·시작·중지·삭제 흐름도 검증합니다.

## 운영 UI 설정

프론트엔드의 `frontend/.env.example`은 공개 빌드 설정 예시입니다. 기본값은 같은 출처의 `/api/v1`과 `/health`를 사용하며, 다른 API 출처가 필요하면 `frontend/.env.local`에 `VITE_API_BASE_URL`을 설정하고 다시 빌드합니다. 이 값에는 비밀정보를 넣지 않습니다.

현재 `/health`는 `mode: mock`을 반환합니다. UI는 모드 확인에 실패하거나 향후 `mode: real`을 받으면 쓰기 동작을 비활성화합니다. Claude가 실제 API와 권한·기능 계약을 구현하기 전에는 이 화면을 운영 준비 완료로 간주하지 않습니다.
