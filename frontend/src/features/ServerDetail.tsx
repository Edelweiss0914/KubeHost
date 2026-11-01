import { useState } from 'react';
import type { Server } from '../domain/server';
import { Status } from '../components/Status';

type ServerDetailProps = {
  server: Server;
  busy: boolean;
  onAction: (action: 'start' | 'stop') => void;
  onDelete: (deleteData: boolean, confirmation: string) => void;
  onBack: () => void;
};

export function ServerDetail({ server, busy, onAction, onDelete, onBack }: ServerDetailProps) {
  const [deleting, setDeleting] = useState(false);
  const [deleteData, setDeleteData] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  return <>
    <button className="text-button back" onClick={onBack}>← 서버 목록</button>
    <section className="panel">
      <div className="section-title">
        <div><span className="eyebrow">MINECRAFT JAVA / PAPER</span><h2>{server.name}</h2></div>
        <Status value={server.status}/>
      </div>
      <dl className="details-grid">
        <div><dt>버전</dt><dd>{server.version} · 고정</dd></div>
        <div><dt>배포 Worker</dt><dd>{server.node_id}</dd></div>
        <div><dt>CPU / 메모리</dt><dd>{server.cpu} 코어 / {server.memory_mb} MiB</dd></div>
        <div><dt>스토리지</dt><dd>{server.storage_gb} GiB · local-path</dd></div>
        <div><dt>접속 주소</dt><dd>{server.connection ?? '미할당 · 실제 접속 불가'}</dd></div>
        <div><dt>데이터 정책</dt><dd>Retain · 삭제 시 기본 보존</dd></div>
      </dl>
      <div className="actions">
        <button disabled={busy || server.status === 'running'} onClick={() => onAction('start')}>▷ 시작 (mock)</button>
        <button className="secondary" disabled={busy || server.status === 'stopped'} onClick={() => onAction('stop')}>Ⅱ 중지 (mock)</button>
        <button className="danger" disabled={busy} onClick={() => setDeleting(true)}>서버 삭제</button>
      </div>
      {deleting && <form className="delete-box" onSubmit={event => { event.preventDefault(); onDelete(deleteData, confirmation); }}>
        <h3>데모 서버를 삭제할까요?</h3>
        <p>기본값은 데이터 보존입니다. 이 데모에서는 실제 PVC를 변경하지 않습니다.</p>
        <label className="checkbox"><input type="checkbox" checked={deleteData} onChange={event => setDeleteData(event.target.checked)}/>보존된 데이터도 삭제하는 정책 선택</label>
        {deleteData && <label>확인을 위해 서버 이름 입력
          <input value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder={server.name}/>
        </label>}
        <div className="actions">
          <button type="button" className="secondary" onClick={() => setDeleting(false)} disabled={busy}>취소</button>
          <button className="danger" disabled={busy || (deleteData && confirmation !== server.name)}>
            {busy ? '처리 중…' : deleteData ? '서버와 데이터 삭제 확인' : '서버 삭제 · 데이터 보존'}
          </button>
        </div>
      </form>}
    </section>
    <section className="panel">
      <div className="section-title"><div><span className="eyebrow">PLAN ONLY · NEVER APPLIED</span><h2>Kubernetes 리소스 계획</h2></div></div>
      <p className="muted">Namespace: <code>{server.resource_plan.namespace}</code> · StatefulSet 1 replica · Worker 전용 배치</p>
      <div className="notice">계획만 생성했습니다. 실제 클러스터에는 적용하지 않습니다. Worker 영구 장애 시 자동 데이터 이동을 제공하지 않습니다.</div>
      {server.resource_plan.warnings.map(warning => <p className="muted" key={warning}>{warning}</p>)}
      <details><summary>리소스 JSON 보기</summary><pre>{JSON.stringify(server.resource_plan, null, 2)}</pre></details>
    </section>
    <section className="panel">
      <span className="eyebrow">SIMULATED OUTPUT</span><h2>데모 로그</h2>
      <pre className="logs">{server.logs.length ? server.logs.join('\n') : '아직 로그가 없습니다.'}</pre>
    </section>
  </>;
}


