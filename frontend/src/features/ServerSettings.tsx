import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { defaultSettings, type ServerSettings } from '../domain/server';

type ServerSettingsProps = {
  serverId: string;
  onClose: () => void;
};

export function ServerSettingsPanel({ serverId, onClose }: ServerSettingsProps) {
  const [settings, setSettings] = useState<ServerSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings(serverId)
      .then(raw => {
        setSettings({
          difficulty: (raw.difficulty as ServerSettings['difficulty']) || 'easy',
          gamemode: (raw.gamemode as ServerSettings['gamemode']) || 'survival',
          max_players: Number(raw.max_players) || 20,
          motd: raw.motd || 'A Minecraft Server',
          pvp: raw.pvp?.toUpperCase() !== 'FALSE',
          online_mode: raw.online_mode?.toUpperCase() !== 'FALSE',
          spawn_protection: Number(raw.spawn_protection) || 16,
          view_distance: Number(raw.view_distance) || 10,
          ops: raw.ops || '',
          force_gamemode: raw.force_gamemode?.toUpperCase() === 'TRUE',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [serverId]);

  function set<K extends keyof ServerSettings>(key: K, value: ServerSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await api.updateSettings(serverId, settings);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <div className="settings-dialog-inner">
        <div className="section-title">
          <div><span className="eyebrow">SERVER CONFIG</span><h2>서버 설정</h2></div>
          <button className="secondary" onClick={onClose}>닫기</button>
        </div>
        <p className="muted notice">설정 저장 시 파드가 재시작됩니다. 접속 중인 플레이어는 연결이 끊깁니다.</p>
        {loading ? <p className="muted">설정 불러오는 중…</p> : <>
          <div className="form-grid">
            <label>난이도
              <select value={settings.difficulty} onChange={e => set('difficulty', e.target.value as ServerSettings['difficulty'])}>
                <option value="peaceful">평화 (Peaceful)</option>
                <option value="easy">쉬움 (Easy)</option>
                <option value="normal">보통 (Normal)</option>
                <option value="hard">어려움 (Hard)</option>
              </select>
            </label>
            <label>게임모드
              <select value={settings.gamemode} onChange={e => set('gamemode', e.target.value as ServerSettings['gamemode'])}>
                <option value="survival">생존 (Survival)</option>
                <option value="creative">창작 (Creative)</option>
                <option value="adventure">모험 (Adventure)</option>
                <option value="spectator">관전 (Spectator)</option>
              </select>
            </label>
            <label>최대 플레이어 수
              <input type="number" value={settings.max_players} min={1} max={100}
                onChange={e => set('max_players', Number(e.target.value))}/>
            </label>
            <label>시야 거리 (청크)
              <input type="number" value={settings.view_distance} min={3} max={32}
                onChange={e => set('view_distance', Number(e.target.value))}/>
            </label>
            <label>스폰 보호 반경
              <input type="number" value={settings.spawn_protection} min={0} max={100}
                onChange={e => set('spawn_protection', Number(e.target.value))}/>
              <small>0 = 비활성화</small>
            </label>
            <label className="full">서버 MOTD
              <input value={settings.motd} maxLength={59}
                onChange={e => set('motd', e.target.value)}/>
            </label>
            <label className="full">OP 목록 (공백 구분)
              <input value={settings.ops} placeholder="플레이어1 플레이어2"
                onChange={e => set('ops', e.target.value)}/>
              <small>서버 시작 시 op 권한이 자동 부여됩니다.</small>
            </label>
            <label className="checkbox"><input type="checkbox" checked={settings.pvp}
              onChange={e => set('pvp', e.target.checked)}/> PVP 허용</label>
            <label className="checkbox"><input type="checkbox" checked={settings.online_mode}
              onChange={e => set('online_mode', e.target.checked)}/> 정품 인증 (Online Mode)</label>
            <label className="checkbox"><input type="checkbox" checked={settings.force_gamemode}
              onChange={e => set('force_gamemode', e.target.checked)}/> 접속 시 게임모드 강제 적용 (Force Gamemode)</label>
          </div>
          {error && <div role="alert" className="error">{error}</div>}
          {saved && <p role="status" className="notice">저장됐습니다. 파드가 재시작 중입니다.</p>}
          <div className="actions">
            <button onClick={save} disabled={saving}>{saving ? '저장 중…' : '설정 저장'}</button>
          </div>
        </>}
      </div>
    </div>
  );
}
