import type { Server } from '../domain/server';
import { Status } from '../components/Status';

type ServerListProps = {
  servers: Server[];
  onSelect: (id: string) => void;
  onCreate: () => void;
};

export function ServerList({ servers, onSelect, onCreate }: ServerListProps) {
  return <section className="panel">
    <div className="section-title">
      <div><span className="eyebrow">YOUR INSTANCES</span><h2>게임 서버 <span className="count">{servers.length}</span></h2></div>
      <button onClick={onCreate}>+ 서버 만들기</button>
    </div>
    {!servers.length ? <div className="empty">
      <span className="empty-icon" aria-hidden="true">◇</span>
      <h3>첫 번째 월드를 준비하세요</h3>
      <p>리소스를 선택하면 실행되지 않는 Kubernetes 계획이 만들어집니다.</p>
      <button onClick={onCreate}>첫 서버 만들기</button>
    </div> : <div className="table-wrap">
      <table>
        <thead><tr><th scope="col">서버 / 게임</th><th scope="col">상태</th><th scope="col">Worker</th><th scope="col">리소스</th><th scope="col">접속 주소</th></tr></thead>
        <tbody>{servers.map(server => <tr key={server.id}>
          <td><button className="text-button" onClick={() => onSelect(server.id)}>{server.name} ↗</button><small>Minecraft Java · Paper {server.version}</small></td>
          <td><Status value={server.status}/></td>
          <td>{server.node_id}</td>
          <td>{server.cpu} CPU · {server.memory_mb / 1024} GiB RAM<small>{server.storage_gb} GiB 로컬 디스크</small></td>
          <td className="muted">{server.connection ?? '미할당'}<small>데모 · 실제 접속 불가</small></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}


