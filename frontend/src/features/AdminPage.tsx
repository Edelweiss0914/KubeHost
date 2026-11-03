import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { ClusterMetrics } from '../api/client';
import type { WorkerNode } from '../domain/server';

type User = { id: string; username: string; is_admin: boolean; created_at: string };
type Invite = { id: string; code: string; single_use: boolean; created_at: string; expires_at: string | null; used_by: string | null; used_at: string | null; is_valid: boolean };
type Overview = { user_id: string; username: string; is_admin: boolean; namespace: string; server_count: number; quota: Record<string, unknown> };
type AdminServer = { id: string; name: string; status: string; owner_id: string; owner_name: string; node_id: string; cpu: number; memory_mb: number; created_at: string };

type Tab = 'users' | 'invites' | 'overview' | 'audit';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="text-button"
      style={{ fontSize: '11px' }}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? '복사됨' : '복사'}
    </button>
  );
}

function QuotaModal({ userId, username, onClose }: { userId: string; username: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [quota, setQuota] = useState({ max_cpu: 4, max_memory_mb: 8192, max_storage_gb: 100, max_servers: 10 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  useEffect(() => {
    api.adminGetUserQuota(userId)
      .then(q => setQuota(q))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  function handleClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await api.adminSetUserQuota(userId, quota);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="settings-dialog" onClick={handleClick} onCancel={onClose}>
      <div className="settings-dialog-inner">
        <div className="section-title">
          <div><span className="eyebrow">QUOTA</span><h2>{username} 쿼터</h2></div>
          <button className="secondary" onClick={onClose}>닫기</button>
        </div>
        {loading ? <p className="muted">불러오는 중…</p> : (
          <>
            <div className="form-grid">
              <label>최대 CPU (코어)
                <input type="number" value={quota.max_cpu} min={0.5} max={64} step={0.5}
                  onChange={e => setQuota(q => ({ ...q, max_cpu: Number(e.target.value) }))}/>
              </label>
              <label>최대 메모리 (MiB)
                <input type="number" value={quota.max_memory_mb} min={512} max={131072} step={512}
                  onChange={e => setQuota(q => ({ ...q, max_memory_mb: Number(e.target.value) }))}/>
              </label>
              <label>최대 스토리지 (GiB)
                <input type="number" value={quota.max_storage_gb} min={1} max={1000}
                  onChange={e => setQuota(q => ({ ...q, max_storage_gb: Number(e.target.value) }))}/>
              </label>
              <label>최대 서버 수
                <input type="number" value={quota.max_servers} min={1} max={100}
                  onChange={e => setQuota(q => ({ ...q, max_servers: Number(e.target.value) }))}/>
              </label>
            </div>
            {error && <div role="alert" className="error">{error}</div>}
            {saved && <p role="status" className="notice">저장됐습니다.</p>}
            <div className="actions">
              <button onClick={() => void save()} disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [quotaUser, setQuotaUser] = useState<{id: string; username: string} | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    api.adminListUsers()
      .then(setUsers)
      .catch(e => setError(e instanceof Error ? e.message : '불러오기 실패'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const deleteUser = (id: string, username: string) => {
    if (!confirm(`'${username}' 계정을 삭제하시겠습니까?`)) return;
    setBusy(id);
    api.adminDeleteUser(id)
      .then(load)
      .catch(e => setError(e instanceof Error ? e.message : '삭제 실패'))
      .finally(() => setBusy(''));
  };

  const toggleAdmin = (id: string, username: string) => {
    if (!confirm(`'${username}' 계정의 관리자 권한을 변경하시겠습니까?`)) return;
    setBusy(id + '-admin');
    api.adminToggleAdmin(id)
      .then(load)
      .catch(e => setError(e instanceof Error ? e.message : '변경 실패'))
      .finally(() => setBusy(''));
  };

  if (loading) return <p className="muted">불러오는 중…</p>;
  if (error) return <div className="error">{error} <button onClick={load}>재시도</button></div>;

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>사용자명</th>
            <th style={{ padding: '8px 12px' }}>권한</th>
            <th style={{ padding: '8px 12px' }}>가입일</th>
            <th style={{ padding: '8px 12px' }}>ID</th>
            <th style={{ padding: '8px 12px' }}></th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 12px' }}><strong>{u.username}</strong></td>
              <td style={{ padding: '8px 12px' }}>
                <span className="tag" style={{ background: u.is_admin ? 'var(--accent)' : undefined, color: u.is_admin ? '#fff' : undefined }}>
                  {u.is_admin ? '관리자' : '일반'}
                </span>
              </td>
              <td style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: '12px' }}>
                {new Date(u.created_at).toLocaleDateString('ko-KR')}
              </td>
              <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--muted)' }}>
                {u.id.slice(0, 8)}…
              </td>
              <td style={{ padding: '8px 12px' }}>
                <button className="secondary" onClick={() => setQuotaUser({ id: u.id, username: u.username })}>쿼터</button>
                {u.id !== currentUserId && (
                  <button
                    className="text-button"
                    style={{ fontSize: '12px', marginRight: '10px', color: 'var(--accent-text)' }}
                    disabled={busy === u.id + '-admin'}
                    onClick={() => toggleAdmin(u.id, u.username)}
                  >
                    {busy === u.id + '-admin' ? '변경 중…' : u.is_admin ? '관리자 해제' : '관리자 지정'}
                  </button>
                )}
                {u.id !== currentUserId && (
                  <button
                    className="text-button"
                    style={{ color: 'var(--error, #ef4444)', fontSize: '12px' }}
                    disabled={busy === u.id}
                    onClick={() => deleteUser(u.id, u.username)}
                  >
                    {busy === u.id ? '삭제 중…' : '삭제'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && <p className="muted" style={{ padding: '16px' }}>사용자가 없습니다.</p>}
      {quotaUser && <QuotaModal userId={quotaUser.id} username={quotaUser.username} onClose={() => setQuotaUser(null)}/>}
    </div>
  );
}

function InvitesTab() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [singleUse, setSingleUse] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api.adminListInvites()
      .then(setInvites)
      .catch(e => setError(e instanceof Error ? e.message : '불러오기 실패'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const createInvite = () => {
    setBusy('create');
    api.adminCreateInvite(singleUse, expiresAt || undefined)
      .then(() => { setExpiresAt(''); load(); })
      .catch(e => setError(e instanceof Error ? e.message : '생성 실패'))
      .finally(() => setBusy(''));
  };

  const revoke = (id: string) => {
    if (!confirm('이 초대 코드를 삭제하시겠습니까?')) return;
    setBusy(id);
    api.adminRevokeInvite(id)
      .then(load)
      .catch(e => setError(e instanceof Error ? e.message : '삭제 실패'))
      .finally(() => setBusy(''));
  };

  return (
    <div>
      {error && <div className="error" style={{ marginBottom: '12px' }}>{error}</div>}
      <div className="panel" style={{ marginBottom: '16px', padding: '16px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>초대 코드 생성</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <input type="checkbox" checked={singleUse} onChange={e => setSingleUse(e.target.checked)}/>
            일회용
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            만료일:
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              style={{ fontSize: '12px', padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px' }}
            />
          </label>
          <button onClick={createInvite} disabled={busy === 'create'} style={{ fontSize: '13px' }}>
            {busy === 'create' ? '생성 중…' : '+ 생성'}
          </button>
          <button className="secondary" style={{ fontSize: '13px' }} onClick={() => setCreating(!creating)}>
            {creating ? '닫기' : '환경변수 키 안내'}
          </button>
        </div>
        {creating && (
          <div style={{ marginTop: '12px', padding: '10px', background: 'var(--bg)', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace' }}>
            KUBEHOST_ADMIN_SECRET=kubehost 로 설정된 환경변수 키를 X-Admin-Secret 헤더로 전달하면 DB 초대 코드 없이 가입 가능합니다.
          </div>
        )}
      </div>

      {loading ? <p className="muted">불러오는 중…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>코드</th>
              <th style={{ padding: '8px 12px' }}>유형</th>
              <th style={{ padding: '8px 12px' }}>상태</th>
              <th style={{ padding: '8px 12px' }}>사용자</th>
              <th style={{ padding: '8px 12px' }}>만료</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {invites.map(inv => (
              <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)', opacity: inv.is_valid ? 1 : 0.5 }}>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '12px' }}>
                  {inv.code} <CopyButton text={inv.code}/>
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <span className="tag">{inv.single_use ? '일회용' : '다회용'}</span>
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <span className="tag" style={{ background: inv.is_valid ? 'var(--accent)' : undefined, color: inv.is_valid ? '#fff' : undefined }}>
                    {inv.is_valid ? '유효' : inv.used_by ? '사용됨' : '만료'}
                  </span>
                </td>
                <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--muted)' }}>
                  {inv.used_by ? inv.used_by.slice(0, 8) + '…' : '-'}
                </td>
                <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--muted)' }}>
                  {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString('ko-KR') : '없음'}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <button
                    className="text-button"
                    style={{ color: 'var(--error, #ef4444)', fontSize: '12px' }}
                    disabled={busy === inv.id}
                    onClick={() => revoke(inv.id)}
                  >
                    {busy === inv.id ? '삭제 중…' : '삭제'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && invites.length === 0 && <p className="muted" style={{ padding: '16px' }}>초대 코드가 없습니다.</p>}
    </div>
  );
}

function ClusterSummary({ nodes, servers }: { nodes: WorkerNode[]; servers: AdminServer[] }) {
  const workers = nodes.filter(n => n.schedulable);
  const totalCpu = workers.reduce((s, n) => s + n.cpu_capacity, 0);
  const totalMemGib = Math.round(workers.reduce((s, n) => s + n.memory_mb_capacity, 0) / 1024);
  const allocCpu = servers.reduce((s, sv) => s + sv.cpu, 0);
  const allocMemGib = Math.round(servers.reduce((s, sv) => s + sv.memory_mb, 0) / 1024);
  const cpuPct = totalCpu > 0 ? Math.min(100, Math.round(allocCpu / totalCpu * 100)) : 0;
  const memPct = totalMemGib > 0 ? Math.min(100, Math.round(allocMemGib / totalMemGib * 100)) : 0;
  const runningServers = servers.filter(s => s.status === 'running' || s.status === 'provisioning').length;

  const bar = (pct: number) => (
    <div style={{ height: '6px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden', marginTop: '6px' }}>
      <div style={{ height: '100%', width: `${pct}%`, borderRadius: '3px', transition: 'width .4s',
        background: pct >= 85 ? 'var(--warn-text)' : 'var(--accent)' }}/>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', padding: '16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ background: 'var(--surface-2)', borderRadius: '10px', padding: '14px 16px' }}>
        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '.04em' }}>노드</div>
        <div style={{ fontSize: '22px', fontWeight: 750, margin: '6px 0 2px', color: 'var(--text)' }}>
          {workers.length}<span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 400, marginLeft: '6px' }}>/ {nodes.length}개</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>스케줄 가능 Worker</div>
      </div>
      <div style={{ background: 'var(--surface-2)', borderRadius: '10px', padding: '14px 16px' }}>
        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '.04em' }}>CPU 할당</div>
        <div style={{ fontSize: '22px', fontWeight: 750, margin: '6px 0 2px', color: 'var(--text)' }}>
          {allocCpu}<span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 400, marginLeft: '6px' }}>/ {totalCpu} 코어</span>
        </div>
        {bar(cpuPct)}
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '5px' }}>{cpuPct}% 사용</div>
      </div>
      <div style={{ background: 'var(--surface-2)', borderRadius: '10px', padding: '14px 16px' }}>
        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '.04em' }}>메모리 할당</div>
        <div style={{ fontSize: '22px', fontWeight: 750, margin: '6px 0 2px', color: 'var(--text)' }}>
          {allocMemGib}<span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 400, marginLeft: '6px' }}>/ {totalMemGib} GiB</span>
        </div>
        {bar(memPct)}
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '5px' }}>{memPct}% 사용</div>
      </div>
      <div style={{ background: 'var(--surface-2)', borderRadius: '10px', padding: '14px 16px' }}>
        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '.04em' }}>서버</div>
        <div style={{ fontSize: '22px', fontWeight: 750, margin: '6px 0 2px', color: 'var(--text)' }}>
          {runningServers}<span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 400, marginLeft: '6px' }}>/ {servers.length}개</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>실행 중 / 전체</div>
      </div>
    </div>
  );
}

function OverviewTab() {
  const [overview, setOverview] = useState<Overview[]>([]);
  const [allServers, setAllServers] = useState<AdminServer[]>([]);
  const [nodes, setNodes] = useState<WorkerNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [forceStopping, setForceStopping] = useState('');
  const [clusterMetrics, setClusterMetrics] = useState<ClusterMetrics | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([api.adminOverview(), api.adminListAllServers(), api.nodes()])
      .then(([ov, servers, nd]) => { setOverview(ov); setAllServers(servers); setNodes(nd); })
      .catch(e => setError(e instanceof Error ? e.message : '불러오기 실패'))
      .finally(() => setLoading(false));
    api.clusterMetrics().then(setClusterMetrics).catch(() => {});
  };

  useEffect(load, []);

  const handleForceStop = (serverId: string, serverName: string) => {
    if (!confirm(`'${serverName}' 서버를 강제 중지하시겠습니까?`)) return;
    setForceStopping(serverId);
    api.adminForceStop(serverId)
      .then(load)
      .catch(e => setError(e instanceof Error ? e.message : '강제 중지 실패'))
      .finally(() => setForceStopping(''));
  };

  if (loading) return <p className="muted">불러오는 중…</p>;
  if (error) return <div className="error">{error} <button onClick={load}>재시도</button></div>;

  return (
    <>
    <ClusterSummary nodes={nodes} servers={allServers}/>
    {clusterMetrics && Object.keys(clusterMetrics.cpu_pct).length > 0 && (
      <div className="metrics-panel">
        <div className="section-title">
          <div><span className="eyebrow">CLUSTER METRICS</span><h2>노드 리소스 현황</h2></div>
        </div>
        <div className="metrics-grid">
          {Object.entries(clusterMetrics.cpu_pct).map(([node, pct]) => (
            <div key={node} className="metric-card">
              <span className="eyebrow">{node}</span>
              <div style={{display:'flex',gap:'2rem',marginTop:'.5rem'}}>
                <div><small className="muted">CPU</small><strong style={{display:'block'}}>{pct.toFixed(1)}%</strong></div>
                <div><small className="muted">메모리</small><strong style={{display:'block'}}>{(clusterMetrics.mem_pct[node] ?? 0).toFixed(1)}%</strong></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
          <th style={{ padding: '8px 12px' }}>사용자</th>
          <th style={{ padding: '8px 12px' }}>네임스페이스</th>
          <th style={{ padding: '8px 12px' }}>서버 수</th>
          <th style={{ padding: '8px 12px' }}>CPU 쿼터</th>
          <th style={{ padding: '8px 12px' }}>메모리 쿼터</th>
        </tr>
      </thead>
      <tbody>
        {overview.map(row => {
          const quota = row.quota as Record<string, { used: string; hard: string }>;
          const userServers = allServers.filter(s => s.owner_id === row.user_id);
          return (
            <>
              <tr
                key={row.user_id}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={() => setExpandedUser(prev => prev === row.user_id ? null : row.user_id)}
              >
                <td style={{ padding: '8px 12px' }}>
                  <strong>{row.username}</strong>
                  {row.is_admin && <span className="tag" style={{ marginLeft: '6px', background: 'var(--accent)', color: '#fff' }}>관리자</span>}
                </td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--muted)' }}>
                  {row.namespace}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>{row.server_count}</td>
                <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--muted)' }}>
                  {quota['requests.cpu'] ? `${quota['requests.cpu'].used} / ${quota['requests.cpu'].hard}` : '-'}
                </td>
                <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--muted)' }}>
                  {quota['requests.memory'] ? `${quota['requests.memory'].used} / ${quota['requests.memory'].hard}` : '-'}
                </td>
              </tr>
              {expandedUser === row.user_id && (
                <tr key={row.user_id + '-servers'}>
                  <td colSpan={5} style={{ padding: '0 12px 12px 24px', background: 'var(--surface-2)' }}>
                    {userServers.length === 0 ? (
                      <p style={{ margin: '8px 0', color: 'var(--muted)', fontSize: '12px' }}>서버 없음</p>
                    ) : (
                      <table style={{ width: '100%', fontSize: '12px' }}>
                        <tbody>
                          {userServers.map(s => (
                            <tr key={s.id}>
                              <td style={{ padding: '6px 8px' }}><strong>{s.name}</strong></td>
                              <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{s.node_id}</td>
                              <td style={{ padding: '6px 8px' }}>
                                <span className={`status status-${s.status}`}>{s.status}</span>
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                {s.status === 'running' || s.status === 'provisioning' ? (
                                  <button
                                    className="text-button"
                                    style={{ color: 'var(--error-text)', fontSize: '12px' }}
                                    disabled={forceStopping === s.id}
                                    onClick={e => { e.stopPropagation(); handleForceStop(s.id, s.name); }}
                                  >
                                    {forceStopping === s.id ? '중지 중…' : '강제 중지'}
                                  </button>
                                ) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </td>
                </tr>
              )}
            </>
          );
        })}
      </tbody>
    </table>
    </>
  );
}

type AuditEntry = {
  id: string; timestamp: string; actor_id: string; actor_name: string;
  action: string; target_id: string; target_name: string; result: string; detail: string;
};

const ACTION_LABEL: Record<string, string> = {
  'server.create': '서버 생성',
  'server.delete': '서버 삭제',
  'server.start': '서버 시작',
  'server.stop': '서버 중지',
  'server.force_stop': '강제 중지',
  'auth.login': '로그인',
  'user.delete': '사용자 삭제',
  'user.toggle_admin': '권한 변경',
  'invite.create': '초대 코드 생성',
  'invite.revoke': '초대 코드 삭제',
};

function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const load = (action?: string) => {
    setLoading(true);
    setError('');
    api.adminListAuditLogs({ action: action || undefined, limit: 200 })
      .then(setEntries)
      .catch(e => setError(e instanceof Error ? e.message : '불러오기 실패'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const actions = Array.from(new Set(Object.keys(ACTION_LABEL)));

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', padding: '16px 16px 0' }}>
        <button
          className={`filter-chip${!actionFilter ? ' selected' : ''}`}
          onClick={() => { setActionFilter(''); load(); }}
        >전체</button>
        {actions.map(a => (
          <button
            key={a}
            className={`filter-chip${actionFilter === a ? ' selected' : ''}`}
            onClick={() => { setActionFilter(a); load(a); }}
          >{ACTION_LABEL[a] ?? a}</button>
        ))}
      </div>
      {error && <div className="error" style={{ margin: '0 16px 12px' }}>{error}</div>}
      {loading ? <p className="muted" style={{ padding: '16px' }}>불러오는 중…</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>시각</th>
                <th style={{ padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>행위자</th>
                <th style={{ padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>동작</th>
                <th style={{ padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>대상</th>
                <th style={{ padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>결과</th>
                <th style={{ padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>상세</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {new Date(e.timestamp).toLocaleString('ko-KR')}
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{e.actor_name}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span className="tag" style={{
                      background: e.action.startsWith('server') ? 'var(--accent-bg)' :
                                  e.action.startsWith('auth') ? 'var(--success-bg)' :
                                  e.action.startsWith('user') ? 'var(--warn-bg)' : 'var(--surface-2)',
                      color: e.action.startsWith('server') ? 'var(--accent-text)' :
                             e.action.startsWith('auth') ? 'var(--success-text)' :
                             e.action.startsWith('user') ? 'var(--warn-text)' : 'var(--muted)',
                    }}>
                      {ACTION_LABEL[e.action] ?? e.action}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px' }}>
                    {e.target_name}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ color: e.result === 'ok' ? 'var(--success-text)' : 'var(--error-text)', fontWeight: 600 }}>
                      {e.result === 'ok' ? '성공' : '실패'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: '11px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.detail || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && <p className="muted" style={{ padding: '16px' }}>로그가 없습니다.</p>}
        </div>
      )}
    </div>
  );
}

export function AdminPage({ currentUserId }: { currentUserId: string }) {
  const [tab, setTab] = useState<Tab>('users');

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '8px 20px',
    fontSize: '13px',
    fontWeight: tab === t ? 600 : 400,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
    color: tab === t ? 'var(--text)' : 'var(--muted)',
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
        <button style={tabStyle('users')} onClick={() => setTab('users')}>사용자 관리</button>
        <button style={tabStyle('invites')} onClick={() => setTab('invites')}>초대 코드</button>
        <button style={tabStyle('overview')} onClick={() => setTab('overview')}>테넌트 현황</button>
        <button style={tabStyle('audit')} onClick={() => setTab('audit')}>감사 로그</button>
      </div>
      <section className="panel" style={{ padding: '0' }}>
        {tab === 'users' && <UsersTab currentUserId={currentUserId}/>}
        {tab === 'invites' && <InvitesTab/>}
        {tab === 'overview' && <OverviewTab/>}
        {tab === 'audit' && <AuditTab/>}
      </section>
    </div>
  );
}
