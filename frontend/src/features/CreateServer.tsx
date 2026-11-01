import { useState, type FormEvent } from 'react';
import { defaults, validate, type ServerInput, type WorkerNode } from '../domain/server';

type CreateServerProps = {
  nodes: WorkerNode[];
  busy: boolean;
  onCreate: (input: ServerInput) => Promise<void>;
  onCancel: () => void;
};

const resourceFields = [
  { key: 'cpu', label: 'CPU (코어)', min: 0.5, max: 4, step: 0.5 },
  { key: 'memory_mb', label: '메모리 (MiB)', min: 1024, max: 8192, step: 1 },
  { key: 'storage_gb', label: '스토리지 (GiB)', min: 5, max: 100, step: 1 },
] as const;

export function CreateServer({ nodes, busy, onCreate, onCancel }: CreateServerProps) {
  const workers = nodes.filter(node => node.role === 'worker' && node.schedulable);
  const [input, setInput] = useState<ServerInput>({ ...defaults, node_id: workers[0]?.id ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set<K extends keyof ServerInput>(key: K, value: ServerInput[K]) {
    setInput(previous => ({ ...previous, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const submitted = { ...input, name: input.name.trim() };
    const next = validate(submitted);
    setErrors(next);
    if (!Object.keys(next).length) await onCreate(submitted);
  }

  return <section className="panel">
    <div className="section-title">
      <div><span className="eyebrow">NEW INSTANCE</span><h2>새 서버 만들기</h2></div>
      <span className="tag">MOCK</span>
    </div>
    <form onSubmit={submit} noValidate>
      <div className="form-grid">
        <label className="full">서버 이름
          <input autoFocus value={input.name} onChange={event => set('name', event.target.value)} placeholder="My Survival World" maxLength={40} aria-invalid={!!errors.name} aria-describedby="name-hint"/>
          <small id="name-hint">{errors.name ?? '영문, 숫자, 공백, 밑줄, 하이픈 · 3–40자 · 첫 글자는 영문 또는 숫자'}</small>
        </label>
        <label>게임
          <select value={input.game} disabled><option value="minecraft-java">Minecraft Java</option></select>
        </label>
        <label>서버 소프트웨어
          <select value={input.edition} disabled><option value="paper">Paper</option></select>
        </label>
        <label>고정 버전
          <select value={input.version} disabled><option value="1.21.4">1.21.4 (고정)</option></select>
          <small>latest 대신 고정된 버전을 사용합니다.</small>
        </label>
        <label>배포 Worker
          <select value={input.node_id} onChange={event => set('node_id', event.target.value)} aria-invalid={!!errors.node_id} aria-describedby="node-hint">
            {!workers.length && <option value="">사용 가능한 Worker 없음</option>}
            {workers.map(node => <option key={node.id} value={node.id}>{node.name}</option>)}
          </select>
          <small id="node-hint">{errors.node_id ?? 'Control Plane에는 배포하지 않습니다.'}</small>
        </label>
        {resourceFields.map(field => <label key={field.key}>{field.label}
          <input type="number" value={input[field.key]} min={field.min} max={field.max} step={field.step}
            onChange={event => set(field.key, Number(event.target.value))}
            aria-invalid={!!errors[field.key]} aria-describedby={`${field.key}-hint`}/>
          <small id={`${field.key}-hint`}>{errors[field.key] ?? `${field.min}–${field.max}`}</small>
        </label>)}
      </div>
      <div className="notice">로컬 SSD에 저장합니다. Worker 영구 장애 시 데이터가 다른 Worker로 자동 이동하지 않습니다. PVC 크기는 실제 디스크 예약을 보장하지 않습니다.</div>
      <div className="actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>취소</button>
        <button disabled={busy || !workers.length}>{busy ? '생성 중…' : '데모 서버 만들기 →'}</button>
      </div>
    </form>
  </section>;
}


