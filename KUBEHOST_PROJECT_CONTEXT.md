# KubeHost — 프로젝트 컨텍스트 및 인프라 인수인계

> 최종 정리일: 2026-11-01 (KST)  
> 대상: GitHub 저장소에서 작업하는 Codex 및 개발 참여자  
> 이 문서는 **이미 검증한 사실**, **확정된 결정**, **미구현 기능**, **향후 목표**를 구분한다.

## 1. 프로젝트 개요

**KubeHost**는 K3s 기반의 개인용/소규모 멀티테넌트 게임서버 및 서비스 호스팅 플랫폼이다. 사용자가 웹 UI에서 게임 종류와 리소스를 선택하면, 백엔드가 Kubernetes API를 통해 격리된 네임스페이스와 서버 리소스를 배포·관리한다. 초기 대상은 Minecraft Java Edition이며, 이후 다른 게임과 개인 서비스로 확장한다.

**현재 상태:** 서로 다른 가정에 위치한 2개 노드의 K3s 클러스터와 Pod 네트워크, Minecraft 수동 배포 및 영속성·접속 테스트까지 검증했다. 이후 게임 및 네트워크 테스트 리소스를 삭제하여 시스템 컴포넌트만 남겼다. **웹 플랫폼 소스/백엔드는 아직 구현 전이다.**

### 목표와 범위

- 초기 MVP: 대시보드, Minecraft 서버 생성/조회/중지/시작/삭제, 리소스 제한, 상태·접속 정보 표시.
- 테넌트 격리: 사용자별 namespace, RBAC, ResourceQuota/LimitRange, 필요 시 NetworkPolicy.
- 초기 스토리지: **Worker 로컬 SSD + K3s `local-path` PVC**.
- 중앙 NFS 백업 및 노드 간 데이터 복원/자동 장애 복구는 **추후 단계로 명시적으로 보류**.
- 게임서버는 Worker에 배치. Control Plane에는 `NoSchedule` taint 적용.
- 초기 외부 접근은 **Tailscale VPN 내부에서 검증**. 공용 인터넷 게임 접근은 별도 설계 대상.

## 2. 실제 인프라 (검증됨)

| 구분 | 서버 노드 | 워커 노드 |
|---|---|---|
| Kubernetes Node 이름 | `k3s-server` | `kubehost-worker-01` |
| 역할 | K3s server / control-plane | K3s agent / worker |
| 설치 위치 | Mini PC의 Proxmox VM | 친구의 별도 노트북 |
| OS | Rocky Linux 9.8 | Ubuntu 26.04.1 LTS |
| K3s | `v1.36.5+k3s1` | `v1.36.5+k3s1` |
| Container runtime | containerd `2.3.4-k3s1.36` | 동일 |
| Node 상태 (마지막 확인) | `Ready` | `Ready` |
| Tailscale 인터페이스 | `tailscale0` | `tailscale0` |
| Tailscale IPv4 (현 환경 참고값) | `100.84.38.5` | `100.77.32.31` |

> IP는 실행환경 참조 정보이지 코드에 고정할 값이 아니다. 환경변수와 설정파일로 분리한다. VPN 내부 IP라고 해도 공개 배포 설정/로그에는 불필요하게 노출하지 않는다.

### 클러스터 네트워크

- Tailscale VPN으로 가정 간 노드 연결. 양방향 ping 및 Server API HTTPS 응답 확인.
- K3s Server config: `/etc/rancher/k3s/config.yaml`:

```yaml
node-ip: 100.84.38.5
flannel-iface: tailscale0
tls-san:
  - 100.84.38.5
```

- Worker K3s Agent는 `--node-name kubehost-worker-01`, Tailscale 기반 `--node-ip`, `--flannel-iface=tailscale0`로 가입됨.
- 기본 K3s Flannel VXLAN 사용. 기본 Pod CIDR은 `10.42.0.0/16` 계열, Service CIDR은 `10.43.0.0/16`.
- Server Rocky Linux firewalld 실행, Worker UFW/firewalld 비활성 상태였음.
- Server 방화벽에서 `trusted` zone에 `10.42.0.0/16`, `10.43.0.0/16`을 추가해 Pod 간 통신 복구. 영구 설정에도 등록 확인됨.
- 기존 `ens18` public zone에는 `6443/tcp`, `10250/tcp`, `8472/udp`, `8000/tcp` 등 허용 기록이 있었음. **불필요한 개방 범위는 별도 보안 점검 필요**. `trusted` CIDR 허용은 초기 운영 편의를 위한 설정으로, 장기 멀티테넌트 정책으로 간주하면 안 됨.
- Tailscale 안에서 Flannel VXLAN UDP 8472 통신. 공인 인터넷에 UDP 8472 직접 개방 금지.

### Control Plane / StorageClass

- `k3s-server` taint:

```text
node-role.kubernetes.io/control-plane=true:NoSchedule
```

- 기본 StorageClass:

```text
NAME       PROVISIONER             RECLAIMPOLICY  VOLUMEBINDINGMODE    ALLOWVOLUMEEXPANSION
local-path rancher.io/local-path   Delete         WaitForFirstConsumer false
```

- Local PVC는 특정 Worker에 `nodeAffinity`가 생성되며 다른 Worker로 자동 이동할 수 없다.
- `Delete` reclaim policy이므로 PVC 삭제 시 PV 및 실제 저장 데이터가 삭제될 수 있다. 서버 삭제 API에 **데이터 삭제 여부를 분리**하고 재확인 절차를 설계할 것.
- Local-path의 `10Gi` 같은 PVC size는 로컬 디스크의 강제 쿼터/실제 예약을 보장하지 않음.

## 3. 검증 완료된 실습 / 결과

1. 이전 캡스톤 시연용 `k3s-worker` Node 객체 삭제(기존 VM은 이미 삭제됨).
2. 기존 SQLite 저장소 `state.db`, WAL, SHM 및 당시 Server 토큰을 K3s 중지 상태에서 `/root/k3s-backup/`으로 백업. 백업 디렉터리는 Server 로컬에 있음.
3. Server의 `node-ip`/Flannel `public-ip`가 Tailscale 주소로 전환됨.
4. 친구 노트북 K3s Agent 가입 성공; 두 노드 모두 `Ready`.
5. `kubehost-test` Namespace에서 Server BusyBox `net-test` (`10.42.0.13`)와 Worker Nginx `web-test` (`10.42.1.3`) 배포.
6. 초기 Server→Worker Pod HTTP 요청은 `No route to host`. Server firewalld의 Pod/Service CIDR 허용 후 Nginx 응답 성공.
7. Worker→Server Pod HTTP `:8080` 응답 `Hello from K3s Server` 성공.
8. `web-service` ClusterIP, Endpoint, CoreDNS 이름 해석 및 Service 경유 HTTP 성공.
9. K3s Server token rotation 명령 성공. 이후 2개 Node `Ready`, 시스템 Pods 정상 확인. **노출됐던 예전 토큰 값은 이 문서에 절대 기록하지 않는다.** Worker 설정 갱신 여부는 운영 체크리스트에서 별도 점검.
10. `kubehost-games` Namespace에서 Minecraft Paper StatefulSet(`minecraft-0`) + `local-path` 10Gi PVC(`data-minecraft-0`) 배포 성공.
11. Minecraft 로그 `Done (11.228s)!`, Minecraft Java 클라이언트 실제 접속 성공(테스트 NodePort Service).
12. Minecraft Pod 삭제 후 StatefulSet 재생성; `/data/persistence-test.txt`에 저장한 `KubeHost PVC Test` 문자열 유지됨을 확인.
13. 이후 `kubehost-games`, `kubehost-test` Namespace 삭제. `kubectl get pv`는 `No resources found`. `kubectl get pods -A`에는 `kube-system` 시스템 Pods만 남음.

### 마지막 확인된 클러스터 상태

```text
k3s-server          Ready   control-plane   100.84.38.5
kubehost-worker-01  Ready   <none>          100.77.32.31
```

시스템 구성: CoreDNS, Traefik, local-path-provisioner, metrics-server, ServiceLB가 정상 실행 중이었음. `svclb-traefik` Pod는 Server와 Worker 양쪽에 생성되었음. 게임서버 전용 Worker 정책을 위해 추후 ServiceLB 노드 제한 검토 필요.

## 4. 중요한 설계 결정

### 현재 확정

- K3s 자체는 유지, 기존 물리/VM 구성 및 Tailscale VPN 사용.
- Server는 Control Plane 중심. 신규 일반 게임 Pod는 Worker에만 스케줄하도록 정책 적용.
- 초기 Minecraft는 **StatefulSet replicas=1 + local-path PVC**로 관리 가능함이 검증됨.
- 게임 데이터는 Worker SSD에 저장. 일반적인 Pod 삭제·재생성 시 PVC를 재사용.
- 중앙 NFS/Longhorn/Ceph 도입은 보류. MVP 구현의 선행조건이 아님.
- 웹 UI + 백엔드 + Kubernetes API 연동을 개발할 단계.

### 아직 구현하지 않은 것

- KubeHost 프론트엔드 및 백엔드 소스/프로덕션 배포.
- 실제 로그인, 사용자 권한/소유권 모델, 테넌트별 RBAC 격리.
- Namespace, quota, PVC, StatefulSet, NodePort Service 자동 프로비저닝.
- 서버 목록·시작·정지·삭제·로그 UI, 파일 업로드/플러그인 관리.
- 외부 공개 게임 접속, TLS/도메인 라우팅 설계, 사용량 계측.
- 자동 백업, NFS, Worker 고장 시 다른 노드로 데이터 복원, HA.
- 재부팅 후 자동 복구 점검 및 보안 강화.

## 5. 제안하는 MVP 아키텍처

```text
[Browser: React + TypeScript]
            |
            v
[FastAPI Backend: 인증, 검증, 소유권, 상태 API]
            |
            v
[Kubernetes API: 제한된 ServiceAccount / RBAC]
            |
            +-- namespace: tenant-<opaque-id>
                   +-- ResourceQuota / LimitRange
                   +-- (필요 시) NetworkPolicy
                   +-- StatefulSet: Minecraft (replicas=1)
                   +-- PVC: local-path / worker SSD
                   +-- Service: 내부용 + 별도 game TCP 진입점
            |
            v
[kubehost-worker-01: 게임서버 컨테이너 실행]
```

현재는 실서버에 직접 배포하는 기능을 **기본 비활성화**하고, 먼저 mock Kubernetes adapter를 통해 UI/흐름을 완성한 뒤 리뷰를 거쳐 실제 adapter를 활성화한다.

### 권장 기술 선택

- 프론트엔드: React + TypeScript + Vite + Tailwind CSS.
- 백엔드: Python FastAPI + Pydantic + Kubernetes Python Client.
- 초기 DB: 개발용 SQLite도 가능; 운영 단계 PostgreSQL로 전환 설계. 사용자/서버 메타데이터와 클러스터 실제 상태를 구분.
- 백엔드는 K3s Server VM에 root로 실행하지 말 것. 별도 앱/서비스 계정 및 최소 권한 K8s ServiceAccount 사용.
- 인증 및 multi-tenant 권한은 MVP에서도 설계/테스트 포함. 실제 인터넷 공개 전 강화 필수.

## 6. 반드시 지켜야 할 보안·운영 원칙

1. **토큰, kubeconfig, Secret, SSH 키를 GitHub/Codex 채팅/로그에 복사하거나 커밋하지 말 것.** `.gitignore` 및 `.env.example`만 제공.
2. 앱에서 임의 YAML 입력이나 shell command 실행을 허용하지 말고, 허용된 게임 템플릿과 입력값으로 리소스를 생성할 것.
3. Namespace만으로 완전한 테넌트 격리라고 주장하지 말 것. RBAC, ResourceQuota, LimitRange, NetworkPolicy, Pod security, 스토리지·노드·접속 포트 격리를 검토.
4. 사용자의 namespace/리소스 소유권을 서버에서 확인하고, 다른 사용자의 생성·조회·삭제를 거부.
5. CPU/RAM/PVC 요청 및 제한, Replica=1, Node 선택 등 서버 측 상한을 강제.
6. Local PVC의 `ReclaimPolicy: Delete` 유의. 데이터 보존 기본값과 완전 삭제 작업을 구분할 것.
7. 현재 NodePort 30565는 **과거 테스트 예시**였고 이미 리소스 정리됨. 신규 서버마다 포트 충돌을 피하는 할당 정책 필요. Tailscale 전용 노출을 자동 보장한다고 가정하면 안 됨.
8. 모든 Kubernetes 변경은 mock 모드에서 먼저 검증. 실제 API 적용/삭제 기능에는 명시적 환경 플래그, dry-run/리뷰 및 감사 로그를 둠.
9. Tailscale 접근 제어, 방화벽, ServiceLB 배치, 토큰 회전 후 상태, 부팅 복구 확인은 운영 후속 과제.
10. NFS 없이 **Worker 영구 장애 시 자동 데이터 이동은 제공하지 않는다**고 UI/문서에 명확히 알릴 것.

## 7. 즉시 확인할 운영 명령 (참고용 / 개발 자동화에서 무단 실행 금지)

```bash
kubectl get nodes -o wide
kubectl get pods -A -o wide
kubectl get pv,pvc -A
kubectl get storageclass
kubectl describe node k3s-server | grep -i taints
kubectl get svc -A
```

작업자나 Codex가 실제 환경에 연결되어 있지 않다면 위 결과를 **추측하지 말고 mock 데이터**로 구분할 것.

## 8. 인수인계 대상에게 중요한 현재 목표

**다음 작업은 Kubernetes 재설치나 NFS 구축이 아니라, GitHub 저장소에 KubeHost 웹 플랫폼 MVP의 안전한 골격을 만드는 것이다.** 처음 구현할 수직 기능은 'Minecraft 서버 생성 요청 → mock backend에서 리소스 계획 생성 → 대시보드에서 상태 조회'이며, 테스트 완료 후 명시적으로 실클러스터 적용 기능을 추가한다.

