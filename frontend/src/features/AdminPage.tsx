import { useEffect, useState } from 'react';
import { api } from '../api/client';

type User = { id: string; username: string; is_admin: boolean; created_at: string };
type Invite = { id: string; code: string; single_use: boolean; created_at: string; expires_at: string | null; used_by: string | null; used_at: string | null; is_valid: boolean };
type Overview = { user_id: string; username: string; is_admin: boolean; namespace: string; server_count: number; quota: Record<string, unknown> };

type Tab = 'users' | 'invites' | 'overview';

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

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

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

function OverviewTab() {
  const [overview, setOverview] = useState<Overview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api.adminOverview()
      .then(setOverview)
      .catch(e => setError(e instanceof Error ? e.message : '불러오기 실패'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) return <p className="muted">불러오는 중…</p>;
  if (error) return <div className="error">{error} <button onClick={load}>재시도</button></div>;

  return (
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
          return (
            <tr key={row.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
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
          );
        })}
      </tbody>
    </table>
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
      </div>
      <section className="panel" style={{ padding: '0' }}>
        {tab === 'users' && <UsersTab currentUserId={currentUserId}/>}
        {tab === 'invites' && <InvitesTab/>}
        {tab === 'overview' && <OverviewTab/>}
      </section>
    </div>
  );
}
