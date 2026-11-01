import { useState } from 'react';
import { api, ApiError } from './api/client';
import { useConsole } from './application/useConsole';
import type { Server, ServerInput, WorkerNode } from './domain/server';
import { Status } from './components/Status';
import { CreateServer } from './features/CreateServer';
import { ServerList } from './features/ServerList';
import { ServerDetail } from './features/ServerDetail';

type View = 'dashboard' | 'servers' | 'create' | 'detail';

function Dashboard({ servers, nodes, onSelect }: {
  servers: Server[];
  nodes: WorkerNode[];
  onSelect: (id: string) => void;
}) {
  const running = servers.filter(server => server.status === 'running').length;
  const recent = [...servers].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4);

  return <>
    <div className="stats">
      <article><span>전체 서버</span><strong>{servers.length}<small>instances</small></strong><p>내 워크스페이스</p></article>
      <article><span>실행 중</span><strong>{running}<small>running</small></strong><p><span className="demo-dot"/> mock 상태</p></article>
      <article><span>중지됨</span><strong>{servers.length - running}<small>stopped</small></strong><p>데이터 보존</p></article>
    </div>
    <div className="dashboard-grid">
      <section className="panel">
        <div className="section-title"><h2>노드 현황</h2><span className="tag">데모 데이터</span></div>
        {nodes.length ? nodes.map(node => <div className="node" key={node.id}>
          <span className="node-icon" aria-hidden="true">▧</span>
          <div><strong>{node.name}</strong><small>{node.role === 'worker' ? 'Worker · 게임 배포 대상' : 'Control Plane · NoSchedule'}</small></div>
          <Status value={node.status}/>
        </div>) : <p className="muted">표시할 노드가 없습니다.</p>}
      </section>
      <section className="panel">
        <div className="section-title"><h2>최근 생성 작업</h2><span className="tag">MOCK</span></div>
        {recent.length ? <ul className="activity">{recent.map(server => <li key={server.id}>
          <span className="demo-dot"/>
          <div>
            <button className="text-button" onClick={() => onSelect(server.id)}>{server.name}</button>
            <small>{new Date(server.created_at).toLocaleString('ko-KR')} · 생성</small>
          </div>
          <Status value={server.status}/>
        </li>)}</ul> : <p className="muted">아직 생성 작업이 없습니다. 첫 서버를 만들어 보세요.</p>}
      </section>
    </div>
  </>;
}

export function App() {
  const { servers, nodes, loading, error, refresh } = useConsole();
  const [view, setView] = useState<View>('dashboard');
  const [selected, setSelected] = useState<Server | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

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
      setNotice('데모 서버와 리소스 계획을 생성했습니다.');
      await refresh();
    });
  }

  async function changeStatus(action: 'start' | 'stop') {
    if (!selected) return;
    await run(async () => {
      setSelected(await api.action(selected.id, action));
      setNotice(action === 'start' ? '데모 서버를 시작했습니다.' : '데모 서버를 중지했습니다. 데이터는 보존됩니다.');
      await refresh();
    });
  }

  async function remove(deleteData: boolean, confirmation: string) {
    if (!selected) return;
    await run(async () => {
      await api.remove(selected.id, deleteData, confirmation);
      setSelected(null);
      setView('servers');
      setNotice(deleteData ? '데모 서버와 데이터 삭제 정책을 적용했습니다.' : '데모 서버를 삭제했습니다. 데이터 보존 정책을 유지합니다.');
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
    dashboard: '워크스페이스 개요', servers: '게임 서버', create: '서버 생성', detail: '서버 상세',
  };

  return <div className="shell">
    <a className="skip" href="#main">본문으로 이동</a>
    <aside className="sidebar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); navigate('dashboard'); }}>
        <span className="brand-mark">K</span>KubeHost<span className="beta">MVP</span>
      </a>
      <span className="nav-label">WORKSPACE</span>
      <nav aria-label="주 메뉴">
        <button className={view === 'dashboard' ? 'active' : ''} aria-current={view === 'dashboard' ? 'page' : undefined} onClick={() => navigate('dashboard')}>
          ◫ <span>대시보드</span>
        </button>
        <button className={view !== 'dashboard' ? 'active' : ''} aria-current={view !== 'dashboard' ? 'page' : undefined} onClick={() => navigate('servers')}>
          ▤ <span>게임 서버</span><span className="nav-count">{servers.length}</span>
        </button>
      </nav>
      <div className="sidebar-footer">
        <span className="demo-dot"/> 데모 환경<p>mock adapter · 클러스터 연결 없음</p>
        <div className="profile"><span className="avatar">D</span><div>Demo workspace<small>데모 인증 · 운영용 로그인 아님</small></div></div>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <span>Workspace <span className="muted">/</span> <strong>{view === 'dashboard' ? 'Overview' : 'Game servers'}</strong></span>
        <span className="tag">DEVELOPMENT</span>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="page-heading">
          <div><span className="eyebrow">YOUR WORLDS, ONE CONSOLE</span><h1>{titles[view]}</h1><p>당신의 다음 모험을 위한 작은 시작.</p></div>
          <button className="secondary" onClick={() => void refreshView()} disabled={loading || busy}>↻ 새로고침</button>
        </div>
        <div className="demo-banner">
          <span aria-hidden="true">◈</span>
          <div><strong>데모 데이터로 둘러보는 KubeHost</strong><p>모든 서버, 노드, 로그는 mock 데이터입니다. 실제 Kubernetes 작업은 수행하지 않습니다.</p></div>
          <span className="tag">MOCK MODE</span>
        </div>
        {notice && <p role="status" className="notice">{notice}</p>}
        {actionError && <div role="alert" className="error">{actionError}</div>}
        {busy && <p role="status" className="muted">요청을 처리하는 중…</p>}
        {loading ? <div className="panel loading" role="status">콘솔 데이터를 불러오는 중…</div> : error ?
          <div className="panel error" role="alert"><h2>데이터를 불러오지 못했습니다</h2><p>{error}</p><button onClick={() => void refreshView()}>다시 시도</button></div> : <>
            {view === 'dashboard' && <Dashboard servers={servers} nodes={nodes} onSelect={id => void open(id)}/>}
            {(view === 'dashboard' || view === 'servers') && <ServerList servers={servers} onSelect={id => void open(id)} onCreate={() => navigate('create')}/>}
            {view === 'create' && <CreateServer nodes={nodes} busy={busy} onCreate={create} onCancel={() => navigate('servers')}/>}
            {view === 'detail' && selected && <ServerDetail
              key={selected.id}
              server={selected}
              busy={busy}
              onBack={() => navigate('servers')}
              onAction={action => void changeStatus(action)}
              onDelete={(deleteData, confirmation) => void remove(deleteData, confirmation)}
            />}
          </>}
        <footer>Local storage, clear boundaries. <span>Worker 장애 시 자동 데이터 이동은 제공하지 않습니다.</span></footer>
      </main>
    </div>
  </div>;
}

