# 네트워크 구성 — Tailscale + 공인 IP 단일 진입점

## 현재 구성

```
인터넷
  │
  ▼
사용자 공유기 (공인 IP)
  │  포트포워딩: 80/443, 30000-32767
  ▼
k3s-server (LAN IP: 192.168.x.x / Tailscale: 100.x.x.x)
  │  Tailscale VPN
  ▼
worker01 — 친구 노트북 (Tailscale: 100.x.x.x)
```

- **k3s-server**: 제어 플레인 (control-plane) + KubeHost 백엔드/프론트엔드 실행
- **worker01**: 게임 서버 파드 배포 대상 (Schedulable Worker)
- **통신**: 두 노드는 Tailscale WireGuard 터널로 연결, K3s Flannel CNI가 그 위에서 파드 네트워크 구성

---

## 외부 접근 흐름

### KubeHost 관리 UI

```
브라우저 → 공인 IP:443 → 공유기 포워딩 → k3s-server → Traefik Ingress → kubehost-frontend
```

### 마인크래프트 서버 접속 (플레이어)

```
플레이어 → 공인 IP:30XXX → 공유기 포워딩 → k3s-server → kube-proxy (iptables DNAT)
                                                               │
                                                    파드가 worker01에 있을 경우
                                                               │ Flannel over Tailscale
                                                               ▼
                                                         worker01 파드
```

NodePort는 K8s가 **모든 노드에 동일하게** 개방하므로, 파드가 어느 노드에 있든 k3s-server NodePort로 접속하면 kube-proxy가 올바른 파드로 라우팅합니다. 단, Flannel이 Tailscale 인터페이스를 통해 노드 간 통신을 할 수 있어야 합니다.

---

## 필수 포트포워딩

| 외부 포트 | 내부 대상 | 용도 |
|-----------|-----------|------|
| 80 | k3s-server LAN IP:80 | HTTP (→ HTTPS 리다이렉트) |
| 443 | k3s-server LAN IP:443 | KubeHost HTTPS |
| 30000–32767 | k3s-server LAN IP:30000–32767 | 게임 서버 NodePort 전체 |

> 친구 노트북(worker01)에는 포트포워딩 불필요. k3s-server가 대신 수신 후 Tailscale로 전달.

---

## K3s 설정 요구사항

### Flannel이 Tailscale 인터페이스를 사용하도록 설정

worker01과 k3s-server가 Tailscale로만 연결된 경우, Flannel VXLAN이 Tailscale 인터페이스를 통해 캡슐화되도록 지정해야 합니다.

**k3s-server (`/etc/rancher/k3s/config.yaml` 또는 실행 인수):**

```yaml
flannel-iface: tailscale0   # Tailscale 인터페이스명 (ip link로 확인)
node-ip: 100.x.x.x          # 이 노드의 Tailscale IP
```

**worker01 (`/etc/rancher/k3s/config.yaml`):**

```yaml
flannel-iface: tailscale0
node-ip: 100.x.x.x          # worker01의 Tailscale IP
server: https://100.x.x.x:6443  # k3s-server의 Tailscale IP
```

> Tailscale 인터페이스명 확인: `ip link show | grep tailscale` 또는 `tailscale status`

### 접속 주소 표시 (KubeHost)

현재 `connection` 필드는 k3s-server의 **InternalIP** (Tailscale IP 또는 LAN IP)를 표시합니다.
외부에서 접속하려면 **공인 IP**로 표시되어야 합니다.

백엔드 환경변수 `PUBLIC_IP`를 설정하면 NodePort 접속 주소를 공인 IP 기준으로 반환하도록 구현 예정:

```
connection = <PUBLIC_IP>:<NodePort>
```

---

## 현재 제약 사항

| 항목 | 내용 |
|------|------|
| 친구가 Tailscale 비활성화 시 | worker01 통신 불가 → 해당 노드 파드 Pending |
| worker01 재시작 시 | K3s agent 재기동 필요 (`systemctl restart k3s-agent`) |
| 공인 IP 변동 시 | NodePort 접속 주소 불일치 → `PUBLIC_IP` 환경변수 재배포 |
| 포트 충돌 | 동일 NodePort를 두 서버가 사용 불가 → 서버 생성 시 자동 배정 |

---

## 향후 개선 방향

- **`PUBLIC_IP` 환경변수 코드 반영** — 접속 주소를 공인 IP로 자동 표시
- **멀티 Worker 지원** — `ALLOWED_WORKERS` 하드코딩 제거, 실제 스케줄 가능 노드 자동 감지
- **Tailscale Kubernetes Operator** — 더 정교한 네트워크 통합 (선택 사항)
