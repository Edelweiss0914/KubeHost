import { useState } from 'react';
import type { Server } from '../domain/server';
import { Status } from '../components/Status';
import { ServerSettingsPanel } from './ServerSettings';
import { ServerConsole } from './ServerConsole';

function visibleResourcePlan(plan: Server['resource_plan']): string {
  return JSON.stringify(plan, (_key, value: unknown) => {
    if (value && typeof value === 'object' && 'name' in value && value.name === 'RCON_PASSWORD') {
      return { ...value, value: '[숨김]' };
    }
    return value;
  }, 2) ?? '';
}

type ServerDetailProps = {
  server: Server;
  busy: boolean;
  onAction: (action: 'start' | 'stop') => void;
  onDelete: (deleteData: boolean, confirmation: string) => void;
  onBack: () => void;
};

export function ServerDetail({ server, busy, onAction, onDelete, onBack }: ServerDetailProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteData, setDeleteData] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const canStart = server.status === 'stopped' || server.status === 'error';
  const canStop = server.status === 'running' || server.status === 'provisioning';
  const active = server.status === 'running' || server.status === 'provisioning';

  return <>
    <button className="text-button back" onClick={onBack}>← 서버 목록</button>
    <section className="panel detail-overview">
      <div className="section-title detail-summary">
        <div><span className="eyebrow">MINECRAFT JAVA / PAPER</span><h2>{server.name}</h2><p className="detail-meta">생성일 {new Date(server.created_at).toLocaleString('ko-KR')} · {server.node_id}</p></div>
        <Status value={server.status}/>
      </div>
      <dl className="details-grid">
        <div><dt>버전</dt><dd>{server.version} · 고정</dd></div>
        <div><dt>배포 Worker</dt><dd>{server.node_id}</dd></div>
        <div><dt>CPU / 메모리</dt><dd>{server.cpu} 코어 / {server.memory_mb} MiB</dd></div>
        <div><dt>스토리지</dt><dd>{server.storage_gb} GiB · local-path</dd></div>
        <div><dt>접속 주소</dt><dd><code>{server.connection ?? '할당 중'}</code></dd></div>
        <div><dt>데이터 정책</dt><dd>Retain · 삭제 시 기본 보존</dd></div>
      </dl>
      <div className="actions">
        <button disabled={busy || !canStart} onClick={() => onAction('start')}>시작</button>
        <button className="secondary" disabled={busy || !canStop} onClick={() => onAction('stop')}>중지</button>
        <button className="secondary" type="button" aria-expanded={showSettings} onClick={() => setShowSettings(s => !s)}>⚙ 설정</button>
        <button className="danger" disabled={busy} onClick={() => setDeleting(true)}>서버 삭제</button>
      </div>
      {deleting && <form className="delete-box" onSubmit={event => { event.preventDefault(); onDelete(deleteData, confirmation); }}>
        <h3>서버를 삭제할까요?</h3>
        <p>기본값은 데이터 보존입니다. Worker의 로컬 PVC는 명시적으로 삭제하지 않는 한 유지됩니다.</p>
        <label className="checkbox"><input type="checkbox" checked={deleteData} onChange={event => setDeleteData(event.target.checked)}/>저장 데이터도 함께 삭제 (PVC 삭제 · 복구 불가)</label>
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
      <div className="section-title"><div><span className="eyebrow">배포된 리소스</span><h2>Kubernetes 리소스 계획</h2></div></div>
      <p className="muted">Namespace: <code>{server.resource_plan.namespace}</code> · StatefulSet 1 replica · Worker 전용 배치</p>
      <div className="notice">Worker 장애 시 로컬 데이터가 자동으로 이동하지 않습니다.</div>
      {server.resource_plan.warnings.map(warning => <p className="muted" key={warning}>{warning}</p>)}
      <details><summary>리소스 JSON 보기</summary><pre>{visibleResourcePlan(server.resource_plan)}</pre></details>
    </section>
    {showSettings && <ServerSettingsPanel serverId={server.id} onClose={() => setShowSettings(false)}/>}
    <ServerConsole serverId={server.id} active={active}/>
  </>;
}