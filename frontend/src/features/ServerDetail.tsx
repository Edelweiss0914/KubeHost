import { useState, useEffect } from 'react';
import type { Server } from '../domain/server';
import { Status } from '../components/Status';
import { ServerSettingsPanel } from './ServerSettings';
import { ServerConsole } from './ServerConsole';
import { api } from '../api/client';
import type { Schedule, ScheduleInput, ServerMetrics } from '../api/client';
import { MetricsChart } from '../components/MetricsChart';

type K8sResource = {
  apiVersion: string
  kind: string
  metadata: { name: string; namespace?: string }
  spec?: Record<string, unknown>
}

const KIND_BADGE: Record<string, { bg: string; color: string }> = {
  Namespace:     { bg: '#1a3d5c', color: '#58c9ff' },
  ResourceQuota: { bg: '#2d2050', color: '#a78bfa' },
  LimitRange:    { bg: '#14382e', color: '#34d399' },
  NetworkPolicy: { bg: '#3d2010', color: '#fb923c' },
  Service:       { bg: '#1a2e54', color: '#60a5fa' },
  StatefulSet:   { bg: '#3a1040', color: '#f472b6' },
}

function kindSummary(r: K8sResource): string {
  const spec = r.spec
  switch (r.kind) {
    case 'Namespace':
      return 'pod-security: restricted'
    case 'ResourceQuota': {
      const hard = (spec?.hard ?? {}) as Record<string, string>
      return `CPU ${hard['limits.cpu'] ?? '?'} · 메모리 ${hard['limits.memory'] ?? '?'} · 스토리지 ${hard['requests.storage'] ?? '?'}`
    }
    case 'LimitRange': {
      const lims = (spec?.limits as Array<Record<string, Record<string, string>>> | undefined)?.[0] ?? {}
      const def = lims.default ?? {}
      return `기본 CPU ${def.cpu ?? '?'} · 기본 메모리 ${def.memory ?? '?'}`
    }
    case 'NetworkPolicy':
      return 'Ingress: 게임(25565) + RCON(25575 내부) · Egress: DNS + 외부'
    case 'Service': {
      const ports = spec?.ports as Array<Record<string, unknown>> | undefined
      if (spec?.clusterIP === 'None') return 'Headless · 포트 25565'
      const np = ports?.[0]?.nodePort
      return `NodePort · 포트 25565 → ${np ?? '미할당'}`
    }
    case 'StatefulSet': {
      const tplSpec = ((spec?.template as Record<string, unknown> | undefined)?.spec ?? {}) as Record<string, unknown>
      const node = (tplSpec.nodeSelector as Record<string, string> | undefined)?.['kubernetes.io/hostname'] ?? '?'
      const vcts = spec?.volumeClaimTemplates as Array<Record<string, unknown>> | undefined
      const storage = ((vcts?.[0]?.spec as Record<string, unknown> | undefined)
        ?.resources as Record<string, Record<string, string>> | undefined)
        ?.requests?.storage ?? '?'
      return `replicas: 1 · Worker: ${node} · PVC: ${storage} local-path`
    }
    default:
      return ''
  }
}

function maskResource(res: unknown): string {
  return JSON.stringify(res, (_key, value: unknown) => {
    if (value && typeof value === 'object' && 'name' in value &&
        (value as Record<string, unknown>).name === 'RCON_PASSWORD') {
      return { ...(value as object), value: '[숨김]' }
    }
    return value
  }, 2)
}

function ResourcePlanViewer({ plan }: { plan: Server['resource_plan'] }) {
  return (
    <div className="resource-plan-list">
      {plan.resources.map((res, i) => {
        const r = res as K8sResource
        const badge = KIND_BADGE[r.kind] ?? { bg: 'var(--surface-2)', color: 'var(--muted)' }
        const summary = kindSummary(r)
        return (
          <details key={i} className="resource-plan-item">
            <summary className="resource-plan-row">
              <span className="resource-kind-badge" style={{ background: badge.bg, color: badge.color }}>
                {r.kind}
              </span>
              <code className="resource-plan-name">{r.metadata.name}</code>
              {summary && <span className="resource-plan-desc">{summary}</span>}
            </summary>
            <pre className="resource-plan-json">{maskResource(res)}</pre>
          </details>
        )
      })}
    </div>
  )
}

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function ServerMetricsPanel({ serverId }: { serverId: string }) {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.serverMetrics(serverId, 60)
      .then(setMetrics)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [serverId]);

  return (
    <div className="metrics-panel">
      <div className="section-title">
        <div><span className="eyebrow">METRICS</span><h2>리소스 사용량</h2></div>
        <span className="muted" style={{fontSize:'12px'}}>최근 1시간</span>
      </div>
      {loading ? <p className="muted">불러오는 중…</p> : (
        <div className="metrics-grid">
          <MetricsChart title="CPU (cores)" data={metrics?.cpu ?? []} color="#79aaff" unit="cpu" />
          <MetricsChart title="메모리" data={metrics?.memory_bytes ?? []} color="#34d399" unit="bytes" />
        </div>
      )}
    </div>
  );
}

function SchedulePanel({ serverId }: { serverId: string }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);

  useEffect(() => {
    api.listSchedules(serverId)
      .then(setSchedules)
      .finally(() => setLoading(false));
  }, [serverId]);

  async function handleDelete(scheduleId: string) {
    await api.deleteSchedule(serverId, scheduleId);
    setSchedules(prev => prev.filter(s => s.id !== scheduleId));
  }

  async function handleSave(input: ScheduleInput, id?: string) {
    if (id) {
      const updated = await api.updateSchedule(serverId, id, input);
      setSchedules(prev => prev.map(s => s.id === id ? updated : s));
    } else {
      const created = await api.createSchedule(serverId, input);
      setSchedules(prev => [...prev, created]);
    }
    setShowForm(false);
    setEditing(null);
  }

  return (
    <div className="schedule-panel">
      <div className="section-title">
        <div><span className="eyebrow">AUTOMATION</span><h2>자동 스케줄</h2></div>
        <button onClick={() => { setEditing(null); setShowForm(true); }}>+ 추가</button>
      </div>
      {loading ? <p className="muted">불러오는 중…</p> : (
        <>
          {schedules.length === 0 && <p className="muted">등록된 스케줄이 없습니다.</p>}
          <div className="schedule-list">
            {schedules.map(s => (
              <div key={s.id} className={`schedule-item ${s.enabled ? '' : 'disabled'}`}>
                <div className="schedule-days">
                  {s.days.length === 0
                    ? <span className="tag">매일</span>
                    : s.days.map(d => <span key={d} className="tag">{DAY_LABELS[d]}</span>)
                  }
                </div>
                <div className="schedule-times">
                  {s.start_time && <span>▶ {s.start_time}</span>}
                  {s.stop_time && <span>■ {s.stop_time}</span>}
                </div>
                <div className="schedule-actions">
                  <button className="secondary" onClick={() => { setEditing(s); setShowForm(true); }}>편집</button>
                  <button className="secondary" onClick={() => void handleDelete(s.id)}>삭제</button>
                </div>
              </div>
            ))}
          </div>
          {showForm && (
            <ScheduleForm
              initial={editing}
              onSave={input => void handleSave(input, editing?.id)}
              onCancel={() => { setShowForm(false); setEditing(null); }}
            />
          )}
        </>
      )}
    </div>
  );
}

function ScheduleForm({ initial, onSave, onCancel }: {
  initial: Schedule | null;
  onSave: (input: ScheduleInput) => void;
  onCancel: () => void;
}) {
  const [days, setDays] = useState<number[]>(initial?.days ?? []);
  const [startTime, setStartTime] = useState(initial?.start_time ?? '');
  const [stopTime, setStopTime] = useState(initial?.stop_time ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [error, setError] = useState('');

  function toggleDay(d: number) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  }

  function submit() {
    if (!startTime && !stopTime) { setError('시작 또는 종료 시간 중 하나는 입력해야 합니다.'); return; }
    onSave({ days, start_time: startTime || null, stop_time: stopTime || null, enabled, timezone: 'Asia/Seoul' });
  }

  return (
    <div className="schedule-form panel">
      <h3>{initial ? '스케줄 편집' : '새 스케줄'}</h3>
      <div className="form-grid">
        <div className="full">
          <span style={{fontSize:'13px'}}>요일 <small>선택 안 하면 매일 적용</small></span>
          <div className="day-picker">
            {['월','화','수','목','금','토','일'].map((dayLabel, i) => (
              <button key={i} type="button"
                className={`day-btn ${days.includes(i) ? 'selected' : ''}`}
                onClick={() => toggleDay(i)}>{dayLabel}</button>
            ))}
          </div>
        </div>
        <label>시작 시간
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}/>
          <small>비워두면 자동 시작 없음</small>
        </label>
        <label>종료 시간
          <input type="time" value={stopTime} onChange={e => setStopTime(e.target.value)}/>
          <small>비워두면 자동 종료 없음</small>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/> 활성화
        </label>
      </div>
      {error && <div role="alert" className="error">{error}</div>}
      <div className="actions">
        <button type="button" className="secondary" onClick={onCancel}>취소</button>
        <button type="button" onClick={submit}>저장</button>
      </div>
    </div>
  );
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
      <ResourcePlanViewer plan={server.resource_plan} />
    </section>
    {showSettings && <ServerSettingsPanel serverId={server.id} onClose={() => setShowSettings(false)}/>}
    <section className="panel">
      <ServerMetricsPanel serverId={server.id} />
    </section>
    <section className="panel">
      <SchedulePanel serverId={server.id} />
    </section>
    <ServerConsole serverId={server.id} active={active}/>
  </>;
}