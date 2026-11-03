import { useState, useEffect, useCallback } from 'react';
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

function CopyBtn({ text }: { text: string | null }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  if (!text) return null;
  return (
    <button className={`copy-btn${copied ? ' copied' : ''}`} onClick={copy} title="클립보드에 복사">
      {copied ? '✓ 복사됨' : '복사'}
    </button>
  );
}

type PlayerData = { count: number; max: number; names: string[] };

function PlayerPanel({ serverId, active }: { serverId: string; active: boolean }) {
  const [data, setData] = useState<PlayerData>({ count: 0, max: 0, names: [] });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!active) { setLoading(false); return; }
    api.players(serverId).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [serverId, active]);

  useEffect(() => {
    setLoading(true);
    refresh();
    if (!active) return;
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [refresh, active]);

  return (
    <section className="panel player-panel">
      <div className="section-title">
        <div><span className="eyebrow">PLAYERS</span><h2>접속 플레이어</h2></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {active && (
            <span className={`player-count-badge${data.count > 0 ? ' has-players' : ''}`}>
              {loading ? '…' : `${data.count} / ${data.max}`}
            </span>
          )}
          {active && <button className="secondary" onClick={refresh}>새로 고침</button>}
        </div>
      </div>
      {!active
        ? <p className="muted">서버가 실행 중일 때 플레이어 목록을 확인할 수 있습니다.</p>
        : loading
          ? <p className="muted">불러오는 중…</p>
          : data.count === 0
            ? <p className="muted">현재 접속 중인 플레이어가 없습니다.</p>
            : <div className="player-grid">
                {data.names.map(name => (
                  <div key={name} className="player-chip">
                    <img
                      src={`https://mc-heads.net/avatar/${encodeURIComponent(name)}/24`}
                      alt={name}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {name}
                  </div>
                ))}
              </div>
      }
    </section>
  );
}

function ManagePanel({ serverId, active }: { serverId: string; active: boolean }) {
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [wlLoading, setWlLoading] = useState(true);
  const [wlInput, setWlInput] = useState('');
  const [wlBusy, setWlBusy] = useState(false);
  const [ops, setOps] = useState<string[]>([]);
  const [opInput, setOpInput] = useState('');
  const [opBusy, setOpBusy] = useState(false);
  const [flash, setFlash] = useState('');

  // JVM
  const [jvmMb, setJvmMb] = useState(1536);
  const [jvmLoading, setJvmLoading] = useState(true);
  const [jvmBusy, setJvmBusy] = useState(false);

  // server.properties
  const [props, setProps] = useState('');
  const [propsLoading, setPropsLoading] = useState(true);
  const [propsBusy, setPropsBusy] = useState(false);

  // Backups
  const [backups, setBackups] = useState<string[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [backupBusy, setBackupBusy] = useState(false);

  // Plugins
  const [plugins, setPlugins] = useState<string[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(true);
  const [pluginBusy, setPluginBusy] = useState(false);

  const showFlash = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(''), 3000); };

  useEffect(() => {
    api.listOps(serverId).then(r => setOps(r.names)).catch(() => {});
    api.getJvm(serverId).then(r => setJvmMb(r.memory_mb)).catch(() => {}).finally(() => setJvmLoading(false));
    api.getProperties(serverId).then(r => setProps(r.content)).catch(() => {}).finally(() => setPropsLoading(false));
    api.listBackups(serverId).then(r => setBackups(r.backups)).catch(() => {}).finally(() => setBackupsLoading(false));
    api.listPlugins(serverId).then(r => setPlugins(r.plugins)).catch(() => {}).finally(() => setPluginsLoading(false));
    if (!active) { setWlLoading(false); return; }
    api.whitelist(serverId).then(r => setWhitelist(r.names)).catch(() => {}).finally(() => setWlLoading(false));
  }, [serverId, active]);

  async function saveJvm() {
    setJvmBusy(true);
    try {
      await api.setJvm(serverId, jvmMb);
      showFlash(`JVM 메모리 ${jvmMb} MiB로 설정됨 (재시작 필요)`);
    } catch (e) { showFlash(e instanceof Error ? e.message : '오류 발생'); }
    finally { setJvmBusy(false); }
  }

  async function saveProps() {
    setPropsBusy(true);
    try {
      await api.setProperties(serverId, props);
      showFlash('server.properties 저장됨 (재시작 필요)');
    } catch (e) { showFlash(e instanceof Error ? e.message : '오류 발생'); }
    finally { setPropsBusy(false); }
  }

  async function doCreateBackup() {
    setBackupBusy(true);
    try {
      const r = await api.createBackup(serverId);
      setBackups(p => [...p, r.filename]);
      showFlash(`백업 생성됨: ${r.filename}`);
    } catch (e) { showFlash(e instanceof Error ? e.message : '오류 발생'); }
    finally { setBackupBusy(false); }
  }

  async function doRestoreBackup(filename: string) {
    setBackupBusy(true);
    try {
      await api.restoreBackup(serverId, filename);
      showFlash(`${filename} 복원 완료 (재시작 필요)`);
    } catch (e) { showFlash(e instanceof Error ? e.message : '오류 발생'); }
    finally { setBackupBusy(false); }
  }

  async function doDeleteBackup(filename: string) {
    setBackupBusy(true);
    try {
      await api.deleteBackup(serverId, filename);
      setBackups(p => p.filter(f => f !== filename));
      showFlash(`${filename} 삭제됨`);
    } catch (e) { showFlash(e instanceof Error ? e.message : '오류 발생'); }
    finally { setBackupBusy(false); }
  }

  async function doUploadPlugin(file: File) {
    setPluginBusy(true);
    try {
      const r = await api.uploadPlugin(serverId, file);
      setPlugins(p => p.includes(r.filename) ? p : [...p, r.filename]);
      showFlash(`${r.filename} 업로드됨`);
    } catch (e) { showFlash(e instanceof Error ? e.message : '오류 발생'); }
    finally { setPluginBusy(false); }
  }

  async function doDeletePlugin(filename: string) {
    setPluginBusy(true);
    try {
      await api.deletePlugin(serverId, filename);
      setPlugins(p => p.filter(f => f !== filename));
      showFlash(`${filename} 삭제됨`);
    } catch (e) { showFlash(e instanceof Error ? e.message : '오류 발생'); }
    finally { setPluginBusy(false); }
  }

  async function addWl() {
    const name = wlInput.trim(); if (!name) return;
    setWlBusy(true);
    try {
      await api.addWhitelist(serverId, name);
      setWhitelist(p => [...p, name]); setWlInput('');
      showFlash(`${name} 화이트리스트에 추가됨`);
    } catch (e) { showFlash(e instanceof Error ? e.message : '오류 발생'); }
    finally { setWlBusy(false); }
  }

  async function removeWl(name: string) {
    setWlBusy(true);
    try {
      await api.removeWhitelist(serverId, name);
      setWhitelist(p => p.filter(n => n !== name));
      showFlash(`${name} 화이트리스트에서 제거됨`);
    } catch (e) { showFlash(e instanceof Error ? e.message : '오류 발생'); }
    finally { setWlBusy(false); }
  }

  async function opAction(deop: boolean) {
    const name = opInput.trim(); if (!name) return;
    setOpBusy(true);
    try {
      const r = deop ? await api.deopPlayer(serverId, name) : await api.opPlayer(serverId, name);
      showFlash(r.output || `${name} ${deop ? 'OP 박탈' : 'OP 부여'} 완료`);
      if (deop) setOps(p => p.filter(n => n !== name));
      else setOps(p => p.includes(name) ? p : [...p, name]);
      setOpInput('');
    } catch (e) { showFlash(e instanceof Error ? e.message : '오류 발생'); }
    finally { setOpBusy(false); }
  }

  function PlayerRow({ name, onRemove, busy }: { name: string; onRemove: () => void; busy: boolean }) {
    return (
      <div className="manage-item">
        <img src={`https://mc-heads.net/avatar/${encodeURIComponent(name)}/20`} alt={name}
          className="manage-avatar" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}/>
        <span>{name}</span>
        <button className="secondary small" disabled={busy} onClick={onRemove}>제거</button>
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="section-title">
        <div><span className="eyebrow">MANAGE</span><h2>서버 관리</h2></div>
      </div>
      {flash && <div className="manage-flash">{flash}</div>}

      {/* JVM Memory */}
      <div className="manage-section">
        <h3>JVM 메모리</h3>
        <p className="section-copy">서버에 할당할 JVM 힙 메모리를 설정합니다. 변경 후 서버 재시작이 필요합니다.</p>
        {jvmLoading ? <p className="muted">불러오는 중…</p> : (
          <div className="manage-add-row">
            <input type="number" min={512} max={8192} step={256} value={jvmMb}
              onChange={e => setJvmMb(Number(e.target.value))} disabled={jvmBusy}/>
            <span className="muted">MiB</span>
            <button onClick={() => void saveJvm()} disabled={jvmBusy}>저장</button>
          </div>
        )}
      </div>

      {/* server.properties */}
      <div className="manage-section">
        <h3>server.properties</h3>
        <p className="section-copy">서버 설정 파일을 직접 편집합니다. 저장 후 서버 재시작이 필요합니다.</p>
        {propsLoading ? <p className="muted">불러오는 중…</p> : (
          <>
            <textarea className="properties-editor" rows={14} value={props}
              onChange={e => setProps(e.target.value)} disabled={propsBusy}/>
            <div style={{ marginTop: '8px' }}>
              <button onClick={() => void saveProps()} disabled={propsBusy}>저장</button>
            </div>
          </>
        )}
      </div>

      {/* Backups */}
      <div className="manage-section">
        <h3>월드 백업</h3>
        <p className="section-copy">월드 데이터를 tar.gz로 백업하고 복원할 수 있습니다.</p>
        <div style={{ marginBottom: '10px' }}>
          <button onClick={() => void doCreateBackup()} disabled={backupBusy}>백업 생성</button>
        </div>
        {backupsLoading ? <p className="muted">불러오는 중…</p>
          : backups.length === 0 ? <p className="muted">저장된 백업이 없습니다.</p>
          : <div className="backup-list">
              {backups.map(f => (
                <div key={f} className="backup-item">
                  <span className="backup-name">{f}</span>
                  <div className="backup-actions">
                    <button className="secondary small" disabled={backupBusy} onClick={() => void doRestoreBackup(f)}>복원</button>
                    <button className="secondary small" disabled={backupBusy} onClick={() => void doDeleteBackup(f)}>삭제</button>
                  </div>
                </div>
              ))}
            </div>}
      </div>

      {/* Plugins */}
      <div className="manage-section">
        <h3>플러그인</h3>
        <p className="section-copy">.jar 플러그인 파일을 업로드하거나 삭제합니다.</p>
        <div style={{ marginBottom: '10px' }}>
          <input type="file" accept=".jar" disabled={pluginBusy}
            onChange={e => { const f = e.target.files?.[0]; if (f) void doUploadPlugin(f); e.target.value = ''; }}/>
        </div>
        {pluginsLoading ? <p className="muted">불러오는 중…</p>
          : plugins.length === 0 ? <p className="muted">설치된 플러그인이 없습니다.</p>
          : <div className="plugin-list">
              {plugins.map(f => (
                <div key={f} className="plugin-item">
                  <span className="plugin-name">{f}</span>
                  <button className="secondary small" disabled={pluginBusy} onClick={() => void doDeletePlugin(f)}>삭제</button>
                </div>
              ))}
            </div>}
      </div>

      {/* Whitelist */}
      {!active && <div className="notice">서버가 실행 중일 때만 화이트리스트/OP 관리를 사용할 수 있습니다.</div>}

      <div className="manage-section">
        <h3>화이트리스트</h3>
        <p className="section-copy">등록된 플레이어만 서버에 접속할 수 있습니다. (server.properties에서 white-list=true 필요)</p>
        <div className="manage-add-row">
          <input value={wlInput} onChange={e => setWlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void addWl()}
            placeholder="플레이어 이름" disabled={!active || wlBusy}/>
          <button onClick={() => void addWl()} disabled={!active || wlBusy || !wlInput.trim()}>추가</button>
        </div>
        {wlLoading ? <p className="muted">불러오는 중…</p>
          : whitelist.length === 0 ? <p className="muted">화이트리스트가 비어 있습니다.</p>
          : <div className="manage-list">
              {whitelist.map(name => (
                <PlayerRow key={name} name={name} busy={!active || wlBusy} onRemove={() => void removeWl(name)}/>
              ))}
            </div>}
      </div>

      <div className="manage-section">
        <h3>OP 권한 관리</h3>
        <p className="section-copy">OP 플레이어는 서버 내 관리자 명령어를 사용할 수 있습니다.</p>
        <div className="manage-add-row">
          <input value={opInput} onChange={e => setOpInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void opAction(false)}
            placeholder="플레이어 이름" disabled={!active || opBusy}/>
          <button onClick={() => void opAction(false)} disabled={!active || opBusy || !opInput.trim()}>OP 부여</button>
        </div>
        {ops.length > 0 && (
          <div className="manage-list">
            {ops.map(name => (
              <PlayerRow key={name} name={name} busy={!active || opBusy} onRemove={async () => {
                setOpBusy(true);
                try {
                  const r = await api.deopPlayer(serverId, name);
                  setOps(p => p.filter(n => n !== name));
                  showFlash(r.output || `${name} OP 박탈 완료`);
                } catch (e) { showFlash(e instanceof Error ? e.message : '오류 발생'); }
                finally { setOpBusy(false); }
              }}/>
            ))}
          </div>
        )}
        {ops.length === 0 && <p className="muted">등록된 OP가 없습니다.</p>}
      </div>
    </section>
  );
}

const TIME_RANGE_OPTIONS: { label: string; minutes: number }[] = [
  { label: '15분', minutes: 15 },
  { label: '1시간', minutes: 60 },
  { label: '6시간', minutes: 360 },
];

function ServerMetricsPanel({ serverId }: { serverId: string }) {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [minutes, setMinutes] = useState(60);

  useEffect(() => {
    setLoading(true);
    const load = () => api.serverMetrics(serverId, minutes).then(setMetrics).catch(() => {});
    load().finally(() => setLoading(false));
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 15000);
    return () => window.clearInterval(timer);
  }, [serverId, minutes]);

  return (
    <div className="metrics-panel">
      <div className="section-title">
        <div><span className="eyebrow">METRICS</span><h2>리소스 사용량</h2></div>
        <div className="metrics-time-range" role="group" aria-label="시간 범위 선택">
          {TIME_RANGE_OPTIONS.map(opt => (
            <button
              key={opt.minutes}
              type="button"
              className={minutes === opt.minutes ? 'active' : ''}
              onClick={() => setMinutes(opt.minutes)}
              aria-pressed={minutes === opt.minutes}
            >
              {opt.label}
            </button>
          ))}
        </div>
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

type ServerSubView = 'console' | 'players' | 'manage' | 'overview' | 'metrics' | 'schedule' | 'settings';

type ServerDetailProps = {
  server: Server;
  busy: boolean;
  onAction: (action: 'start' | 'stop') => void;
  onDelete: (deleteData: boolean, confirmation: string) => void;
  onBack: () => void;
};

export function ServerDetail({ server, busy, onAction, onDelete, onBack }: ServerDetailProps) {
  const [subView, setSubView] = useState<ServerSubView>('console');
  const [deleting, setDeleting] = useState(false);
  const [deleteData, setDeleteData] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const canStart = server.status === 'stopped' || server.status === 'error';
  const canStop = server.status === 'running' || server.status === 'provisioning';
  const active = server.status === 'running' || server.status === 'provisioning';

  const NAV_ITEMS: [ServerSubView, string, string][] = [
    ['console', '▶', '콘솔'],
    ['players', '◉', '플레이어'],
    ['manage', '⚒', '관리'],
    ['overview', '◫', '서버 정보'],
    ['metrics', '▦', '메트릭'],
    ['schedule', '◷', '스케줄'],
    ['settings', '⚙', '설정'],
  ];

  return (
    <div className="server-detail-layout">
      {/* Left server-specific sidebar */}
      <aside className="server-sidebar">
        <div className="server-sidebar-header">
          <button className="text-button server-sidebar-back" onClick={onBack}>← 목록</button>
          <div className="server-sidebar-identity">
            <span className="server-sidebar-icon" aria-hidden="true">⬡</span>
            <div>
              <strong className="server-sidebar-name">{server.name}</strong>
              <div style={{marginTop:'5px'}}><Status value={server.status}/></div>
            </div>
          </div>
          <div className="server-sidebar-controls">
            <button disabled={busy || !canStart} onClick={() => onAction('start')}>▶ 시작</button>
            <button className="secondary" disabled={busy || !canStop} onClick={() => onAction('stop')}>■ 중지</button>
          </div>
        </div>
        <nav className="server-sidebar-nav" aria-label="서버 메뉴">
          {NAV_ITEMS.map(([sv, icon, label]) => (
            <button
              key={sv}
              className={subView === sv ? 'active' : ''}
              aria-current={subView === sv ? 'page' : undefined}
              onClick={() => setSubView(sv)}
            >
              <span aria-hidden="true">{icon}</span>{label}
            </button>
          ))}
          <hr className="server-sidebar-sep"/>
          <button
            className="server-sidebar-danger"
            disabled={busy}
            onClick={() => setDeleting(d => !d)}
          >
            <span aria-hidden="true">✕</span>서버 삭제
          </button>
        </nav>
        {deleting && (
          <form className="server-delete-form" onSubmit={e => { e.preventDefault(); onDelete(deleteData, confirmation); }}>
            <p>기본값은 데이터 보존입니다.</p>
            <label className="checkbox">
              <input type="checkbox" checked={deleteData} onChange={e => setDeleteData(e.target.checked)}/>
              저장 데이터도 삭제 (복구 불가)
            </label>
            {deleteData && (
              <label>서버 이름 입력 확인
                <input value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder={server.name}/>
              </label>
            )}
            <div className="actions">
              <button type="button" className="secondary" onClick={() => setDeleting(false)} disabled={busy}>취소</button>
              <button className="danger" disabled={busy || (deleteData && confirmation !== server.name)}>
                {busy ? '처리 중…' : deleteData ? '데이터 포함 삭제' : '서버 삭제'}
              </button>
            </div>
          </form>
        )}
      </aside>

      {/* Right content area */}
      <div className="server-content">
        {subView === 'console' && (
          <div className="panel">
            <div className="section-title detail-summary">
              <div><span className="eyebrow">CONSOLE</span><h2>서버 콘솔</h2></div>
            </div>
            <ServerConsole serverId={server.id} active={active}/>
          </div>
        )}
        {subView === 'players' && (
          <PlayerPanel serverId={server.id} active={active} />
        )}
        {subView === 'manage' && (
          <ManagePanel serverId={server.id} active={active} />
        )}
        {subView === 'overview' && (
          <>
            <section className="panel">
              <div className="section-title detail-summary">
                <div><span className="eyebrow">SERVER INFO</span><h2>서버 정보</h2><p className="detail-meta">생성일 {new Date(server.created_at).toLocaleString('ko-KR')} · {server.node_id}</p></div>
              </div>
              <dl className="details-grid">
                <div><dt>버전</dt><dd>{server.version} · 고정</dd></div>
                <div><dt>배포 Worker</dt><dd>{server.node_id}</dd></div>
                <div><dt>CPU / 메모리</dt><dd>{server.cpu} 코어 / {server.memory_mb} MiB</dd></div>
                <div><dt>스토리지</dt><dd>{server.storage_gb} GiB · local-path</dd></div>
                <div><dt>접속 주소</dt><dd style={{display:'flex',alignItems:'center',gap:'8px'}}><code>{server.connection ?? '할당 중'}</code><CopyBtn text={server.connection}/></dd></div>
                <div><dt>데이터 정책</dt><dd>Retain · 삭제 시 기본 보존</dd></div>
              </dl>
            </section>
            <section className="panel">
              <div className="section-title"><div><span className="eyebrow">배포된 리소스</span><h2>Kubernetes 리소스 계획</h2></div></div>
              <p className="muted">Namespace: <code>{server.resource_plan.namespace}</code> · StatefulSet 1 replica · Worker 전용 배치</p>
              <div className="notice">Worker 장애 시 로컬 데이터가 자동으로 이동하지 않습니다.</div>
              {server.resource_plan.warnings.map(w => <p className="muted" key={w}>{w}</p>)}
              <ResourcePlanViewer plan={server.resource_plan}/>
            </section>
          </>
        )}
        {subView === 'metrics' && (
          <section className="panel">
            <ServerMetricsPanel serverId={server.id}/>
          </section>
        )}
        {subView === 'schedule' && (
          <section className="panel">
            <SchedulePanel serverId={server.id}/>
          </section>
        )}
        {subView === 'settings' && (
          <ServerSettingsPanel
            serverId={server.id}
            currentVersion={server.version}
            onVersionSaved={() => {}}
            onClose={() => setSubView('console')}
          />
        )}
      </div>
    </div>
  );
}
