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

