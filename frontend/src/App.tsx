import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api/client';
import type { NamespaceMetrics } from './api/client';
import { MetricsChart } from './components/MetricsChart';
import { useConsole } from './application/useConsole';
import { useInactivityTimer, formatRemaining } from './application/useInactivityTimer';
import type { Server, ServerInput } from './domain/server';
import { Status } from './components/Status';
import { CreateServer } from './features/CreateServer';
import { ServerList } from './features/ServerList';
import { ServerDetail } from './features/ServerDetail';
import { ClusterMap } from './features/ClusterMap';
import { Login } from './features/Login';
import { Landing } from './features/Landing';
import { AdminPage } from './features/AdminPage';
import { useToast, ToastContainer } from './components/Toast';

function getStoredAuth(): { token: string; username: string } | null {
  try {
    const token = localStorage.getItem('kubehost-token');
    const username = localStorage.getItem('kubehost-username');
    return token && username ? { token, username } : null;
  } catch { return null; }
}

type View = 'dashboard' | 'servers' | 'create' | 'detail' | 'cluster' | 'admin';

type QuotaEntry = { used: string; hard: string };
type TenantInfo = { namespace: string; quota: Record<string, QuotaEntry> };

function QuotaBar({ label, entry }: { label: string; entry: QuotaEntry }) {
  const parse = (v: string) => parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
  const pct = Math.min(100, Math.round((parse(entry.used) / parse(entry.hard)) * 100));
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
  return <div style={{marginBottom:'8px'}}>
    <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',marginBottom:'3px'}}>
      <span>{label}</span><span style={{color:'var(--muted)'}}>{entry.used} / {entry.hard}</span>
    </div>
    <div style={{height:'6px',background:'var(--border)',borderRadius:'3px'}}>
      <div style={{width:`${pct}%`,height:'100%',background:color,borderRadius:'3px',transition:'width .3s'}}/>
    </div>
  </div>;
}


function Dashboard({ servers, retainedCount, tenant, onSelect, onCreate }: {
  servers: Server[];
  retainedCount: number;
  tenant: TenantInfo | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const [nsMetrics, setNsMetrics] = useState<NamespaceMetrics | null>(null);
  useEffect(() => {
    const load = () => api.namespaceMetrics(60).then(setNsMetrics).catch(() => {});
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const running = servers.filter(server => server.status === 'running').length;
  const provisioning = servers.filter(server => server.status === 'provisioning').length;
  const recent = [...servers].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4);

  return <div className="mission-grid">
    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow">KUBEHOST / MISSION CONTROL</span>
        <h2>클러스터의 모든 흐름을<br/>한 화면에서.</h2>
        <p>노드 상태와 워크로드를 실시간으로 살피고 다음 배포를 준비하세요.</p>
      </div>
      <div className="hero-actions"><button onClick={onCreate}>새 서버 배포 <span aria-hidden="true">↗</span></button></div>
    </section>
    <div className="stats">
      <article><span className="stat-icon" aria-hidden="true">▦</span><span>전체 서버</span><strong>{servers.length}</strong><p className="stat-meta">관리 중인 인스턴스</p></article>
      <article><span className="stat-icon" aria-hidden="true">●</span><span>실행 중</span><strong>{running}</strong><p className="stat-meta">서비스 제공 중</p></article>
      <article><span className="stat-icon" aria-hidden="true">◷</span><span>준비 중</span><strong>{provisioning}</strong><p className="stat-meta">배포 진행 중</p></article>
      <article><span className="stat-icon" aria-hidden="true">▤</span><span>보존 데이터</span><strong>{retainedCount}</strong><p className="stat-meta">복원 가능한 서버</p></article>
    </div>
    <section className="panel mission-activity">
        <div className="section-title"><div><span className="eyebrow">ACTIVITY</span><h2>최근 서버</h2><p className="section-copy">가장 최근에 생성한 서버입니다.</p></div><span className="tag">최근 {recent.length}개</span></div>
        {recent.length ? <ul className="activity">{recent.map(server => <li key={server.id}>
          <span className="demo-dot"/>
          <div>
            <button className="text-button" onClick={() => onSelect(server.id)}>{server.name}</button>
            <small>{new Date(server.created_at).toLocaleString('ko-KR')} · 생성</small>
          </div>
          <Status value={server.status}/>
        </li>)}</ul> : <p className="muted">아직 생성한 서버가 없습니다. 첫 서버를 만들어 보세요.</p>}
    </section>
    {tenant && <section className="panel mission-quota">
      <div className="section-title">
        <div><span className="eyebrow">TENANT</span><h2>내 네임스페이스</h2>
          <p className="section-copy" style={{fontFamily:'monospace',fontSize:'12px'}}>{tenant.namespace}</p>
        </div>
        <span className="tag">리소스 쿼터</span>
      </div>
      <div style={{padding:'8px 0'}}>
        {tenant.quota['requests.cpu'] && <QuotaBar label="CPU" entry={tenant.quota['requests.cpu']}/>}
        {tenant.quota['requests.memory'] && <QuotaBar label="메모리" entry={tenant.quota['requests.memory']}/>}
        {tenant.quota['requests.storage'] && <QuotaBar label="스토리지" entry={tenant.quota['requests.storage']}/>}
        {tenant.quota['pods'] && <QuotaBar label="파드" entry={tenant.quota['pods']}/>}
      </div>
    </section>}
    {nsMetrics && (
      <section className="panel metrics-panel">
        <div className="section-title">
          <div><span className="eyebrow">NAMESPACE METRICS</span><h2>리소스 사용 추이</h2></div>
          <span className="muted" style={{fontSize:'12px'}}>최근 1시간</span>
        </div>
        <div className="metrics-grid">
          <MetricsChart title="CPU (cores)" data={nsMetrics.cpu} color="#79aaff" unit="cpu" />
          <MetricsChart title="메모리" data={nsMetrics.memory_bytes} color="#34d399" unit="bytes" />
        </div>
      </section>
    )}
  </div>;
}

function SessionExpiredModal({ onRelogin }: { onRelogin: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  return (
    <dialog ref={dialogRef} className="session-expired-dialog" onCancel={e => e.preventDefault()}>
      <div className="session-expired-inner">
        <div className="session-expired-icon" aria-hidden="true">⏱</div>
        <h2 className="session-expired-title">세션이 만료되었습니다</h2>
        <p className="session-expired-msg">활동이 없어 자동으로 로그아웃 되었습니다.</p>
        <button className="session-expired-btn" onClick={onRelogin}>다시 로그인</button>
      </div>
    </dialog>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  function handleClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { setError('새 비밀번호가 일치하지 않습니다.'); return; }
    if (next.length < 8) { setError('새 비밀번호는 8자 이상이어야 합니다.'); return; }
    setSaving(true); setError('');
    try {
      await api.changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '변경 실패');
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="settings-dialog" onClick={handleClick} onCancel={onClose}>
      <div className="settings-dialog-inner">
        <div className="section-title">
          <div><span className="eyebrow">ACCOUNT</span><h2>비밀번호 변경</h2></div>
          <button className="secondary" onClick={onClose}>닫기</button>
        </div>
        {done ? (
          <>
            <p role="status" className="notice">비밀번호가 변경됐습니다.</p>
            <div className="actions"><button onClick={onClose}>닫기</button></div>
          </>
        ) : (
          <form onSubmit={e => void submit(e)}>
            <div className="form-grid">
              <label className="full">현재 비밀번호
                <input type="password" value={current} onChange={e => setCurrent(e.target.value)} required autoFocus/>
              </label>
              <label className="full">새 비밀번호
                <input type="password" value={next} onChange={e => setNext(e.target.value)} required minLength={8}/>
              </label>
              <label className="full">새 비밀번호 확인
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required/>
              </label>
            </div>
            {error && <div role="alert" className="error">{error}</div>}
            <div className="actions">
              <button type="submit" disabled={saving}>{saving ? '변경 중…' : '변경'}</button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}

type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = window.localStorage.getItem('kubehost-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Storage may be unavailable in private mode. */ }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function App() {
  const { servers, retained, nodes, topologyPods, tenant, loading, error, refresh } = useConsole();
  const [auth, setAuth] = useState<{ token: string; username: string } | null>(getStoredAuth);
  const [showLogin, setShowLogin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [view, setView] = useState<View>('dashboard');
  const [selected, setSelected] = useState<Server | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [showChangePw, setShowChangePw] = useState(false);
  const [showSessionExpired, setShowSessionExpired] = useState(false);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToast();
  const prevServersRef = useRef<Map<string, string>>(new Map());

  function handleAutoLogout() {
    try { localStorage.removeItem('kubehost-token'); localStorage.removeItem('kubehost-username'); } catch { /* ignore */ }
    setAuth(null);
    setShowSessionExpired(true);
  }

  const sessionRemaining = useInactivityTimer(handleAutoLogout, !!auth);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#080d1e' : '#edf2fb');
    try { window.localStorage.setItem('kubehost-theme', theme); } catch { /* Storage is optional. */ }
  }, [theme]);

  // After login, reload servers/retained and fetch admin status.
  useEffect(() => {
    if (auth) {
      void refresh();
      api.me().then(u => { setIsAdmin(u.is_admin); setCurrentUserId(u.id); }).catch(() => setIsAdmin(false));
    } else {
      setIsAdmin(false);
      setCurrentUserId('');
    }
  }, [auth]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ((view !== 'dashboard' && view !== 'cluster' && view !== 'servers' && view !== 'detail') || !auth) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh(true);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [auth, refresh, view]);

  // polling 후 servers 배열이 갱신되면 selected도 함께 업데이트 + 이벤트 토스트
  useEffect(() => {
    const prev = prevServersRef.current;
    for (const server of servers) {
      const prevStatus = prev.get(server.id);
      if (prevStatus && prevStatus !== server.status) {
        const label = server.name;
        if (server.status === 'running')       pushToast(`${label} 서버가 실행됐습니다.`, 'success');
        else if (server.status === 'stopped')  pushToast(`${label} 서버가 중지됐습니다.`, 'info');
        else if (server.status === 'error')    pushToast(`${label} 서버에 오류가 발생했습니다.`, 'error');
        else if (server.status === 'provisioning') pushToast(`${label} 서버를 프로비저닝 중입니다.`, 'info');
      }
    }
    const next = new Map(servers.map(s => [s.id, s.status]));
    prevServersRef.current = next;

    if (selected) {
      const updated = servers.find(s => s.id === selected.id);
      if (updated && updated.status !== selected.status) setSelected(updated);
    }
  }, [servers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real mode: require login. Mock mode: skip auth.
  if (!auth) {
    function handleLogin(token: string, username: string) {
      try { localStorage.setItem('kubehost-token', token); localStorage.setItem('kubehost-username', username); } catch { /* ignore */ }
      setAuth({ token, username });
      setShowLogin(false);
    }
    return (
      <>
        <Landing onEnter={() => setShowLogin(true)} />
        {showLogin && (
          <Login onLogin={handleLogin} onClose={() => setShowLogin(false)} />
        )}
      </>
    );
  }

  function navigate(next: View) {
    setView(next);
    setActionError('');
    setNotice('');
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setActionError('');
    try {
      await work();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '작업을 완료하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    await run(async () => {
      setSelected(await api.server(id));
      setView('detail');
    });
  }

  async function create(input: ServerInput) {
    await run(async () => {
      setSelected(await api.create(input));
      setView('detail');
      setNotice('서버와 리소스 계획을 생성했습니다.');
      await refresh();
    });
  }

  async function changeStatus(action: 'start' | 'stop') {
    if (!selected) return;
    await run(async () => {
      setSelected(await api.action(selected.id, action));
      setNotice(action === 'start' ? '서버를 시작했습니다.' : '서버를 중지했습니다. 데이터는 보존됩니다.');
      await refresh();
    });
  }

  async function restore(server: Server) {
    await run(async () => {
      setSelected(await api.restore(server.id));
      setView('detail');
      setNotice('서버를 복구했습니다. 기존 월드 데이터가 연결됩니다.');
      await refresh();
    });
  }

  async function remove(deleteData: boolean, confirmation: string) {
    if (!selected) return;
    await run(async () => {
      await api.remove(selected.id, deleteData, confirmation);
      setSelected(null);
      setView('servers');
      setNotice(deleteData ? '서버와 데이터를 삭제했습니다.' : '서버를 삭제했습니다. 데이터는 보존됩니다.');
      await refresh();
    });
  }

  async function refreshView() {
    await run(async () => {
      if (view === 'detail' && selected) {
        try {
          setSelected(await api.server(selected.id));
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 404) {
            setSelected(null);
            setView('servers');
            setNotice('서버가 더 이상 존재하지 않습니다. 목록을 새로 불러왔습니다.');
          } else {
            throw cause;
          }
        }
      }
      await refresh();
    });
  }

  const titles: Record<View, string> = {
    dashboard: '운영 대시보드', servers: '게임 서버', create: '서버 생성', detail: '서버 상세', cluster: '클러스터 맵', admin: '관리자',
  };

  return <div className="shell">
    <a className="skip" href="#main">본문으로 이동</a>
    <aside className="sidebar">
      <a className="brand" href="#main" onClick={event => { event.preventDefault(); navigate('dashboard'); }}>
        <img className="brand-logo" src="/kubehost-logo.png" alt="" width={48} height={48}/><span>KubeHost<small>SERVER PLATFORM</small></span>
      </a>
      <span className="nav-label">워크스페이스</span>
      <nav aria-label="주 메뉴">
        <button className={view === 'dashboard' ? 'active' : ''} aria-current={view === 'dashboard' ? 'page' : undefined} onClick={() => navigate('dashboard')}>
          ◫ <span>대시보드</span>
        </button>
        <button className={view === 'servers' || view === 'create' || view === 'detail' ? 'active' : ''} aria-current={view === 'servers' || view === 'create' || view === 'detail' ? 'page' : undefined} onClick={() => navigate('servers')}>
          ▤ <span>게임 서버</span><span className="nav-count">{servers.length}</span>
        </button>
        <button className={view === 'cluster' ? 'active' : ''} aria-current={view === 'cluster' ? 'page' : undefined} onClick={() => navigate('cluster')}>
          ▧ <span>클러스터 맵</span>
        </button>
        {isAdmin && <button className={view === 'admin' ? 'active' : ''} aria-current={view === 'admin' ? 'page' : undefined} onClick={() => navigate('admin')}>
          ◈ <span>관리자</span>
        </button>}
      </nav>
      <div className="sidebar-footer">
        <div className="environment-pill"><span className="demo-dot"/> KUBERNETES<small>K3s API 연결</small></div>
        <div className="profile">
          <span className="avatar">{auth ? auth.username[0].toUpperCase() : 'D'}</span>
          <div>{auth.username}<small>로그인됨 · K3s</small></div>
          {auth && <button className="text-button" style={{fontSize:'11px'}} onClick={() => setShowChangePw(true)}>비밀번호 변경</button>}
          {auth && <button className="text-button" style={{marginLeft:'auto',fontSize:'11px'}} onClick={() => {
            try { localStorage.removeItem('kubehost-token'); localStorage.removeItem('kubehost-username'); } catch { /* ignore */ }
            setAuth(null);
          }}>로그아웃</button>}
        </div>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <span>워크스페이스 <span className="muted">/</span> <strong>{titles[view]}</strong></span>
        <div className="topbar-actions">
          <span className="topbar-status"><span className="demo-dot"/>클러스터 연결</span>
          {auth && (
            <span
              className={`session-timer${sessionRemaining < 120000 ? sessionRemaining < 60000 ? ' session-timer-urgent' : ' session-timer-warn' : ''}`}
              aria-label={`세션 만료까지 ${formatRemaining(sessionRemaining)}`}
            >
              ⏱ {formatRemaining(sessionRemaining)}
            </span>
          )}
          <div className="theme-switch" role="group" aria-label="화면 테마">
            <button className={theme === 'light' ? 'selected' : ''} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>☀ <span>밝게</span></button>
            <button className={theme === 'dark' ? 'selected' : ''} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>◐ <span>어둡게</span></button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="page-heading">
          <div><span className="eyebrow">WORKSPACE / {view === 'dashboard' ? 'OVERVIEW' : view === 'cluster' ? 'INFRASTRUCTURE' : view === 'admin' ? 'ADMIN' : 'SERVERS'}</span><h1>{titles[view]}</h1><p>{view === 'dashboard' ? '서버와 인프라의 현재 상태를 확인하세요.' : view === 'servers' ? '서버 목록을 확인하고 필요한 작업을 관리하세요.' : view === 'create' ? '배포할 Worker와 리소스를 선택하세요.' : view === 'cluster' ? 'Worker 노드와 배포된 파드의 배치를 시각적으로 확인하세요.' : view === 'admin' ? '사용자, 초대 코드, 테넌트 현황을 관리하세요.' : '상태, 설정, 콘솔과 데이터를 관리하세요.'}</p></div>
          <button className="secondary" onClick={() => void refreshView()} disabled={loading || busy}>↻ 새로고침</button>
        </div>
        {notice && <p role="status" className="notice">{notice}</p>}
        {actionError && <div role="alert" className="error">{actionError}</div>}
        {busy && <p role="status" className="muted">요청을 처리하는 중…</p>}
        {loading ? <div className="panel loading" role="status">콘솔 데이터를 불러오는 중…</div> : error ?
          <div className="panel error" role="alert"><h2>데이터를 불러오지 못했습니다</h2><p>{error}</p><button onClick={() => void refreshView()}>다시 시도</button></div> : <>
            {view === 'dashboard' && <Dashboard servers={servers} retainedCount={retained.length} tenant={tenant} onSelect={id => void open(id)} onCreate={() => navigate('create')}/>}
            {(view === 'dashboard' || view === 'servers') && <ServerList servers={servers} retained={retained} onSelect={id => void open(id)} onCreate={() => navigate('create')} onRestore={server => void restore(server)}/>}
            {view === 'cluster' && <ClusterMap nodes={nodes} servers={servers} pods={topologyPods} onSelect={id => void open(id)}/>}
            {view === 'create' && <CreateServer nodes={nodes} busy={busy} onCreate={create} onCancel={() => navigate('servers')}/>}
            {view === 'admin' && isAdmin && <AdminPage currentUserId={currentUserId}/>}
            {view === 'detail' && selected && <ServerDetail
              key={selected.id}
              server={selected}
              busy={busy}
              onBack={() => navigate('servers')}
              onAction={action => void changeStatus(action)}
              onDelete={(deleteData, confirmation) => void remove(deleteData, confirmation)}
            />}
          </>}
        <footer><span>© KubeHost · 게임 서버 운영 콘솔</span><span>Worker 장애 시 로컬 데이터가 자동으로 이동하지 않습니다.</span></footer>
      </main>
    </div>
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)}/>}
      {showSessionExpired && (
        <SessionExpiredModal onRelogin={() => { setShowSessionExpired(false); setShowLogin(true); }}/>
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast}/>
  </div>;
}
