import { useEffect, useState } from 'react';
import { api, ApiError } from './api/client';
import { useConsole } from './application/useConsole';
import type { Server, ServerInput, WorkerNode } from './domain/server';
import { Status } from './components/Status';
import { CreateServer } from './features/CreateServer';
import { ServerList } from './features/ServerList';
import { ServerDetail } from './features/ServerDetail';
import { ClusterMap } from './features/ClusterMap';
import { Login } from './features/Login';
import { AdminPage } from './features/AdminPage';

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

function Dashboard({ servers, nodes, retainedCount, tenant, onSelect, onCreate, mock }: {
  servers: Server[];
  nodes: WorkerNode[];
  retainedCount: number;
  tenant: TenantInfo | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  mock: boolean;
}) {
  const running = servers.filter(server => server.status === 'running').length;
  const provisioning = servers.filter(server => server.status === 'provisioning').length;
  const readyWorkers = nodes.filter(node => node.role === 'worker' && node.status === 'Ready').length;
  const recent = [...servers].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4);

  return <>
    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow">KUBEHOST CONTROL CENTER</span>
        <h2>서버 운영을 한눈에</h2>
        <p>게임 서버와 Worker 상태를 확인하고, 필요한 작업을 바로 시작하세요.</p>
      </div>
      <div className="hero-actions"><button onClick={onCreate}>+ 서버 만들기</button></div>
    </section>
    <div className="stats">
      <article><span className="stat-icon" aria-hidden="true">▦</span><span>전체 서버</span><strong>{servers.length}</strong><p className="stat-meta">현재 관리 중인 인스턴스</p></article>
      <article><span className="stat-icon" aria-hidden="true">●</span><span>실행 중</span><strong>{running}</strong><p className="stat-meta">{mock ? '모의 실행 상태' : '서비스 제공 중'}</p></article>
      <article><span className="stat-icon" aria-hidden="true">◷</span><span>준비 중</span><strong>{provisioning}</strong><p className="stat-meta">배포 및 시작 진행 중</p></article>
      <article><span className="stat-icon" aria-hidden="true">▤</span><span>보존된 데이터</span><strong>{retainedCount}</strong><p className="stat-meta">복원 가능한 서버</p></article>
    </div>
    <div className="dashboard-grid">
      <section className="panel">
        <div className="section-title"><div><span className="eyebrow">INFRASTRUCTURE</span><h2>노드 현황</h2><p className="section-copy">사용 가능한 Worker {readyWorkers}개 · 전체 노드 {nodes.length}개</p></div><span className="tag">{mock ? '데모 데이터' : '클러스터'}</span></div>
        {nodes.length ? nodes.map(node => <div className="node" key={node.id}>
          <span className="node-icon" aria-hidden="true">▧</span>
          <div><strong>{node.name}</strong><small>{node.role === 'worker' ? 'Worker · 게임 배포 대상' : 'Control Plane · NoSchedule'}</small></div>
          <Status value={node.status}/>
        </div>) : <p className="muted">표시할 노드가 없습니다.</p>}
      </section>
      <section className="panel">
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
    </div>
    {tenant && <section className="panel" style={{marginTop:'24px'}}>
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
  </>;
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
  const { health, mode, servers, retained, nodes, tenant, loading, error, refresh } = useConsole();
  const [auth, setAuth] = useState<{ token: string; username: string } | null>(getStoredAuth);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [view, setView] = useState<View>('dashboard');
  const [selected, setSelected] = useState<Server | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1220' : '#f3f6f9');
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

  // Real mode: require login. Mock mode: skip auth.
  if (mode === 'real' && !auth) {
    return <Login onLogin={(token, username) => {
      try { localStorage.setItem('kubehost-token', token); localStorage.setItem('kubehost-username', username); } catch { /* ignore */ }
      setAuth({ token, username });
    }}/>;
  }
  const mock = mode === 'mock';
  const modeLabel = mode === 'mock' ? 'MOCK MODE' : mode === 'real' ? 'KUBERNETES' : 'MODE UNKNOWN';

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
        <div className="environment-pill"><span className="demo-dot"/> {modeLabel}<small>{mock ? '모의 환경 · 클러스터 변경 없음' : mode === 'real' ? 'K3s API 연결' : '연결 상태 확인 필요'}</small></div>
        <div className="profile">
          <span className="avatar">{auth ? auth.username[0].toUpperCase() : 'D'}</span>
          <div>{auth ? auth.username : '데모 워크스페이스'}<small>{auth ? `로그인됨 · ${mode}` : `인증: ${health?.authentication ?? '확인 불가'} · 데모`}</small></div>
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
          <span className="topbar-status"><span className="demo-dot"/>{mode === 'real' ? '클러스터 연결' : mode === 'mock' ? '데모 환경' : '연결 확인 필요'}</span>
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
        <div className={`demo-banner ${mode === 'real' ? 'is-real' : mode === 'mock' ? 'is-mock' : 'is-unknown'}`}>
          <span aria-hidden="true">◈</span>
          <div><strong>{mock ? '데모 환경에서 작업 중' : mode === 'real' ? 'K3s 클러스터에 연결됨' : 'API 연결 상태를 확인하세요'}</strong><p>{mock ? '표시된 서버와 노드는 모의 데이터이며 클러스터를 변경하지 않습니다.' : mode === 'real' ? '이 화면의 작업은 실제 클러스터에 반영됩니다. 저장 데이터는 Worker에 위치합니다.' : '연결 상태를 확인한 뒤 작업을 진행하세요.'}</p></div>
          <span className="tag">{modeLabel}</span>
        </div>
        {notice && <p role="status" className="notice">{notice}</p>}
        {actionError && <div role="alert" className="error">{actionError}</div>}
        {busy && <p role="status" className="muted">요청을 처리하는 중…</p>}
        {loading ? <div className="panel loading" role="status">콘솔 데이터를 불러오는 중…</div> : error ?
          <div className="panel error" role="alert"><h2>데이터를 불러오지 못했습니다</h2><p>{error}</p><button onClick={() => void refreshView()}>다시 시도</button></div> : <>
            {view === 'dashboard' && <Dashboard mock={mock} servers={servers} nodes={nodes} retainedCount={retained.length} tenant={tenant} onSelect={id => void open(id)} onCreate={() => navigate('create')}/>}
            {(view === 'dashboard' || view === 'servers') && <ServerList servers={servers} retained={retained} onSelect={id => void open(id)} onCreate={() => navigate('create')} onRestore={server => void restore(server)}/>}
            {view === 'cluster' && <ClusterMap nodes={nodes} servers={servers} onSelect={id => void open(id)}/>}
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
  </div>;
}