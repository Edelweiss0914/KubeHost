#!/usr/bin/env bash
# KubeHost 빌드 및 배포 스크립트
# 사용법: bash deploy/deploy.sh [--skip-build]
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_BUILD="${1:-}"

echo "=== KubeHost 배포 시작 ==="

# 1. push 스크립트가 전송한 코드를 그대로 빌드
echo "[1/5] 전송된 코드 사용"

if [[ "$SKIP_BUILD" != "--skip-build" ]]; then
  # 2. 백엔드 이미지 빌드
  echo "[2/5] 백엔드 이미지 빌드..."
  podman build -t kubehost-backend:latest "$REPO_DIR/backend"
  echo "      containerd에 임포트..."
  podman save kubehost-backend:latest | k3s ctr -n k8s.io images import -

  # 3. 프론트엔드 이미지 빌드
  echo "[3/5] 프론트엔드 이미지 빌드..."
  podman build -t kubehost-frontend:latest "$REPO_DIR/frontend"
  echo "      containerd에 임포트..."
  podman save kubehost-frontend:latest | k3s ctr -n k8s.io images import -
else
  echo "[2/5] 빌드 생략 (--skip-build)"
  echo "[3/5] 빌드 생략 (--skip-build)"
fi

# 4. 매니페스트 적용
echo "[4/5] K8s 매니페스트 적용..."
kubectl apply -f "$REPO_DIR/deploy/storageclass.yaml"
kubectl apply -f "$REPO_DIR/deploy/namespace.yaml"
kubectl apply -f "$REPO_DIR/deploy/rbac.yaml"
kubectl apply -f "$REPO_DIR/deploy/backend.yaml"
kubectl apply -f "$REPO_DIR/deploy/frontend.yaml"
kubectl apply -f "$REPO_DIR/deploy/ingress.yaml"

# 5. 파드 재시작 (이미지 갱신 반영)
echo "[5/5] 파드 재시작..."
kubectl rollout restart deployment/kubehost-backend deployment/kubehost-frontend -n kubehost-system
kubectl rollout status deployment/kubehost-backend -n kubehost-system --timeout=120s
kubectl rollout status deployment/kubehost-frontend -n kubehost-system --timeout=60s

echo ""
echo "=== 배포 완료 ==="
echo "접속 주소: http://100.84.38.5"
