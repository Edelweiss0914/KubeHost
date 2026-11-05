import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { GameSettings, Server } from '../domain/server';

type Props = { server: Server; onClose: () => void; onSaved?: () => void };

export function GameSettingsPanel({ server, onClose, onSaved }: Props) {
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [workshopId, setWorkshopId] = useState('');
  const [workshopSaving, setWorkshopSaving] = useState(false);
  const [workshopError, setWorkshopError] = useState('');
  const [workshopSaved, setWorkshopSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      api.getGameSettings(server.id),
      server.game === 'garrysmod' ? api.getSettings(server.id) : Promise.resolve(null),
    ])
      .then(([gameResult, rawSettings]) => {
        if (!cancelled) {
          setSettings(gameResult);
          if (rawSettings) setWorkshopId(rawSettings['WORKSHOP_COLLECTION_ID'] ?? '');
        }
      })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : '설정을 불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [server.id, server.game]);

  async function saveWorkshop() {
    setWorkshopSaving(true);
    setWorkshopError('');
    setWorkshopSaved(false);
    try {
      const result = await api.setWorkshop(server.id, workshopId.trim());
      setWorkshopId(result.collection_id);
      setWorkshopSaved(true);
    } catch (cause) {
      setWorkshopError(cause instanceof Error ? cause.message : 'Workshop 설정을 저장하지 못했습니다.');
    } finally {
      setWorkshopSaving(false);
    }
  }

  async function save() {
    if (!settings) return;
    if ('world_name' in settings && !settings.world_name.trim()) {
      setError('월드 이름을 입력하세요.');
      return;
    }
    if ('map_name' in settings &&
        (!/^[A-Za-z0-9_-]+$/.test(settings.map_name) ||
         !/^[A-Za-z0-9_-]+$/.test(settings.gamemode_name))) {
      setError('맵과 게임모드는 영문, 숫자, 밑줄, 하이픈만 사용할 수 있습니다.');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await api.updateGameSettings(server.id, settings);
      setSaved(true);
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '설정을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="panel">
    <div className="section-title">
      <div><span className="eyebrow">GAME SETTINGS</span><h2>{server.name} 게임 설정</h2></div>
      <button className="secondary" onClick={onClose}>닫기</button>
    </div>
    <p className="muted notice">설정을 저장하면 게임 파드가 재시작됩니다. 접속 중인 플레이어의 연결이 끊깁니다.</p>
    {loading && <p className="muted">설정 불러오는 중…</p>}
    {!loading && settings && 'world_name' in settings && <div className="form-grid">
      <label>월드 이름
        <input value={settings.world_name} maxLength={64}
          onChange={e => setSettings({...settings, world_name: e.target.value})}/>
        <small>다른 이름으로 바꾸면 해당 이름의 월드를 사용합니다. 변경 전 백업을 권장합니다.</small>
      </label>
      <label className="checkbox"><input type="checkbox" checked={settings.server_public}
        onChange={e => setSettings({...settings, server_public: e.target.checked})}/>
        Steam 공개 서버 목록에 표시
      </label>
    </div>}
    {!loading && settings && 'map_name' in settings && <div className="form-grid">
      <label>시작 맵
        <input value={settings.map_name} maxLength={64}
          onChange={e => setSettings({...settings, map_name: e.target.value})}/>
      </label>
      <label>게임모드
        <input value={settings.gamemode_name} maxLength={32}
          onChange={e => setSettings({...settings, gamemode_name: e.target.value})}/>
        <small>설치된 게임모드 이름을 입력하세요.</small>
      </label>
    </div>}
    {error && <p role="alert" className="error">{error}</p>}
    {saved && <p role="status" className="notice">설정을 저장했습니다. 게임 파드가 재시작 중입니다.</p>}
    {settings && <div className="actions"><button onClick={() => void save()} disabled={saving}>
      {saving ? '저장 중…' : '설정 저장'}
    </button></div>}
    {!loading && server.game === 'garrysmod' && <section className="panel" style={{marginTop: '1.5rem'}}>
      <div className="section-title">
        <div><span className="eyebrow">STEAM WORKSHOP</span><h3>Workshop 컬렉션</h3></div>
      </div>
      <p className="muted notice">변경 후 서버를 재시작해야 적용됩니다.</p>
      <div className="form-grid">
        <label>컬렉션 ID
          <input
            value={workshopId}
            maxLength={20}
            placeholder="예: 2982223457"
            onChange={e => setWorkshopId(e.target.value)}
          />
          <small>Steam Workshop 컬렉션 URL의 숫자 ID를 입력하세요. 비우면 Workshop 연동이 해제됩니다.</small>
        </label>
      </div>
      {workshopError && <p role="alert" className="error">{workshopError}</p>}
      {workshopSaved && <p role="status" className="notice">Workshop 설정을 저장했습니다. 서버를 재시작하면 적용됩니다.</p>}
      <div className="actions">
        <button onClick={() => void saveWorkshop()} disabled={workshopSaving}>
          {workshopSaving ? '저장 중…' : 'Workshop 저장'}
        </button>
      </div>
    </section>}
  </section>;
}
