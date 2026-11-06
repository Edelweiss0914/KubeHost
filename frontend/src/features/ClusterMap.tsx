import { useState, useMemo } from 'react';
import type { Server, TopologyPod, WorkerNode } from '../domain/server';
import { Status } from '../components/Status';
import { ArrowUpRight, Map as MapIcon, HardDrive, Share2, Package } from 'lucide-react';

type Props = {
  nodes: WorkerNode[];
  servers: Server[];
  pods: TopologyPod[];
  onSelect: (id: string) => void;
};

// ── ResourceBar ───────────────────────────────────────────────────────────────
function ResourceBar({ label, used, total, unit }: { label: string; used: number; total: number; unit: string }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className="res-bar">
      <div className="res-bar-label">
        <span>{label}</span>
        <span className="res-bar-nums">{used.toLocaleString()} / {total.toLocaleString()} {unit}</span>
      </div>
      <div className="res-bar-track">
        <div className={`res-bar-fill${pct > 80 ? ' res-bar-warn' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Hierarchy (text tree view) ────────────────────────────────────────────────
function Hierarchy({ nodes, servers, pods, onSelect }: Props) {
  const visible = new Set(servers.map(server => server.id));
  const ownedPods = pods.filter(pod => visible.has(pod.server_id));
  const podServers = new Set(ownedPods.map(pod => pod.server_id));
  const serverById = new Map(servers.map(server => [server.id, server]));
  const unscheduledPods = ownedPods.filter(pod => (!pod.node_id || !nodes.some(node => node.id === pod.node_id)) && pod.phase !== 'Failed');
  const failedPods = ownedPods.filter(pod => (!pod.node_id || !nodes.some(node => node.id === pod.node_id)) && pod.phase === 'Failed');

  function renderPod(pod: TopologyPod) {
    const server = serverById.get(pod.server_id);
    return <li className="hierarchy-pod" key={`${pod.namespace}/${pod.name}`}>
      <div className="hierarchy-row">
        <span className="hierarchy-kind">서버 인스턴스</span>
        <strong>{pod.name}</strong>
        <span className="hierarchy-phase">{pod.phase}{pod.simulated ? ' · 모의' : ''}</span>
      </div>
      <small>{pod.namespace}</small>
      <div className="hierarchy-containers">
        {pod.containers.map(container => <span className="hierarchy-container" key={container.name}>
          컨테이너 {container.name} · {container.ready ? '준비됨' : container.state}
        </span>)}
      </div>
      {server && <button className="hierarchy-server" onClick={() => onSelect(server.id)}>
        <span className="hierarchy-kind">게임 서버</span>
        <strong>{server.name}</strong>
        <Status value={server.status === 'stopped' ? 'stopped' : pod.containers.some(c => c.ready) ? 'running' : pod.phase === 'Failed' ? 'error' : 'provisioning'} />
        <ArrowUpRight size={14} aria-hidden="true"/>
      </button>}
    </li>;
  }

  return <section className="panel hierarchy" aria-labelledby="hierarchy-title">
    <div className="section-title">
      <div><h2 id="hierarchy-title">서버 배치 현황</h2>
        <p className="section-copy">환경 → 호스트 → 게임 서버</p></div>
      <span className="tag">호스트 {nodes.length} · 인스턴스 {ownedPods.length} · 서버 {servers.length}</span>
    </div>
    <div className="hierarchy-root"><span className="hierarchy-kind">서버 환경</span><strong>KubeHost</strong></div>
    {nodes.length === 0
      ? <p className="muted hierarchy-empty">표시할 노드가 없습니다.</p>
      : <ul className="hierarchy-nodes">
        {nodes.map(node => {
          const nodePods = ownedPods.filter(pod => pod.node_id === node.id);
          const withoutPod = servers.filter(s => s.node_id === node.id && !podServers.has(s.id));
          return <li className="hierarchy-node" key={node.id}>
            <div className="hierarchy-row">
              <span className="hierarchy-kind">{node.role === 'worker' ? '호스트 서버' : '관리 서버'}</span>
              <strong>{node.name}</strong><Status value={node.status}/>
            </div>
            <small>{nodePods.length}개 서버 인스턴스 · {node.cpu_capacity} 코어 · {node.memory_mb_capacity.toLocaleString()} MiB</small>
            {nodePods.length > 0 && <ul className="hierarchy-pod-list">{nodePods.map(renderPod)}</ul>}
            {withoutPod.length > 0 && <div className="hierarchy-unplaced">
              <span className="hierarchy-kind">인스턴스 없음</span>
              {withoutPod.map(s => <button key={s.id} onClick={() => onSelect(s.id)}>{s.name} · {s.status === 'stopped' ? '중지됨' : '배치 대기'}</button>)}
            </div>}
            {nodePods.length === 0 && withoutPod.length === 0 && <p className="muted hierarchy-empty">표시할 워크로드가 없습니다.</p>}
          </li>;
        })}
      </ul>}
    {unscheduledPods.length > 0 && <div className="hierarchy-unscheduled"><h3>노드 배치 대기</h3><ul className="hierarchy-pod-list">{unscheduledPods.map(renderPod)}</ul></div>}
    {failedPods.length > 0 && <div className="hierarchy-unscheduled"><h3>스케줄링 실패</h3><ul className="hierarchy-pod-list">{failedPods.map(renderPod)}</ul></div>}
  </section>;
}

// ── Topology layout ───────────────────────────────────────────────────────────
const W = 900, H = 500;
const HUB_X = W / 2, HUB_Y = H / 2;
const WORKER_DIST = 160;
const POD_DIST = 95;

function sColor(s: string): string {
  const l = s.toLowerCase();
  if (l === 'running' || l === 'ready') return '#22c55e';
  if (l === 'provisioning' || l === 'pending') return '#f59e0b';
  if (l === 'error' || l === 'failed' || l === 'not-ready') return '#ef4444';
  return '#6b7280';
}

function pct(v: number, dim: number): string {
  return `${(v / dim * 100).toFixed(2)}%`;
}

// Quadratic bezier with perpendicular control point offset
function curvePath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return `M${pct(x1,W)} ${pct(y1,H)}L${pct(x2,W)} ${pct(y2,H)}`;
  const offset = Math.min(len * 0.28, 55);
  const cpx = mx + (-dy / len) * offset;
  const cpy = my + (dx / len) * offset;
  return `M${pct(x1,W)} ${pct(y1,H)}Q${pct(cpx,W)} ${pct(cpy,H)} ${pct(x2,W)} ${pct(y2,H)}`;
}

// Deterministic jitter per server ID for organic feel
function jitter(id: string): [number, number] {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h ^ id.charCodeAt(i), 0x1000193)) >>> 0;
  return [((h & 0xff) - 128) * 0.14, ((h >> 8 & 0xff) - 128) * 0.14];
}

type Selected =
  | { kind: 'worker'; data: WorkerNode }
  | { kind: 'server'; data: Server };

// ── Topology canvas (HTML nodes + SVG lines) ──────────────────────────────────
function TopologyCanvas({ nodes, servers, pods, onSelect }: Props) {
  const [selected, setSelected] = useState<Selected | null>(null);

  const workers = nodes.filter(n => n.role === 'worker');
  const podByServerId = useMemo(() => new Map(pods.map(pod => [pod.server_id, pod])), [pods]);

  const layout = useMemo(() => {
    const wp = workers.map((node, i) => {
      // Single worker: place to the right (angle=0) to avoid vertical stack
      const angle = workers.length === 1
        ? 0
        : (2 * Math.PI * i / workers.length);
      return { node, x: HUB_X + WORKER_DIST * Math.cos(angle), y: HUB_Y + WORKER_DIST * Math.sin(angle), angle };
    });

    const pp: Array<{ server: Server; pod?: TopologyPod; x: number; y: number; wx: number; wy: number }> = [];
    for (const { node, x: wx, y: wy, angle: wa } of wp) {
      const ns = servers.filter(s => s.node_id === node.id);
      const n = ns.length;
      if (!n) continue;
      const step = n === 1 ? 0 : Math.min(32 * Math.PI / 180, (110 * Math.PI / 180) / (n - 1));
      ns.forEach((server, i) => {
        const a = wa + (i - (n - 1) / 2) * step;
        const [jx, jy] = jitter(server.id);
        pp.push({ server, pod: podByServerId.get(server.id), x: wx + POD_DIST * Math.cos(a) + jx, y: wy + POD_DIST * Math.sin(a) + jy, wx, wy });
      });
    }
    return { wp, pp };
  }, [workers, servers, podByServerId]);

  function toggleWorker(node: WorkerNode) {
    setSelected(s => s?.kind === 'worker' && s.data.id === node.id ? null : { kind: 'worker', data: node });
  }
  function toggleServer(server: Server) {
    setSelected(s => s?.kind === 'server' && s.data.id === server.id ? null : { kind: 'server', data: server });
  }

  return (
    <>
      <div className="topo-wrap">
        {/* SVG layer — lines only */}
        <svg className="topo-svg" aria-hidden="true">
          {layout.wp.map(({ node, x, y }) => (
            <path key={`he-${node.id}`}
              d={curvePath(HUB_X, HUB_Y, x, y)}
              fill="none" stroke={sColor(node.status)} strokeWidth={2} strokeOpacity={0.45} />
          ))}
          {layout.pp.map(({ server, x, y, wx, wy }) => (
            <path key={`pe-${server.id}`}
              d={curvePath(wx, wy, x, y)}
              fill="none" stroke={sColor(server.status)} strokeWidth={1.5} strokeOpacity={0.35} />
          ))}
        </svg>

        {/* Hub */}
        <div className="topo-node topo-hub" style={{ left: pct(HUB_X, W), top: pct(HUB_Y, H) }}>
          <div className="topo-icon" style={{ borderColor: 'var(--accent)', background: 'var(--accent-bg)' }}>
            <Share2 size={28} color="var(--accent-text)" />
          </div>
          <span className="topo-label" style={{ color: 'var(--accent-text)', fontWeight: 700 }}>KubeHost</span>
        </div>

        {/* Worker nodes */}
        {layout.wp.map(({ node, x, y }) => {
          const sel = selected?.kind === 'worker' && selected.data.id === node.id;
          const col = sColor(node.status);
          return (
            <div key={node.id}
              className={`topo-node topo-worker${sel ? ' topo-sel' : ''}`}
              style={{ left: pct(x, W), top: pct(y, H) }}
              onClick={() => toggleWorker(node)}
              role="button" tabIndex={0}
              aria-label={node.name}
              onKeyDown={e => { if (e.key === 'Enter') toggleWorker(node); }}>
              <div className="topo-icon" style={{ borderColor: sel ? 'var(--accent)' : col, background: sel ? 'var(--accent-bg)' : 'var(--surface-2)' }}>
                <HardDrive size={24} color={sel ? 'var(--accent-text)' : col} />
              </div>
              <span className="topo-label">{node.name.length > 12 ? node.name.slice(0, 11) + '…' : node.name}</span>
            </div>
          );
        })}

        {/* Pod / server nodes */}
        {layout.pp.map(({ server, x, y }) => {
          const sel = selected?.kind === 'server' && selected.data.id === server.id;
          const col = sColor(server.status);
          return (
            <div key={server.id}
              className={`topo-node topo-pod${sel ? ' topo-sel' : ''}`}
              style={{ left: pct(x, W), top: pct(y, H) }}
              onClick={() => toggleServer(server)}
              role="button" tabIndex={0}
              aria-label={server.name}
              onKeyDown={e => { if (e.key === 'Enter') toggleServer(server); }}>
              <div className="topo-icon" style={{ borderColor: sel ? 'var(--accent)' : col, background: sel ? 'var(--accent-bg)' : 'var(--surface)' }}>
                <Package size={18} color={sel ? 'var(--accent-text)' : col} />
              </div>
              <span className="topo-label">{server.name.length > 11 ? server.name.slice(0, 10) + '…' : server.name}</span>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="topo-detail">
          {selected.kind === 'worker'
            ? <WorkerDetail node={selected.data} servers={servers} />
            : <ServerDetail server={selected.data} pods={pods} onSelect={onSelect} />}
        </div>
      )}
    </>
  );
}

// ── Detail panels ─────────────────────────────────────────────────────────────
function WorkerDetail({ node, servers }: { node: WorkerNode; servers: Server[] }) {
  const ns = servers.filter(s => s.node_id === node.id);
  const cpuUsed = Math.round(node.cpu_requested_m / 100) / 10;
  return (
    <div className="topo-detail-inner">
      <div className="topo-detail-row">
        <div>
          <span className="hierarchy-kind">{node.role === 'worker' ? '호스트 서버' : '관리 서버'}</span>
          <strong className="topo-detail-name">{node.name}</strong>
        </div>
        <Status value={node.status.toLowerCase() === 'ready' ? 'running' : 'error'} />
      </div>
      <small className="muted">
        {node.cpu_capacity} 코어 · {(node.memory_mb_capacity / 1024).toFixed(0)} GiB RAM · 서버 {ns.length}개{node.schedulable ? '' : ' · 스케줄 불가'}
      </small>
      <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
        <ResourceBar label="CPU" used={cpuUsed} total={node.cpu_capacity} unit="코어" />
        <ResourceBar label="MEM" used={node.memory_mb_requested} total={node.memory_mb_capacity} unit="MiB" />
      </div>
    </div>
  );
}

function ServerDetail({ server, pods, onSelect }: { server: Server; pods: TopologyPod[]; onSelect: (id: string) => void }) {
  const pod = pods.find(p => p.server_id === server.id);
  return (
    <div className="topo-detail-inner">
      <div className="topo-detail-row">
        <div>
          <span className="hierarchy-kind">게임 서버</span>
          <strong className="topo-detail-name">{server.name}</strong>
        </div>
        <Status value={server.status} />
      </div>
      <small className="muted">
        {server.game}{server.version ? ` · ${server.version}` : ''} · {server.node_id}
      </small>
      <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--muted)' }}>
        <div>{server.cpu} vCPU · {(server.memory_mb / 1024).toFixed(0)} GiB · {server.storage_gb} GiB 스토리지</div>
        {pod && <div style={{ marginTop: '4px' }}>파드: {pod.phase}{pod.simulated ? ' · 모의' : ''}</div>}
      </div>
      {server.connection && (
        <code style={{ display: 'block', marginTop: '8px', fontSize: '12px' }}>{server.connection}</code>
      )}
      <button className="secondary" style={{ marginTop: '12px' }} onClick={() => onSelect(server.id)}>
        서버 상세 보기 <ArrowUpRight size={12} style={{ marginLeft: 4 }} />
      </button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function ClusterMap({ nodes, servers, pods, onSelect }: Props) {
  const workers = nodes.filter(n => n.role === 'worker');

  if (workers.length === 0) {
    return (
      <div className="cluster-page">
        <div className="panel empty">
          <div className="empty-icon" aria-hidden="true"><MapIcon size={48}/></div>
          <p>표시할 호스트 서버가 없습니다.</p>
        </div>
        <Hierarchy nodes={nodes} servers={servers} pods={pods} onSelect={onSelect}/>
      </div>
    );
  }

  return (
    <div className="cluster-page">
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>클러스터 토폴로지</h2>
            <p className="section-copy">노드를 클릭해 리소스를 확인하고, 서버를 클릭해 상세 정보를 볼 수 있습니다.</p>
          </div>
          <span className="tag">노드 {workers.length} · 서버 {servers.length}</span>
        </div>
        <TopologyCanvas nodes={nodes} servers={servers} pods={pods} onSelect={onSelect} />
      </section>
      <Hierarchy nodes={nodes} servers={servers} pods={pods} onSelect={onSelect}/>
    </div>
  );
}
