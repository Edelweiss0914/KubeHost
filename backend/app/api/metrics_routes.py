"""Prometheus metrics proxy endpoints."""
import os
import time
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request

metrics_router = APIRouter(prefix="/api/v1/metrics")

PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://10.43.181.87:9090")


def _require_auth(request: Request, authorization: str = Header(default="")) -> str:
    """JWT 검증 후 user_id 반환."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    token = authorization.removeprefix("Bearer ")
    svc = request.app.state.auth_service
    try:
        payload = svc.verify_token(token)
        return str(payload["sub"])
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


Auth = Annotated[str, Depends(_require_auth)]


def _prom_query_range(query: str, start: str, end: str, step: str = "60") -> list[dict]:
    """Prometheus range query. 실패 시 빈 배열 반환."""
    try:
        resp = httpx.get(
            f"{PROMETHEUS_URL}/api/v1/query_range",
            params={"query": query, "start": start, "end": end, "step": step},
            timeout=5,
        )
        data = resp.json()
        if data.get("status") == "success":
            return data["data"]["result"]
    except Exception:
        pass
    return []


def _prom_query(query: str) -> list[dict]:
    """Prometheus instant query."""
    try:
        resp = httpx.get(
            f"{PROMETHEUS_URL}/api/v1/query",
            params={"query": query},
            timeout=5,
        )
        data = resp.json()
        if data.get("status") == "success":
            return data["data"]["result"]
    except Exception:
        pass
    return []


def _series_to_points(result: list[dict]) -> list[dict]:
    """result[0].values → [{t, v}] 형태로 변환."""
    if not result:
        return []
    values = result[0].get("values", [])
    return [{"t": int(ts), "v": round(float(val), 4)} for ts, val in values]


@metrics_router.get("/server/{server_id}")
def server_metrics(
    server_id: str,
    auth: Auth,
    request: Request,
    minutes: int = 60,
) -> dict:
    """특정 서버 파드의 CPU/메모리 시계열 (최근 N분)."""
    server_svc = request.app.state.server_service
    server = server_svc.repository.get(server_id)
    if server is None or server.owner_id != auth:
        raise HTTPException(status_code=404, detail="서버를 찾을 수 없습니다.")

    namespace = server.resource_plan.namespace
    pod_prefix = f"mc-{server_id.replace('-', '')}"

    end = int(time.time())
    start = end - minutes * 60

    cpu = _prom_query_range(
        f'rate(container_cpu_usage_seconds_total{{namespace="{namespace}",pod=~"{pod_prefix}.*",container!="",container!="POD"}}[2m])',
        start, end,
    )
    mem = _prom_query_range(
        f'container_memory_working_set_bytes{{namespace="{namespace}",pod=~"{pod_prefix}.*",container!="",container!="POD"}}',
        start, end,
    )

    return {
        "cpu": _series_to_points(cpu),
        "memory_bytes": _series_to_points(mem),
    }


@metrics_router.get("/namespace")
def namespace_metrics(auth: Auth, request: Request, minutes: int = 60) -> dict:
    """현재 사용자 네임스페이스의 CPU/메모리 시계열."""
    from uuid import NAMESPACE_URL, uuid5
    namespace = f"tenant-{uuid5(NAMESPACE_URL, auth).hex}"

    end = int(time.time())
    start = end - minutes * 60

    cpu = _prom_query_range(
        f'sum(rate(container_cpu_usage_seconds_total{{namespace="{namespace}",container!="",container!="POD"}}[2m]))',
        start, end,
    )
    mem = _prom_query_range(
        f'sum(container_memory_working_set_bytes{{namespace="{namespace}",container!="",container!="POD"}})',
        start, end,
    )

    return {
        "namespace": namespace,
        "cpu": _series_to_points(cpu),
        "memory_bytes": _series_to_points(mem),
    }


@metrics_router.get("/cluster")
def cluster_metrics(request: Request, authorization: str = Header(default="")) -> dict:
    """클러스터 전체 노드 CPU/메모리 현재값 (관리자용)."""
    # 관리자 체크
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    token = authorization.removeprefix("Bearer ")
    svc = request.app.state.auth_service
    try:
        payload = svc.verify_token(token)
        if not payload.get("is_admin"):
            raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    # node_exporter 레이블: instance=IP:9100, node label은 없을 수 있음
    # kube_node_info로 node명 ↔ internal IP 매핑
    node_info = _prom_query('kube_node_info')
    # {node: "k3s-server", internal_ip: "100.x.x.x"}
    ip_to_node: dict[str, str] = {}
    for r in node_info:
        node_name = r["metric"].get("node", "")
        internal_ip = r["metric"].get("internal_ip", "")
        if node_name and internal_ip:
            ip_to_node[internal_ip] = node_name

    def instance_to_name(instance: str) -> str:
        ip = instance.split(":")[0]
        return ip_to_node.get(ip, ip)

    cpu_results = _prom_query(
        'sum by(instance) (rate(node_cpu_seconds_total{mode!="idle"}[2m])) / sum by(instance) (rate(node_cpu_seconds_total[2m])) * 100'
    )
    mem_results = _prom_query(
        '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100'
    )
    mem_used = _prom_query('node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes')
    mem_total = _prom_query('node_memory_MemTotal_bytes')

    def extract(results: list[dict]) -> dict[str, float]:
        out = {}
        for r in results:
            instance = r["metric"].get("instance", "unknown")
            key = instance_to_name(instance)
            val = r["value"][1] if r.get("value") else "0"
            out[key] = round(float(val), 2)
        return out

    return {
        "cpu_pct": extract(cpu_results),
        "mem_pct": extract(mem_results),
        "mem_used_bytes": extract(mem_used),
        "mem_total_bytes": extract(mem_total),
    }
