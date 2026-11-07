import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { Template } from '../api/client';

type PublicTemplate = Template & { owner_name: string; owner_id: string };

const GAME_LABEL: Record<string, string> = {
  'minecraft-java': 'Minecraft Java',
  'valheim': 'Valheim',
  'garrysmod': "Garry's Mod",
  'cs2': 'Counter-Strike 2',
  'rust': 'Rust',
};

export function Templates({ onDeployed }: { onDeployed?: (serverId: string) => void }) {
  const [tab, setTab] = useState<'my' | 'public'>('my');

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingMy, setLoadingMy] = useState(true);
  const [myError, setMyError] = useState('');

  const [publicTemplates, setPublicTemplates] = useState<PublicTemplate[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [publicError, setPublicError] = useState('');

  const [deploying, setDeploying] = useState<string | null>(null);
  const [deployName, setDeployName] = useState('');
  const [deployCpu, setDeployCpu] = useState(1);
  const [deployMemory, setDeployMemory] = useState(2048);
  const [deployStorage, setDeployStorage] = useState(10);
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployError, setDeployError] = useState('');

  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [toggleBusy, setToggleBusy] = useState<string | null>(null);

  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [editDescValue, setEditDescValue] = useState('');
  const [editDescBusy, setEditDescBusy] = useState(false);

  const [notice, setNotice] = useState('');

  const loadMy = useCallback(() => {
    setLoadingMy(true);
    api.listTemplates()
      .then(ts => { setTemplates(ts); setMyError(''); })
      .catch(err => setMyError(err instanceof Error ? err.message : '불러오기 실패'))
      .finally(() => setLoadingMy(false));
  }, []);

  const loadPublic = useCallback(() => {
    setLoadingPublic(true);
    api.listPublicTemplates()
      .then(ts => { setPublicTemplates(ts); setPublicError(''); })
      .catch(err => setPublicError(err instanceof Error ? err.message : '불러오기 실패'))
      .finally(() => setLoadingPublic(false));
  }, []);

  useEffect(() => { loadMy(); }, [loadMy]);

  // Poll while any template is pending
  useEffect(() => {
    const hasPending = templates.some(t => t.status === 'pending');
    if (!hasPending) return;
    const id = setInterval(() => { loadMy(); }, 5000);
    return () => clearInterval(id);
  }, [templates, loadMy]);

  useEffect(() => {
    if (tab === 'public') loadPublic();
  }, [tab, loadPublic]);

  function startDeploy(t: Template | PublicTemplate) {
    setDeploying(t.id);
    setDeployName(t.name + '-server');
    setDeployCpu(t.cpu);
    setDeployMemory(t.memory_mb);
    setDeployStorage(t.storage_gb);
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
      const result = await api.deployTemplate(templateId, name, { cpu: deployCpu, memory_mb: deployMemory, storage_gb: deployStorage });
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
      setMyError(err instanceof Error ? err.message : '삭제 실패');
    } finally {
      setDeleteBusy(null);
    }
  }

  async function handleTogglePublic(t: Template) {
    setToggleBusy(t.id);
    try {
      await api.updateTemplate(t.id, { is_public: !t.is_public });
      setTemplates(ts => ts.map(x => x.id === t.id ? { ...x, is_public: !t.is_public } : x));
    } catch (err) {
      setMyError(err instanceof Error ? err.message : '변경 실패');
    } finally {
      setToggleBusy(null);
    }
  }

  function startEditDesc(t: Template) {
    setEditingDesc(t.id);
    setEditDescValue(t.description);
  }

  async function saveDesc(templateId: string) {
    setEditDescBusy(true);
    try {
      await api.updateTemplate(templateId, { description: editDescValue });
      setTemplates(ts => ts.map(x => x.id === templateId ? { ...x, description: editDescValue } : x));
      setEditingDesc(null);
    } catch (err) {
      setMyError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setEditDescBusy(false);
    }
  }

  const deployRow = (templateId: string, colSpan: number) => deploying === templateId ? (
    <tr key={templateId + '-deploy'}>
      <td colSpan={colSpan} style={{ padding: '0 12px 12px' }}>
        <form
          className="server-delete-form"
          style={{ marginTop: '8px' }}
          onSubmit={e => { e.preventDefault(); void submitDeploy(templateId); }}
        >
          <p>새 서버 이름과 리소스를 설정하세요.</p>
          <label>서버 이름
            <input
              value={deployName}
              onChange={e => setDeployName(e.target.value)}
              disabled={deployBusy}
              autoFocus
            />
          </label>
          <label>CPU ({deployCpu} 코어)
            <input type="range" min={0.5} max={4} step={0.5} value={deployCpu}
              onChange={e => setDeployCpu(Number(e.target.value))} disabled={deployBusy}/>
          </label>
          <label>메모리 ({deployMemory} MiB)
            <input type="range" min={1024} max={8192} step={512} value={deployMemory}
              onChange={e => setDeployMemory(Number(e.target.value))} disabled={deployBusy}/>
          </label>
          <label>스토리지 ({deployStorage} GiB)
            <input type="range" min={5} max={100} step={5} value={deployStorage}
              onChange={e => setDeployStorage(Number(e.target.value))} disabled={deployBusy}/>
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
  ) : null;

  return (
    <div>
      {notice && <p role="status" className="notice">{notice}</p>}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button
          className={tab === 'my' ? '' : 'secondary'}
          onClick={() => setTab('my')}
        >
          내 템플릿
        </button>
        <button
          className={tab === 'public' ? '' : 'secondary'}
          onClick={() => setTab('public')}
        >
          관리자 공유 템플릿
        </button>
      </div>

      {tab === 'my' && (
        <>
          {myError && <div role="alert" className="error">{myError}</div>}
          {loadingMy ? (
            <div className="panel loading" role="status">템플릿을 불러오는 중…</div>
          ) : templates.length === 0 ? (
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
                      <tr key={t.id} style={{ borderBottom: editingDesc === t.id || deploying === t.id ? 'none' : '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {t.name}
                            {t.status === 'pending' && <span style={{ fontSize: '11px', background: 'var(--accent, #3b82f6)', color: '#fff', borderRadius: '4px', padding: '1px 6px' }}>처리 중</span>}
                            {t.status === 'failed' && <span style={{ fontSize: '11px', background: 'var(--danger, #ef4444)', color: '#fff', borderRadius: '4px', padding: '1px 6px' }}>실패</span>}
                            {t.template_type === 'pvc_clone' && (
                              <span className="cf-key-badge registered" title="PVC 직접 복사 — 빠른 배포">PVC 복사</span>
                            )}
                          </div>
                          {t.description && editingDesc !== t.id && (
                            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.description}>
                              {t.description}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{GAME_LABEL[t.game] ?? t.game}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{t.cpu} core</td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{t.memory_mb} MiB</td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{t.storage_gb} GB</td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: '12px' }}>
                          {new Date(t.created_at).toLocaleString('ko-KR')}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button
                              className="secondary"
                              style={{ fontSize: '12px' }}
                              disabled={toggleBusy === t.id}
                              onClick={() => void handleTogglePublic(t)}
                              title={t.is_public ? '공개 중 — 클릭하면 비공개' : '비공개 — 클릭하면 공개'}
                            >
                              {toggleBusy === t.id ? '…' : t.is_public ? '공개' : '비공개'}
                            </button>
                            <button
                              className="secondary"
                              style={{ fontSize: '12px' }}
                              disabled={editingDesc === t.id}
                              onClick={() => startEditDesc(t)}
                            >
                              설명 편집
                            </button>
                            <button
                              className="secondary"
                              disabled={deploying === t.id || deleteBusy === t.id || t.status !== 'ready'}
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
                      {editingDesc === t.id && (
                        <tr key={t.id + '-desc'} style={{ borderBottom: deploying === t.id ? 'none' : '1px solid var(--border)' }}>
                          <td colSpan={7} style={{ padding: '0 12px 12px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '4px' }}>
                              <textarea
                                value={editDescValue}
                                onChange={e => setEditDescValue(e.target.value)}
                                disabled={editDescBusy}
                                rows={2}
                                placeholder="템플릿 설명 (선택 사항)"
                                style={{ flex: 1 }}
                              />
                              <button
                                style={{ fontSize: '12px' }}
                                disabled={editDescBusy}
                                onClick={() => void saveDesc(t.id)}
                              >
                                {editDescBusy ? '저장 중…' : '저장'}
                              </button>
                              <button
                                className="secondary"
                                style={{ fontSize: '12px' }}
                                disabled={editDescBusy}
                                onClick={() => setEditingDesc(null)}
                              >
                                취소
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {deployRow(t.id, 7)}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'public' && (
        <>
          {publicError && <div role="alert" className="error">{publicError}</div>}
          {loadingPublic ? (
            <div className="panel loading" role="status">템플릿을 불러오는 중…</div>
          ) : publicTemplates.length === 0 ? (
            <div className="panel">
              <p className="muted">공개된 템플릿이 없습니다.</p>
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
                    <th style={{ textAlign: 'left', padding: '8px 12px' }}>작성자</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px' }}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {publicTemplates.map(t => (
                    <>
                      <tr key={t.id} style={{ borderBottom: deploying === t.id ? 'none' : '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {t.name}
                            {t.template_type === 'pvc_clone' && (
                              <span className="cf-key-badge registered" title="PVC 직접 복사 — 빠른 배포">PVC 복사</span>
                            )}
                          </div>
                          {t.description && (
                            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.description}>
                              {t.description}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{GAME_LABEL[t.game] ?? t.game}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{t.cpu} core</td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{t.memory_mb} MiB</td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{t.storage_gb} GB</td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: '12px' }}>{t.owner_name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button
                            className="secondary"
                            disabled={deploying === t.id}
                            onClick={() => startDeploy(t)}
                          >
                            배포
                          </button>
                        </td>
                      </tr>
                      {deployRow(t.id, 7)}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
