import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, type Game } from '../api/client';
import { defaults, validate, type GameType, type ServerInput, type WorkerNode } from '../domain/server';
import { Tooltip } from '../components/Tooltip';
import { FileText, Pickaxe, Hammer, Layers, Package, Flame } from 'lucide-react';

type CreateServerProps = {
  nodes: WorkerNode[];
  busy: boolean;
  onCreate: (input: ServerInput) => Promise<void>;
  onCancel: () => void;
};

const GAME_TYPES: { type: GameType; label: string; desc: string; icon: ReactNode }[] = [
  { type: 'PAPER',           label: 'Paper',       desc: '플러그인 서버 (추천)',  icon: <FileText size={20} color="#22c55e"/> },
  { type: 'VANILLA',         label: 'Vanilla',     desc: '순정 Minecraft',       icon: <Pickaxe size={20} color="#84cc16"/> },
  { type: 'FORGE',           label: 'Forge',       desc: '모드 서버',             icon: <Hammer size={20} color="#f97316"/> },
  { type: 'FABRIC',          label: 'Fabric',      desc: '경량 모드 서버',        icon: <Layers size={20} color="#8b5cf6"/> },
  { type: 'MODRINTH',        label: 'Modrinth',    desc: '모드팩 (ID 입력)',      icon: <Package size={20} color="#1bd96a"/> },
  { type: 'AUTO_CURSEFORGE', label: 'CurseForge',  desc: '모드팩 (slug 입력)',   icon: <Flame size={20} color="#f36f1a"/> },
];

const MODRINTH_PRESETS = [
  { id: 'adrenaline',         name: 'Adrenaline',              desc: '고성능 최적화' },
  { id: 'fabulously-optimized', name: 'Fabulously Optimized',  desc: 'Fabric 최적화팩' },
  { id: 'all-the-mods-9',    name: 'All the Mods 9',           desc: '대형 모드팩' },
  { id: 'create-new-age',    name: 'Create: New Age',           desc: 'Create 모드팩' },
];

const CF_PRESETS = [
  { slug: 'all-the-mods-9',          name: 'All the Mods 9' },
  { slug: 'ftb-infinity-evolved',    name: 'FTB Infinity Evolved' },
  { slug: 'rlcraft',                 name: 'RLCraft' },
  { slug: 'stoneblock-3',            name: 'SkyFactory 4' },
];

const resourceFields = [
  { key: 'cpu', label: 'CPU', unit: 'vCPU', min: 0.5, max: 4, step: 0.5 },
  { key: 'memory_mb', label: '메모리', unit: 'MiB', min: 1024, max: 8192, step: 1 },
  { key: 'storage_gb', label: '스토리지', unit: 'GiB', min: 5, max: 100, step: 1 },
] as const;

const RESOURCE_PLANS = [
  { name: 'Micro',  tag: '테스트용',  cpu: 0.5, memory_mb: 1024, storage_gb: 5  },
  { name: 'Small',  tag: '권장',      cpu: 1,   memory_mb: 2048, storage_gb: 10 },
  { name: 'Medium', tag: '다인용',    cpu: 2,   memory_mb: 4096, storage_gb: 20 },
  { name: 'Large',  tag: '고성능',    cpu: 4,   memory_mb: 8192, storage_gb: 50 },
];

function matchesPlan(input: ServerInput): string | null {
  const match = RESOURCE_PLANS.find(
    p => p.cpu === input.cpu && p.memory_mb === input.memory_mb && p.storage_gb === input.storage_gb
  );
  return match?.name ?? null;
}

export function CreateServer({ nodes, busy, onCreate, onCancel }: CreateServerProps) {
  const workers = nodes.filter(node => node.role === 'worker' && node.schedulable);
  const defaultWorkerId = workers[0]?.id;
  const [input, setInput] = useState<ServerInput>({ ...defaults, node_id: defaultWorkerId ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [games, setGames] = useState<Game[]>([]);
  const [hasCfKey, setHasCfKey] = useState<boolean | null>(null);

  useEffect(() => {
    api.games().then(setGames).catch(() => {});
  }, []);

  useEffect(() => {
    if (input.game_type === 'AUTO_CURSEFORGE' && hasCfKey === null) {
      api.getCfKey().then(r => setHasCfKey(r.has_key)).catch(() => setHasCfKey(false));
    }
  }, [input.game_type, hasCfKey]);

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

  function applyPlan(plan: typeof RESOURCE_PLANS[number]) {
    setInput(previous => ({ ...previous, cpu: plan.cpu, memory_mb: plan.memory_mb, storage_gb: plan.storage_gb }));
    setErrors(previous => {
      const next = { ...previous };
      delete next['cpu'];
      delete next['memory_mb'];
      delete next['storage_gb'];
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

  const selectedPlan = matchesPlan(input);
  const visiblePlans = RESOURCE_PLANS.filter(p => {
    if (input.game === 'valheim') return p.memory_mb >= 2048;
    if (input.game === 'cs2' || input.game === 'rust') return p.memory_mb >= 4096;
    return true;
  });

  return <section className="panel create-panel">
    <div className="section-title">
      <div><h2>새 서버 생성</h2><p className="section-copy">서버 구성은 생성 후 상세 화면에서 확인할 수 있습니다.</p></div>
      <span className="tag">{GAME_TYPES.find(g => g.type === input.game_type)?.label ?? 'Paper'}</span>
    </div>
    <form onSubmit={submit} noValidate>
      <div className="form-section">
        <div className="form-section-header"><span>01</span><div><h3>기본 정보</h3><p>서버 이름, 버전과 배포할 호스트 서버를 선택하세요.</p></div></div>

        {/* Game picker */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ marginBottom: '10px', display: 'block' }}>게임 선택</label>
          <div className="game-picker-grid">
            {games.length === 0
              ? <div className="game-picker-card selected" role="radio" aria-checked="true" tabIndex={0}>
                  <span className="game-picker-icon" aria-hidden="true"><Pickaxe size={22}/></span>
                  <div><strong>Minecraft Java</strong></div>
                </div>
              : games.map(game => (
                  <div
                    key={game.slug}
                    className={`game-picker-card${input.game === game.slug ? ' selected' : ''}${!game.supported ? ' disabled' : ''}`}
                    role="radio"
                    aria-checked={input.game === game.slug}
                    aria-disabled={!game.supported}
                    tabIndex={game.supported ? 0 : -1}
                    onClick={() => {
                      if (!game.supported) return;
                      const slug = game.slug as ServerInput['game'];
                      const gameDefaults = slug === 'valheim'
                        ? { cpu: 2, memory_mb: 4096, storage_gb: 20 }
                        : slug === 'garrysmod'
                        ? { cpu: 1, memory_mb: 2048, storage_gb: 15 }
                        : slug === 'cs2'
                        ? { cpu: 2, memory_mb: 4096, storage_gb: 20 }
                        : slug === 'rust'
                        ? { cpu: 2, memory_mb: 4096, storage_gb: 30 }
                        : { cpu: 1, memory_mb: 2048, storage_gb: 10 };
                      setInput(prev => ({
                        ...prev,
                        game: slug,
                        game_type: 'PAPER' as GameType,
                        modrinth_project: null, cf_slug: null,
                        server_password: null, world_name: null, server_public: false,
                        map_name: null, gamemode_name: null,
                        cs2_gslt: null, cs2_workshop_map: null, cs2_workshop_collection: null,
                        ...gameDefaults,
                      }));
                    }}
                    onKeyDown={e => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      if (!game.supported) return;
                      const slug = game.slug as ServerInput['game'];
                      set('game', slug);
                    }}
                  >
                    {game.image_url
                      ? <img src={game.image_url} alt={game.name} className="game-picker-img" />
                      : <span className="game-picker-icon" aria-hidden="true">⛏</span>}
                    <div>
                      <strong>{game.name}</strong>
                      {!game.supported && <small>예정...</small>}
                    </div>
                  </div>
                ))
            }
          </div>
        </div>

        <div className="form-grid">
          <label className="full">서버 이름
            <input autoFocus value={input.name} onChange={event => set('name', event.target.value)} placeholder="예: My Survival World" maxLength={40} aria-invalid={!!errors.name} aria-describedby="name-hint"/>
            <small id="name-hint">{errors.name ?? '영문·숫자·공백·밑줄·하이픈, 3–40자'}</small>
          </label>
          {input.game === 'minecraft-java' && (<>
          <div className="full">
            <label style={{ marginBottom: '8px', display: 'block' }}>서버 타입</label>
            <div className="game-type-grid">
              {GAME_TYPES.map(({ type, label, desc, icon }) => (
                <button key={type} type="button"
                  className={`game-type-card${input.game_type === type ? ' selected' : ''}`}
                  onClick={() => set('game_type', type)}
                >
                  <span className="game-type-icon">{icon}</span>
                  <span className="game-type-label">{label}</span>
                  <span className="game-type-desc">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {input.game_type === 'MODRINTH' && (
            <div className="full">
              <label>Modrinth 프로젝트 ID
                <input value={input.modrinth_project ?? ''} placeholder="예: adrenaline"
                  onChange={e => set('modrinth_project', e.target.value || null)}
                  aria-invalid={!!errors.modrinth_project} />
                {errors.modrinth_project && <small style={{ color: 'var(--danger)' }}>{errors.modrinth_project}</small>}
              </label>
              <div className="modpack-presets">
                {MODRINTH_PRESETS.map(p => (
                  <button key={p.id} type="button" className="modpack-preset-btn"
                    onClick={() => set('modrinth_project', p.id)}>
                    <strong>{p.name}</strong><span>{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {input.game_type === 'AUTO_CURSEFORGE' && (
            <div className="full">
              {hasCfKey === false && (
                <div className="cf-key-notice" role="alert">
                  <span>⚠ CurseForge API 키가 등록되지 않았습니다.</span>
                  <span className="muted" style={{ fontSize: '12px' }}>사이드바 하단 <strong>프로필 설정</strong>에서 먼저 등록해주세요.</span>
                </div>
              )}
              {hasCfKey && (
                <>
                  <label>CurseForge 모드팩 Slug
                    <input value={input.cf_slug ?? ''} placeholder="예: all-the-mods-9"
                      onChange={e => set('cf_slug', e.target.value || null)}
                      aria-invalid={!!errors.cf_slug} />
                    {errors.cf_slug && <small style={{ color: 'var(--danger)' }}>{errors.cf_slug}</small>}
                  </label>
                  <div className="modpack-presets">
                    {CF_PRESETS.map(p => (
                      <button key={p.slug} type="button" className="modpack-preset-btn"
                        onClick={() => set('cf_slug', p.slug)}>
                        <strong>{p.name}</strong>
                      </button>
                    ))}
                  </div>
                  <small style={{ marginTop: '6px', display: 'block', color: 'var(--muted)' }}>
                    API 키 등록됨 · 프로필 설정에서 변경 또는 삭제할 수 있습니다.
                  </small>
                </>
              )}
            </div>
          )}

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
          </>)}

          {input.game === 'valheim' && (
            <div className="full">
              <h4 style={{ margin: '0 0 12px' }}>Valheim 서버 설정</h4>
              <label>월드 이름
                <input value={input.world_name ?? ''} onChange={e => set('world_name', e.target.value || null)} placeholder="KubeHostWorld" maxLength={64}/>
              </label>
              <label>서버 비밀번호 <small>(최소 5자, 없으면 공개 서버)</small>
                <input type="password" value={input.server_password ?? ''} onChange={e => set('server_password', e.target.value || null)} placeholder="5자 이상" maxLength={64}/>
                {errors.server_password && <small style={{ color: 'var(--danger)' }}>{errors.server_password}</small>}
              </label>
              <label className="checkbox" style={{ marginTop: '8px' }}>
                <input type="checkbox" checked={input.server_public ?? false} onChange={e => set('server_public', e.target.checked)}/>
                Steam 공개 서버 목록에 표시
              </label>
            </div>
          )}

          {input.game === 'cs2' && (
            <div className="full">
              <h4 style={{ margin: '0 0 12px' }}>CS2 서버 설정</h4>
              <label>GSLT 토큰 <small>(권장)</small>
                <input
                  value={input.cs2_gslt ?? ''}
                  onChange={e => set('cs2_gslt', e.target.value || null)}
                  placeholder="Steam Game Server Login Token"
                  maxLength={64}
                />
                <small>없으면 VAC 없는 insecure 모드로 실행됩니다.</small>
              </label>
              <h4 style={{ margin: '16px 0 12px' }}>CS2 Workshop</h4>
              <label>Workshop 맵 ID <small>(선택 사항)</small>
                <input
                  value={input.cs2_workshop_map ?? ''}
                  onChange={e => set('cs2_workshop_map', e.target.value || null)}
                  placeholder="예: 3070596702"
                  maxLength={32}
                />
                <small>단일 Workshop 맵 ID — 서버 시작 시 자동 로드</small>
              </label>
              <label style={{ marginTop: '12px' }}>Workshop 컬렉션 ID <small>(선택 사항)</small>
                <input
                  value={input.cs2_workshop_collection ?? ''}
                  onChange={e => set('cs2_workshop_collection', e.target.value || null)}
                  placeholder="예: 3070596702"
                  maxLength={32}
                />
                <small>컬렉션 ID — 서버 시작 시 포함된 맵 모두 다운로드</small>
              </label>
            </div>
          )}

          {input.game === 'garrysmod' && (
            <div className="full">
              <h4 style={{ margin: '0 0 12px' }}>Garry's Mod 서버 설정</h4>
              <label>시작 맵
                <input value={input.map_name ?? ''} onChange={e => set('map_name', e.target.value || null)} placeholder="gm_flatgrass" maxLength={64}/>
              </label>
              <label>게임모드
                <select value={input.gamemode_name ?? 'sandbox'} onChange={e => set('gamemode_name', e.target.value)}>
                  <option value="sandbox">Sandbox</option>
                  <option value="terrortown">TTT (역할극)</option>
                  <option value="prop_hunt">Prop Hunt</option>
                  <option value="murder">Murder</option>
                  <option value="deathrun">Deathrun</option>
                </select>
              </label>
            </div>
          )}
          <label>호스트 서버
            <select value={input.node_id} onChange={event => set('node_id', event.target.value)} aria-invalid={!!errors.node_id} aria-describedby="node-hint">
              {!workers.length && <option value="">사용 가능한 호스트 서버 없음</option>}
              {workers.map(node => <option key={node.id} value={node.id}>{node.name}</option>)}
            </select>
            <small id="node-hint">{errors.node_id ?? '게임 서버는 호스트 서버에 배포됩니다.'}</small>
          </label>
          {(() => {
            const selectedNode = workers.find(n => n.id === input.node_id);
            if (!selectedNode) return null;
            const cpuAvailM = selectedNode.cpu_capacity * 1000 - selectedNode.cpu_requested_m;
            const memAvailMb = selectedNode.memory_mb_capacity - selectedNode.memory_mb_requested;
            const cpuNeedM = input.cpu * 1000;
            const warnings: string[] = [];
            if (cpuNeedM > cpuAvailM) warnings.push(`CPU 부족: 필요 ${input.cpu} vCPU, 가용 ${(cpuAvailM / 1000).toFixed(1)} vCPU`);
            if (input.memory_mb > memAvailMb) warnings.push(`메모리 부족: 필요 ${input.memory_mb} MiB, 가용 ${memAvailMb} MiB`);
            if (!warnings.length) return null;
            return <div className="resource-warning" role="alert">{warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}</div>;
          })()}
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-header"><span>02</span><div><h3>서버 구성</h3><p>서버가 사용할 CPU, 메모리와 로컬 스토리지를 지정하세요.</p></div></div>

        {/* Resource preset cards */}
        <div style={{ marginBottom: '22px' }}>
          <label style={{ marginBottom: '10px', display: 'block' }}>리소스 프리셋 <small style={{ fontWeight: 400 }}>선택 후 수동 조정 가능</small></label>
          <div className="resource-plan-grid">
            {visiblePlans.map(plan => (
              <button
                key={plan.name}
                type="button"
                className={`resource-plan-card${selectedPlan === plan.name ? ' selected' : ''}`}
                onClick={() => applyPlan(plan)}
                aria-pressed={selectedPlan === plan.name}
              >
                <div className="resource-plan-card-header">
                  <strong>{plan.name}</strong>
                  <span className="resource-plan-tag">{plan.tag}</span>
                </div>
                <div className="resource-plan-card-specs">
                  <span>{plan.cpu} vCPU</span>
                  <span>{plan.memory_mb / 1024} GiB</span>
                  <span>{plan.storage_gb} GiB</span>
                </div>
              </button>
            ))}
          </div>
        </div>

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
        <div className="form-section-header"><span>03</span><div><h3>접속</h3><p>고정 포트를 지정하거나 플랫폼 자동 배정을 사용하세요.</p></div></div>
        <div className="form-grid">
          <label>접속 포트 <Tooltip text="외부에서 서버에 접속할 포트 번호입니다. 비워두면 자동으로 배정됩니다." /> <span className="field-unit">선택 사항</span>
            <input type="number" value={input.node_port ?? ''} min={30000} max={32767} step={1}
              placeholder="자동 배정"
              onChange={event => set('node_port', event.target.value === '' ? null : Number(event.target.value))}
              aria-invalid={!!errors.node_port} aria-describedby="port-hint"/>
            <small id="port-hint">{errors.node_port ?? '30000–32767 · 비워두면 자동 배정'}</small>
          </label>
        </div>
      </div>
      <div className="notice">데이터는 선택한 호스트 서버의 로컬 SSD에 저장됩니다. 호스트 서버 장애 시 다른 노드로 자동 이동하지 않으며, 저장 공간 크기는 실제 디스크 예약을 보장하지 않습니다.</div>
      <div className="actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>취소</button>
        <button disabled={busy || !workers.length}>{busy ? '생성 중…' : '서버 생성 →'}</button>
      </div>
    </form>
  </section>;
}
