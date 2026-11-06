import type { Server, TopologyPod, WorkerNode } from '../domain/server';
import { Status } from '../components/Status';

type Props = {
  nodes: WorkerNode[];
  servers: Server[];
  pods: TopologyPod[];
  onSelect: (id: string) => void;
};

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
        <Status value={server.status === 'stopped' ? 'stopped' : pod.containers.some(container => container.ready) ? 'running' : pod.phase === 'Failed' ? 'error' : 'provisioning'} />
        <span aria-hidden="true">↗</span>
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
    {nodes.length === 0 ? <p className="muted hierarchy-empty">표시할 노드가 없습니다.</p> : <ul className="hierarchy-nodes">
      {nodes.map(node => {
        const nodePods = ownedPods.filter(pod => pod.node_id === node.id);
        const withoutPod = servers.filter(server => server.node_id === node.id && !podServers.has(server.id));
        return <li className="hierarchy-node" key={node.id}>
          <div className="hierarchy-row"><span className="hierarchy-kind">{node.role === 'worker' ? '호스트 서버' : '관리 서버'}</span>
            <strong>{node.name}</strong><Status value={node.status}/></div>
          <small>{nodePods.length}개 서버 인스턴스 · {node.cpu_capacity} 코어 · {node.memory_mb_capacity.toLocaleString()} MiB</small>
          {nodePods.length > 0 && <ul className="hierarchy-pod-list">{nodePods.map(renderPod)}</ul>}
          {withoutPod.length > 0 && <div className="hierarchy-unplaced"><span className="hierarchy-kind">인스턴스 없음</span>
            {withoutPod.map(server => <button key={server.id} onClick={() => onSelect(server.id)}>{server.name} · {server.status === 'stopped' ? '중지됨' : '배치 대기'}</button>)}</div>}
          {nodePods.length === 0 && withoutPod.length === 0 && <p className="muted hierarchy-empty">표시할 워크로드가 없습니다.</p>}
        </li>;
      })}
    </ul>}
    {unscheduledPods.length > 0 && <div className="hierarchy-unscheduled"><h3>노드 배치 대기</h3><ul className="hierarchy-pod-list">{unscheduledPods.map(renderPod)}</ul></div>}
    {failedPods.length > 0 && <div className="hierarchy-unscheduled"><h3>스케줄링 실패</h3><ul className="hierarchy-pod-list">{failedPods.map(renderPod)}</ul></div>}
  </section>;
}

export function ClusterMap({ nodes, servers, pods, onSelect }: Props) {
  const workers = nodes.filter(n => n.role === 'worker');

  if (workers.length === 0) {
    return (
      <div className="cluster-page"><div className="panel empty">
        <div className="empty-icon" aria-hidden="true">▧</div>
        <p>표시할 호스트 서버가 없습니다.</p>
      </div><Hierarchy nodes={nodes} servers={servers} pods={pods} onSelect={onSelect}/></div>
    );
  }

  return (
    <div className="cluster-page"><div className="cluster-map">
      {workers.map(node => {
        const assigned = servers.filter(s => s.node_id === node.id);
        const usedCpu = assigned.reduce((sum, s) => sum + s.cpu, 0);
        const usedMem = assigned.reduce((sum, s) => sum + s.memory_mb, 0);

        return (
          <div key={node.id} className="cluster-node">
            <div className="cluster-node-header">
              <div className="cluster-node-info">
                <span className="node-icon" aria-hidden="true">▧</span>
                <div>
                  <strong>{node.name}</strong>
                  <small>호스트 서버 · {node.cpu_capacity} 코어 · {node.memory_mb_capacity.toLocaleString()} MiB</small>
                </div>
              </div>
              <Status value={node.status} />
            </div>

            <div className="cluster-resources">
              <ResourceBar label="CPU" used={usedCpu} total={node.cpu_capacity} unit="코어" />
              <ResourceBar label="MEM" used={usedMem} total={node.memory_mb_capacity} unit="MiB" />
            </div>

            <div className="cluster-pods-label">
              <span className="muted" style={{fontSize:'11px'}}>서버</span>
              <span className="count">{assigned.length}개</span>
            </div>

            {assigned.length === 0 ? (
              <p className="muted" style={{ fontSize: '12px', marginTop: '8px' }}>배포된 서버가 없습니다.</p>
            ) : (
              <div className="cluster-pods">
                {assigned.map(server => (
                  <button key={server.id} className="cluster-pod" onClick={() => onSelect(server.id)}>
                    <div className="cluster-pod-top">
                      <span className="cluster-pod-name">{server.name}</span>
                      <Status value={server.status} />
                    </div>
                    <div className="cluster-pod-meta">
                      <span>{server.version}</span>
                      <span>{server.cpu}c · {server.memory_mb.toLocaleString()} MiB</span>
                    </div>
                    {server.connection
                      ? <div className="cluster-pod-conn">⇢ {server.connection}</div>
                      : <div className="cluster-pod-conn muted">포트 미할당</div>}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div><Hierarchy nodes={nodes} servers={servers} pods={pods} onSelect={onSelect}/></div>
  );
}
