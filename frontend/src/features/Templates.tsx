import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { Template } from '../api/client';

export function Templates({ onDeployed }: { onDeployed?: (serverId: string) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Deploy state per template
  const [deploying, setDeploying] = useState<string | null>(null);
  const [deployName, setDeployName] = useState('');
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployError, setDeployError] = useState('');

  // Delete state
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);

  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.listTemplates()
      .then(ts => { setTemplates(ts); setError(''); })
      .catch(err => setError(err instanceof Error ? err.message : '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function startDeploy(t: Template) {
    setDeploying(t.id);
    setDeployName(t.name + '-server');
    setDeployError('');
  }

  function cancelDeploy() {
    setDeploying(null);
    setDeployName('');
    setDeployError('');
  }

  async function submitDeploy(templateId: string) {
    const name = deployName.trim();
    if (!name) return;
    setDeployBusy(true);
    setDeployError('');
    try {
      const result = await api.deployTemplate(templateId, name);
      setDeploying(null);
      setDeployName('');
      setNotice('서버를 생성했습니다.');
      if (onDeployed) onDeployed(result.id);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : '배포 실패');
    } finally {
      setDeployBusy(false);
    }
  }

  async function handleDelete(templateId: string) {
    setDeleteBusy(templateId);
    try {
      await api.deleteTemplate(templateId);
      setTemplates(ts => ts.filter(t => t.id !== templateId));
      setNotice('템플릿을 삭제했습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    } finally {
      setDeleteBusy(null);
    }
  }

  const GAME_LABEL: Record<string, string> = {
    'minecraft-java': 'Minecraft Java',
    'valheim': 'Valheim',
    'garrysmod': "Garry's Mod",
  };

  if (loading) return <div className="panel loading" role="status">템플릿을 불러오는 중…</div>;

  return (
    <div>
      {notice && <p role="status" className="notice">{notice}</p>}
      {error && <div role="alert" className="error">{error}</div>}

      {templates.length === 0 ? (
        <div className="panel">
          <p className="muted">저장된 템플릿이 없습니다. 서버 상세 화면에서 "템플릿으로 저장"을 눌러 보세요.</p>
        </div>
      ) : (
        <div className="panel">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', fontSize: '12px', color: 'var(--muted)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>이름</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>게임</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>CPU</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>메모리</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>스토리지</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>생성일</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <>
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{t.name}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{GAME_LABEL[t.game] ?? t.game}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{t.cpu} core</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{t.memory_mb} MiB</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{t.storage_gb} GB</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: '12px' }}>
                      {new Date(t.created_at).toLocaleString('ko-KR')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          className="secondary"
                          disabled={deploying === t.id || deleteBusy === t.id}
                          onClick={() => startDeploy(t)}
                        >
                          배포
                        </button>
                        <button
                          className="server-sidebar-danger"
                          disabled={deleteBusy === t.id || deploying === t.id}
                          onClick={() => void handleDelete(t.id)}
                        >
                          {deleteBusy === t.id ? '삭제 중…' : '삭제'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {deploying === t.id && (
                    <tr key={t.id + '-deploy'}>
                      <td colSpan={7} style={{ padding: '0 12px 12px' }}>
                        <form
                          className="server-delete-form"
                          style={{ marginTop: '8px' }}
                          onSubmit={e => { e.preventDefault(); void submitDeploy(t.id); }}
                        >
                          <p>새 서버 이름을 입력하세요.</p>
                          <label>서버 이름
                            <input
                              value={deployName}
                              onChange={e => setDeployName(e.target.value)}
                              placeholder={t.name + '-server'}
                              disabled={deployBusy}
                              autoFocus
                            />
                          </label>
                          {deployError && (
                            <p style={{ color: 'var(--danger, #f87171)', fontSize: '0.85em' }}>{deployError}</p>
                          )}
                          <div className="actions">
                            <button type="button" className="secondary" onClick={cancelDeploy} disabled={deployBusy}>취소</button>
                            <button disabled={deployBusy || !deployName.trim()}>
                              {deployBusy ? '생성 중…' : '서버 생성'}
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
