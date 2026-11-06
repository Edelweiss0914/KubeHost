import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { LayoutGrid, List, Hexagon } from 'lucide-react';
import type { GameDefinition, Game } from '../api/client';
import type { Server } from '../domain/server';
import { Status } from '../components/Status';
import { CopyBtn } from '../components/CopyBtn';

type ServerListProps = {
  servers: Server[];
  retained: Server[];
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRestore: (server: Server) => void;
};

type StatusFilter = 'all' | Server['status'];
type ViewMode = 'card' | 'table';

const filters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'running', label: '실행 중' },
  { value: 'provisioning', label: '준비 중' },
  { value: 'stopped', label: '중지됨' },
  { value: 'error', label: '오류' },
];


function isLight(hex: string): boolean {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

function badgeStyle(def?: GameDefinition): React.CSSProperties {
  return {
    background: def?.color ?? 'var(--surface-2)',
    color: def ? (isLight(def.color) ? '#1a1a1a' : '#fff') : 'var(--muted)',
    borderRadius: '10px', width: '40px', height: '40px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '20px', flexShrink: 0,
  };
}

function useGameImages(): Map<string, string> {
  const [images, setImages] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    api.games().then(games => {
      const map = new Map<string, string>();
      games.forEach((g: Game) => { if (g.image_url) map.set(g.slug, g.image_url); });
      setImages(map);
    }).catch(() => {});
  }, []);
  return images;
}

function useGameDefs(servers: Server[]): Map<string, GameDefinition> {
  const [defs, setDefs] = useState<Map<string, GameDefinition>>(new Map());
  const slugKey = [...new Set(servers.map(s => s.game))].sort().join(',');
  useEffect(() => {
    if (!slugKey) return;
    const slugs = slugKey.split(',');
    Promise.all(slugs.map(slug =>
      api.getGameDefinition(slug).then(def => [slug, def] as const).catch(() => null)
    )).then(entries => {
      const map = new Map<string, GameDefinition>();
      entries.forEach(e => { if (e) map.set(e[0], e[1]); });
      setDefs(map);
    });
  }, [slugKey]);
  return defs;
}

function ServerCard({ server, onSelect, gameDef, imageUrl }: { server: Server; onSelect: (id: string) => void; gameDef?: GameDefinition; imageUrl?: string }) {
  return (
    <div
      className="server-card"
      onClick={() => onSelect(server.id)}
      role="button"
      tabIndex={0}
      aria-label={`${server.name} 상세 보기`}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(server.id); } }}
    >
      <div className="server-card-header">
        {imageUrl
          ? <img src={imageUrl} alt={gameDef?.name ?? server.game} className="game-picker-img" style={{width:'40px',height:'40px'}} aria-hidden="true"/>
          : <span className="server-card-game-badge" style={badgeStyle(gameDef)} aria-hidden="true">{gameDef?.icon ?? <Hexagon size={20}/>}</span>
        }
        <div className="server-card-title">
          <strong>{server.name}</strong>
          <Status value={server.status} />
        </div>
      </div>
      <div className="server-card-meta">
        <span>호스트 서버: {server.node_id}</span>
        <span>{server.cpu} vCPU · {server.memory_mb / 1024} GiB · {server.storage_gb} GiB</span>
      </div>
      <div className="server-card-connection">
        <code>{server.connection ?? '배정 대기'}</code>
        <CopyBtn text={server.connection} stopPropagation />
      </div>
      <button
        className="server-card-btn secondary"
        onClick={e => { e.stopPropagation(); onSelect(server.id); }}
        aria-label={`${server.name} 상세 보기`}
      >
        상세 보기
      </button>
    </div>
  );
}

export function ServerList({ servers, retained, onSelect, onCreate, onRestore }: ServerListProps) {
  const [pvcs, setPvcs] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const gameDefs = useGameDefs(servers);
  const gameImages = useGameImages();

  const visible = servers.filter(server =>
    (filter === 'all' || server.status === filter) &&
    (server.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ||
      server.node_id.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  );

  async function loadPvcs(id: string) {
    if (pvcs[id]) return;
    try {
      const result = await api.pvcs(id);
      setPvcs(previous => ({ ...previous, [id]: result.pvcs }));
    } catch { /* The API error remains available on retry. */ }
  }

  return <>
    <section className="panel">
      <div className="section-title">
        <div><h2>서버 목록 <span className="count">{servers.length}</span></h2><p className="section-copy">상태와 접속 정보를 확인하고 서버를 관리하세요.</p></div>
        <button onClick={onCreate}>+ 서버 만들기</button>
      </div>
      {!servers.length ? <div className="empty">
        <span className="empty-icon" aria-hidden="true"><LayoutGrid size={48}/></span>
        <h3>아직 서버가 없습니다</h3>
        <p>호스트 서버와 리소스를 선택해 첫 Minecraft 서버를 배포하세요.</p>
        <button onClick={onCreate}>첫 서버 만들기</button>
      </div> : <>
        <div className="list-toolbar">
          <label className="search-field">서버 검색
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="이름 또는 호스트 서버 검색"/>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="results-count">{visible.length}개 표시</span>
            <div className="view-toggle" role="group" aria-label="보기 방식">
              <button
                type="button"
                className={viewMode === 'card' ? 'active' : ''}
                aria-pressed={viewMode === 'card'}
                onClick={() => setViewMode('card')}
                title="카드 뷰"
              ><LayoutGrid size={15}/></button>
              <button
                type="button"
                className={viewMode === 'table' ? 'active' : ''}
                aria-pressed={viewMode === 'table'}
                onClick={() => setViewMode('table')}
                title="테이블 뷰"
              ><List size={15}/></button>
            </div>
          </div>
        </div>
        <div className="filter-chips" role="group" aria-label="서버 상태 필터">
          {filters.map(item => <button key={item.value} type="button" className={filter === item.value ? 'filter-chip selected' : 'filter-chip'} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}
        </div>
        {visible.length ? (
          viewMode === 'card' ? (
            <div className="server-card-grid">
              {visible.map(server => (
                <ServerCard key={server.id} server={server} onSelect={onSelect} gameDef={gameDefs.get(server.game)} imageUrl={gameImages.get(server.game)} />
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">서버</th><th scope="col">상태</th><th scope="col">호스트 서버</th><th scope="col">할당 리소스</th><th scope="col">접속 주소</th><th scope="col"><span className="sr-only">작업</span></th></tr></thead>
                <tbody>{visible.map(server => { const def = gameDefs.get(server.game); const imgUrl = gameImages.get(server.game); return <tr key={server.id}>
                  <td><div style={{display:'flex',alignItems:'center',gap:'8px'}}>{imgUrl ? <img src={imgUrl} alt="" className="game-picker-img" style={{width:'36px',height:'36px'}} aria-hidden="true"/> : <span style={badgeStyle(def)} aria-hidden="true">{def?.icon ?? <Hexagon size={20}/>}</span>}<div><strong>{server.name}</strong><small>{def?.name ?? server.game}{server.version ? ` · ${server.version}` : ''}</small></div></div></td>
                  <td><Status value={server.status}/></td>
                  <td>{server.node_id}</td>
                  <td>{server.cpu} vCPU · {server.memory_mb / 1024} GiB RAM<small>{server.storage_gb} GiB 스토리지</small></td>
                  <td style={{display:'flex', alignItems:'center', gap:'6px'}}><code>{server.connection ?? '배정 대기'}</code><CopyBtn text={server.connection}/></td>
                  <td><button className="secondary" onClick={() => onSelect(server.id)} aria-label={server.name + ' 상세 보기'}>상세 보기</button></td>
                </tr>; })}</tbody>
              </table>
            </div>
          )
        ) : <div className="empty search-empty"><h3>검색 결과가 없습니다</h3><p>검색어나 상태 필터를 변경해 보세요.</p><button className="secondary" onClick={() => { setQuery(''); setFilter('all'); }}>필터 초기화</button></div>}
      </>}
    </section>
    {retained.length > 0 && <section className="panel">
      <div className="section-title">
        <div><h2>보존된 서버 <span className="count">{retained.length}</span></h2><p className="section-copy">기존 월드 데이터가 남아 있는 서버를 복원할 수 있습니다.</p></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">서버</th><th scope="col">보존 날짜</th><th scope="col">스토리지</th><th scope="col">저장 공간</th><th scope="col"><span className="sr-only">작업</span></th></tr></thead>
          <tbody>{retained.map(server => <tr key={server.id}>
            <td><strong>{server.name}</strong><small>Paper {server.version} · {server.node_id}</small></td>
            <td>{new Date(server.created_at).toLocaleDateString('ko-KR')}</td>
            <td>{server.storage_gb} GiB</td>
            <td>{pvcs[server.id] === undefined
              ? <button className="text-button" onClick={() => void loadPvcs(server.id)}>저장 공간 확인</button>
              : pvcs[server.id].length ? <code>{pvcs[server.id][0]}</code> : <span className="muted">저장 공간 없음</span>}</td>
            <td><button className="secondary" onClick={() => onRestore(server)}>복원</button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}
  </>;
}
