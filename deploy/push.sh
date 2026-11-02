#!/usr/bin/env bash
# 로컬(Windows/WSL)에서 실행: 코드를 K3s 서버로 전송하고 빌드/배포
# 사용법: bash deploy/push.sh [--skip-build]
set -euo pipefail

SERVER="root@100.84.38.5"
REMOTE_DIR="/root/KubeHost"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_BUILD="${1:-}"

echo "=== KubeHost 코드 전송 ==="
echo "    로컬:  $REPO_DIR"
echo "    원격:  $SERVER:$REMOTE_DIR"
echo ""

# 원격 디렉토리 생성
ssh "$SERVER" "mkdir -p $REMOTE_DIR"

# 파일 전송 (rsync 우선, 없으면 scp -r 폴백)
_sync() {
  local src="$1" dst="$2"
  if command -v rsync &>/dev/null; then
    rsync -az --delete \
      --exclude='__pycache__' --exclude='*.pyc' \
      --exclude='node_modules' --exclude='.vite' --exclude='dist' \
      "$src/" "$SERVER:$dst/"
  else
    scp -rq "$src/." "$SERVER:$dst/"
  fi
}

echo "[1/3] 백엔드 전송..."
_sync "$REPO_DIR/backend"  "$REMOTE_DIR/backend"

echo "[2/3] 프론트엔드 전송..."
_sync "$REPO_DIR/frontend" "$REMOTE_DIR/frontend"

echo "[3/3] 배포 스크립트 전송..."
_sync "$REPO_DIR/deploy"   "$REMOTE_DIR/deploy"

echo ""
echo "=== 원격 빌드 및 배포 ==="
ssh "$SERVER" "bash $REMOTE_DIR/deploy/deploy.sh $SKIP_BUILD"
