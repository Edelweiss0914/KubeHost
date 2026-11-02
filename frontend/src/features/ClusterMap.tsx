import type { Server, WorkerNode } from '../domain/server';
import { Status } from '../components/Status';

type Props = {
  nodes: WorkerNode[];
  servers: Server[];
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

export function ClusterMap({ nodes, servers, onSelect }: Props) {
  const workers = nodes.filter(n => n.role === 'worker');

  if (workers.length === 0) {
    return (
      <div className="panel empty">
        <div className="empty-icon" aria-hidden="true">▧</div>
        <p>표시할 Worker 노드가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="cluster-map">
      {workers.map(node => {
        const pods = servers.filter(s => s.node_id === node.id);
        const usedCpu = pods.reduce((sum, s) => sum + s.cpu, 0);
        const usedMem = pods.reduce((sum, s) => sum + s.memory_mb, 0);

        return (
          <div key={node.id} className="cluster-node">
            <div className="cluster-node-header">
              <div className="cluster-node-info">
                <span className="node-icon" aria-hidden="true">▧</span>
                <div>
                  <strong>{node.name}</strong>
                  <small>Worker · {node.cpu_capacity} 코어 · {node.memory_mb_capacity.toLocaleString()} MiB</small>
                </div>
              </div>
              <Status value={node.status} />
            </div>

            <div className="cluster-resources">
              <ResourceBar label="CPU" used={usedCpu} total={node.cpu_capacity} unit="코어" />
              <ResourceBar label="MEM" used={usedMem} total={node.memory_mb_capacity} unit="MiB" />
            </div>

            <div className="cluster-pods-label">
              <span className="eyebrow">PODS</span>
              <span className="count">{pods.length}개</span>
            </div>

            {pods.length === 0 ? (
              <p className="muted" style={{ fontSize: '12px', marginTop: '8px' }}>배포된 서버가 없습니다.</p>
            ) : (
              <div className="cluster-pods">
                {pods.map(server => (
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
    </div>
  );
}
