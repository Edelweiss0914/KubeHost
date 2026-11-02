import { useEffect, useState, type FormEvent } from 'react';
import { defaults, validate, type ServerInput, type WorkerNode } from '../domain/server';

type CreateServerProps = {
  nodes: WorkerNode[];
  busy: boolean;
  onCreate: (input: ServerInput) => Promise<void>;
  onCancel: () => void;
};

const resourceFields = [
  { key: 'cpu', label: 'CPU', unit: 'vCPU', min: 0.5, max: 4, step: 0.5 },
  { key: 'memory_mb', label: '메모리', unit: 'MiB', min: 1024, max: 8192, step: 1 },
  { key: 'storage_gb', label: '스토리지', unit: 'GiB', min: 5, max: 100, step: 1 },
] as const;

export function CreateServer({ nodes, busy, onCreate, onCancel }: CreateServerProps) {
  const workers = nodes.filter(node => node.role === 'worker' && node.schedulable);
  const defaultWorkerId = workers[0]?.id;
  const [input, setInput] = useState<ServerInput>({ ...defaults, node_id: defaultWorkerId ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (defaultWorkerId) setInput(previous => previous.node_id ? previous : { ...previous, node_id: defaultWorkerId });
  }, [defaultWorkerId]);

  function set<K extends keyof ServerInput>(key: K, value: ServerInput[K]) {
    setInput(previous => ({ ...previous, [key]: value }));
    setErrors(previous => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const submitted = { ...input, name: input.name.trim() };
    const next = validate(submitted);
    setErrors(next);
    if (!Object.keys(next).length) await onCreate(submitted);
  }

  return <section className="panel create-panel">
    <div className="section-title">
      <div><span className="eyebrow">SERVER PROVISIONING</span><h2>새 Minecraft 서버</h2><p className="section-copy">서버 구성은 생성 후 상세 화면에서 확인할 수 있습니다.</p></div>
      <span className="tag">Paper</span>
    </div>
    <form onSubmit={submit} noValidate>
      <div className="form-section">
        <div className="form-section-header"><span>01</span><div><h3>기본 정보</h3><p>서버 이름, 버전과 배포할 Worker를 선택하세요.</p></div></div>
        <div className="form-grid">
          <label className="full">서버 이름
            <input autoFocus value={input.name} onChange={event => set('name', event.target.value)} placeholder="예: My Survival World" maxLength={40} aria-invalid={!!errors.name} aria-describedby="name-hint"/>
            <small id="name-hint">{errors.name ?? '영문·숫자·공백·밑줄·하이픈, 3–40자'}</small>
          </label>
          <label>게임
            <select value={input.game} disabled><option value="minecraft-java">Minecraft Java</option></select>
          </label>
          <label>서버 소프트웨어
            <select value={input.edition} disabled><option value="paper">Paper</option></select>
          </label>
          <label>버전
            <select value={input.version} onChange={event => set('version', event.target.value)}>
              <option value="LATEST">LATEST (최신)</option>
              <option value="1.21.4">1.21.4</option>
              <option value="1.21.1">1.21.1</option>
              <option value="1.20.6">1.20.6</option>
              <option value="1.20.4">1.20.4</option>
              <option value="1.16.5">1.16.5</option>
              <option value="1.14.4">1.14.4</option>
              <option value="1.12.2">1.12.2</option>
            </select>
            <small>접속할 클라이언트 버전과 맞춰야 합니다.</small>
          </label>
          <label>배포 Worker
            <select value={input.node_id} onChange={event => set('node_id', event.target.value)} aria-invalid={!!errors.node_id} aria-describedby="node-hint">
              {!workers.length && <option value="">사용 가능한 Worker 없음</option>}
              {workers.map(node => <option key={node.id} value={node.id}>{node.name}</option>)}
            </select>
            <small id="node-hint">{errors.node_id ?? '게임 서버는 Worker 노드에 배포됩니다.'}</small>
          </label>
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-header"><span>02</span><div><h3>리소스</h3><p>서버가 사용할 CPU, 메모리와 로컬 스토리지를 지정하세요.</p></div></div>
        <div className="form-grid resource-grid">
          {resourceFields.map(field => <label key={field.key}>{field.label} <span className="field-unit">{field.unit}</span>
            <input type="number" value={input[field.key]} min={field.min} max={field.max} step={field.step}
              onChange={event => set(field.key, Number(event.target.value))}
              aria-invalid={!!errors[field.key]} aria-describedby={field.key + '-hint'}/>
            <small id={field.key + '-hint'}>{errors[field.key] ?? field.min + '–' + field.max + ' ' + field.unit}</small>
          </label>)}
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-header"><span>03</span><div><h3>접속</h3><p>고정 포트를 지정하거나 Kubernetes 자동 배정을 사용하세요.</p></div></div>
        <div className="form-grid">
          <label>NodePort <span className="field-unit">선택 사항</span>
            <input type="number" value={input.node_port ?? ''} min={30000} max={32767} step={1}
              placeholder="자동 배정"
              onChange={event => set('node_port', event.target.value === '' ? null : Number(event.target.value))}
              aria-invalid={!!errors.node_port} aria-describedby="port-hint"/>
            <small id="port-hint">{errors.node_port ?? '30000–32767 · 비워두면 자동 배정'}</small>
          </label>
        </div>
      </div>
      <div className="notice">데이터는 선택한 Worker의 로컬 SSD에 저장됩니다. Worker 장애 시 다른 노드로 자동 이동하지 않으며, PVC 크기는 실제 디스크 예약을 보장하지 않습니다.</div>
      <div className="actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>취소</button>
        <button disabled={busy || !workers.length}>{busy ? '생성 중…' : '서버 생성 →'}</button>
      </div>
    </form>
  </section>;
}