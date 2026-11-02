import { useState } from 'react';
import { api } from '../api/client';
import type { Server } from '../domain/server';
import { Status } from '../components/Status';

type ServerListProps = {
  servers: Server[];
  retained: Server[];
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRestore: (server: Server) => void;
};

type StatusFilter = 'all' | Server['status'];

const filters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'running', label: '실행 중' },
  { value: 'provisioning', label: '준비 중' },
  { value: 'stopped', label: '중지됨' },
  { value: 'error', label: '오류' },
];

export function ServerList({ servers, retained, onSelect, onCreate, onRestore }: ServerListProps) {
  const [pvcs, setPvcs] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
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
        <div><span className="eyebrow">INSTANCES</span><h2>서버 목록 <span className="count">{servers.length}</span></h2><p className="section-copy">상태와 접속 정보를 확인하고 서버를 관리하세요.</p></div>
        <button onClick={onCreate}>+ 서버 만들기</button>
      </div>
      {!servers.length ? <div className="empty">
        <span className="empty-icon" aria-hidden="true">▦</span>
        <h3>아직 서버가 없습니다</h3>
        <p>Worker와 리소스를 선택해 첫 Minecraft 서버를 배포하세요.</p>
        <button onClick={onCreate}>첫 서버 만들기</button>
      </div> : <>
        <div className="list-toolbar">
          <label className="search-field">서버 검색
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="이름 또는 Worker 검색"/>
          </label>
          <span className="results-count">{visible.length}개 표시</span>
        </div>
        <div className="filter-chips" role="group" aria-label="서버 상태 필터">
          {filters.map(item => <button key={item.value} type="button" className={filter === item.value ? 'filter-chip selected' : 'filter-chip'} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}
        </div>
        {visible.length ? <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">서버</th><th scope="col">상태</th><th scope="col">Worker</th><th scope="col">할당 리소스</th><th scope="col">접속 주소</th><th scope="col"><span className="sr-only">작업</span></th></tr></thead>
            <tbody>{visible.map(server => <tr key={server.id}>
              <td><strong>{server.name}</strong><small>Minecraft Java · Paper {server.version}</small></td>
              <td><Status value={server.status}/></td>
              <td>{server.node_id}</td>
              <td>{server.cpu} vCPU · {server.memory_mb / 1024} GiB RAM<small>{server.storage_gb} GiB 스토리지</small></td>
              <td><code>{server.connection ?? '배정 대기'}</code></td>
              <td><button className="secondary" onClick={() => onSelect(server.id)} aria-label={server.name + ' 상세 보기'}>상세 보기</button></td>
            </tr>)}</tbody>
          </table>
        </div> : <div className="empty search-empty"><h3>검색 결과가 없습니다</h3><p>검색어나 상태 필터를 변경해 보세요.</p><button className="secondary" onClick={() => { setQuery(''); setFilter('all'); }}>필터 초기화</button></div>}
      </>}
    </section>
    {retained.length > 0 && <section className="panel">
      <div className="section-title">
        <div><span className="eyebrow">RECOVERY</span><h2>보존된 서버 <span className="count">{retained.length}</span></h2><p className="section-copy">기존 월드 데이터가 남아 있는 서버를 복원할 수 있습니다.</p></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">서버</th><th scope="col">보존 날짜</th><th scope="col">스토리지</th><th scope="col">PVC</th><th scope="col"><span className="sr-only">작업</span></th></tr></thead>
          <tbody>{retained.map(server => <tr key={server.id}>
            <td><strong>{server.name}</strong><small>Paper {server.version} · {server.node_id}</small></td>
            <td>{new Date(server.created_at).toLocaleDateString('ko-KR')}</td>
            <td>{server.storage_gb} GiB</td>
            <td>{pvcs[server.id] === undefined
              ? <button className="text-button" onClick={() => void loadPvcs(server.id)}>PVC 확인</button>
              : pvcs[server.id].length ? <code>{pvcs[server.id][0]}</code> : <span className="muted">확인된 PVC 없음</span>}</td>
            <td><button className="secondary" onClick={() => onRestore(server)}>복원</button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}
  </>;
}