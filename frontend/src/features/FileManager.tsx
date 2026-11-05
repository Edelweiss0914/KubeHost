import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client';
import type { FileEntry } from '../api/client';
import type { Server } from '../domain/server';

const GMOD_ROOT = '/home/gmod/server/garrysmod';

const GMOD_QUICK_ACCESS = [
  { folder: 'addons', icon: '🧩', label: '애드온', desc: '커스텀 Lua·맵·게임모드' },
  { folder: 'cfg', icon: '🔧', label: '설정', desc: 'server.cfg 등 서버 설정' },
  { folder: 'data', icon: '💾', label: '저장 데이터', desc: '게임·애드온 저장 파일' },
  { folder: 'gamemodes', icon: '🎮', label: '게임모드', desc: '기본·커스텀 게임모드' },
  { folder: 'maps', icon: '🗺', label: '맵', desc: '기본·커스텀 맵' },
  { folder: 'lua', icon: '📜', label: 'Lua', desc: '서버 스크립트' },
] as const;

const TEXT_EXTENSIONS = new Set([
  'cfg', 'conf', 'ini', 'json', 'lua', 'md', 'properties', 'toml', 'txt', 'vdf', 'xml', 'yaml', 'yml',
]);

// ── Minecraft 서버 표준 폴더 구조 ────────────────────────────────────────────
const MC_QUICK_ACCESS = [
  { folder: 'plugins',       icon: '☕', label: '플러그인',   desc: 'Paper/Spigot 플러그인 (.jar)' },
  { folder: 'mods',          icon: '⚙', label: '모드',       desc: 'Forge/Fabric 모드 (.jar)' },
  { folder: 'config',        icon: '🔧', label: '설정',       desc: '플러그인·모드 설정 파일' },
  { folder: 'world',         icon: '🌍', label: '오버월드',   desc: '메인 월드 세이브 데이터' },
  { folder: 'world_nether',  icon: '🔥', label: '네더',       desc: '네더 차원 세이브 데이터' },
  { folder: 'world_the_end', icon: '🐉', label: '엔드',       desc: '엔드 차원 세이브 데이터' },
  { folder: 'backups',       icon: '💾', label: '백업',       desc: '월드 백업 (.tar.gz)' },
  { folder: 'logs',          icon: '📋', label: '로그',       desc: '서버 실행 로그' },
  { folder: 'resourcepacks', icon: '🎨', label: '리소스팩',   desc: '서버 리소스팩' },
  { folder: 'datapacks',     icon: '📦', label: '데이터팩',   desc: '월드 데이터팩' },
] as const;

// ── 유틸 ─────────────────────────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}

function fileIcon(entry: FileEntry): string {
  if (entry.type === 'dir') return '📁';
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'jar') return '☕';
  if (ext === 'json') return '{}';
  if (['properties', 'yml', 'yaml', 'toml', 'cfg', 'conf', 'txt'].includes(ext)) return '📄';
  if (ext === 'log') return '📋';
  if (['tar', 'gz', 'zip'].includes(ext)) return '🗜';
  return '📄';
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────
type Props = { serverId: string; game: Server['game'] };

export function FileManager({ serverId, game }: Props) {
  const rootPath = game === 'garrysmod' ? GMOD_ROOT : '/data';
  const quickAccess = game === 'garrysmod' ? GMOD_QUICK_ACCESS : MC_QUICK_ACCESS;
  const [path, setPath] = useState(rootPath);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [flash, setFlash] = useState('');
  const [flashError, setFlashError] = useState(false);
  const [newDirName, setNewDirName] = useState('');
  const [showMkdir, setShowMkdir] = useState(false);
  const [editing, setEditing] = useState<{ name: string; content: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isRoot = path === rootPath;

  const showMsg = useCallback((msg: string, error = false) => {
    setFlash(msg);
    setFlashError(error);
    setTimeout(() => setFlash(''), 4000);
  }, []);

  const loadDir = useCallback((p: string) => {
    setEditing(null);
    setLoading(true);
    setPath(p);
    api.listFiles(serverId, p)
      .then(setEntries)
      .catch(e => showMsg(e instanceof Error ? e.message : '불러오기 실패', true))
      .finally(() => setLoading(false));
  }, [serverId, showMsg]);

  useEffect(() => { loadDir(rootPath); }, [loadDir, rootPath]);

  function breadcrumbs() {
    const parts = path.split('/').filter(Boolean);
    const rootParts = rootPath.split('/').filter(Boolean);
    const crumbs: { label: string; path: string }[] = [{ label: game === 'garrysmod' ? 'garrysmod' : '/data', path: rootPath }];
    for (let i = rootParts.length; i < parts.length; i++) {
      crumbs.push({ label: parts[i], path: '/' + parts.slice(0, i + 1).join('/') });
    }
    return crumbs;
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setUploadPct(0);
    try {
      await api.uploadFile(serverId, path, file, setUploadPct);
      showMsg(`${file.name} 업로드됨`);
      loadDir(path);
    } catch (err) {
      showMsg(err instanceof Error ? err.message : '업로드 실패', true);
    } finally {
      setBusy(false);
      setUploadPct(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDownload(entry: FileEntry) {
    try {
      await api.downloadFile(serverId, path + '/' + entry.name);
    } catch (err) {
      showMsg(err instanceof Error ? err.message : '다운로드 실패', true);
    }
  }

  async function handleEdit(entry: FileEntry) {
    setBusy(true);
    try {
      const content = await api.readTextFile(serverId, path + '/' + entry.name);
      setEditing({ name: entry.name, content });
    } catch (err) {
      showMsg(err instanceof Error ? err.message : '파일 열기 실패', true);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!editing) return;
    setBusy(true);
    try {
      const file = new File([editing.content], editing.name, { type: 'text/plain' });
      await api.uploadFile(serverId, path, file);
      showMsg(`${editing.name} 저장됨`);
      loadDir(path);
    } catch (err) {
      showMsg(err instanceof Error ? err.message : '저장 실패', true);
    } finally {
      setBusy(false);
    }
  }

  function canEdit(entry: FileEntry) {
    return entry.type === 'file' && entry.size <= 1024 * 1024 &&
      TEXT_EXTENSIONS.has(entry.name.split('.').pop()?.toLowerCase() ?? '');
  }

  async function handleDelete(entry: FileEntry) {
    const label = entry.type === 'dir'
      ? `"${entry.name}" 폴더(와 하위 파일 전체)`
      : `"${entry.name}"`;
    if (!confirm(`${label}를 삭제하시겠습니까?`)) return;
    setBusy(true);
    try {
      await api.deletePath(serverId, path + '/' + entry.name);
      setEntries(prev => prev.filter(e => e.name !== entry.name));
      showMsg(`${entry.name} 삭제됨`);
    } catch (err) {
      showMsg(err instanceof Error ? err.message : '삭제 실패', true);
    } finally {
      setBusy(false);
    }
  }

  async function handleExtract(entry: FileEntry) {
    if (!confirm(`"${entry.name}"을 현재 폴더에 압축 해제하시겠습니까?`)) return;
    setBusy(true);
    try {
      await api.extractZip(serverId, path + '/' + entry.name);
      showMsg(`${entry.name} 압축 해제 완료`);
      await loadDir(path);
    } catch (err) {
      showMsg(err instanceof Error ? err.message : '압축 해제 실패', true);
    } finally {
      setBusy(false);
    }
  }

  async function handleMkdir() {
    const name = newDirName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.mkdirFs(serverId, path + '/' + name);
      setNewDirName('');
      setShowMkdir(false);
      showMsg(`${name} 폴더 생성됨`);
      loadDir(path);
    } catch (err) {
      showMsg(err instanceof Error ? err.message : '폴더 생성 실패', true);
    } finally {
      setBusy(false);
    }
  }

  const crumbs = breadcrumbs();
  // 실제 디스크에 존재하는 폴더 이름 set
  const existingDirs = new Set(entries.filter(e => e.type === 'dir').map(e => e.name));
  // 빠른 접근에 없는 나머지 항목만 파일 목록에 표시
  const quickFolderNames = new Set<string>(quickAccess.map(q => q.folder));
  const otherEntries = isRoot
    ? entries.filter(e => !(e.type === 'dir' && quickFolderNames.has(e.name)))
    : entries;

  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">FILES</span>
          <h2>파일 매니저</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className="secondary small"
            disabled={busy}
            onClick={() => { setShowMkdir(s => !s); setNewDirName(''); }}
          >
            + 폴더
          </button>
          <label
            className={`button secondary small${busy ? ' disabled' : ''}`}
            style={{ cursor: busy ? 'not-allowed' : 'pointer', userSelect: 'none' }}
          >
            ↑ 업로드
            <input ref={fileRef} type="file" style={{ display: 'none' }}
              disabled={busy} onChange={handleUpload} />
          </label>
        </div>
      </div>

      {/* 브레드크럼 */}
      <nav className="file-breadcrumb" aria-label="현재 경로">
        {crumbs.map((c, i) => (
          <span key={c.path}>
            {i > 0 && <span className="file-breadcrumb-sep"> / </span>}
            {i < crumbs.length - 1
              ? <button className="text-button" onClick={() => loadDir(c.path)}>{c.label}</button>
              : <span className="file-breadcrumb-current">{c.label}</span>}
          </span>
        ))}
        <button className="secondary small" style={{ marginLeft: '12px' }}
          disabled={loading || busy} onClick={() => loadDir(path)} title="새로고침">↺</button>
      </nav>

      {/* 폴더 생성 인라인 폼 */}
      {showMkdir && (
        <div className="manage-add-row" style={{ marginTop: '8px' }}>
          <input value={newDirName} onChange={e => setNewDirName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleMkdir(); if (e.key === 'Escape') setShowMkdir(false); }}
            placeholder="폴더 이름" disabled={busy} autoFocus />
          <button onClick={() => void handleMkdir()} disabled={busy || !newDirName.trim()}>생성</button>
          <button className="secondary" onClick={() => { setShowMkdir(false); setNewDirName(''); }}>취소</button>
        </div>
      )}

      {uploadPct !== null && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
            <span className="muted">{uploadPct < 100 ? '업로드 중…' : '서버에 저장 중…'}</span>
            <span className="muted">{uploadPct < 100 ? `${uploadPct}%` : '처리 중'}</span>
          </div>
          <div className="fm-progress-track">
            <div className="fm-progress-bar" style={{ width: `${uploadPct}%`, opacity: uploadPct === 100 ? 0.6 : 1 }} />
          </div>
        </div>
      )}

      {flash && (
        <div className={flashError ? 'notice error' : 'notice'} style={{ marginTop: '8px' }}>
          {flash}
        </div>
      )}

      {loading ? (
        <p className="muted" style={{ marginTop: '16px' }}>불러오는 중…</p>
      ) : (
        <>
          {/* ── 루트일 때만: Minecraft 서버 폴더 구조 빠른 접근 ── */}
          {isRoot && (
            <div style={{ marginTop: '16px' }}>
              <p className="eyebrow" style={{ marginBottom: '10px', letterSpacing: '.08em' }}>
                서버 폴더 구조
              </p>
              <div className="fm-quick-grid">
                {quickAccess.map(({ folder, icon, label, desc }) => {
                  const exists = existingDirs.has(folder);
                  return (
                    <button
                      key={folder}
                      className={`fm-quick-card${exists ? ' fm-quick-card--exists' : ' fm-quick-card--missing'}`}
                      onClick={() => loadDir(rootPath + '/' + folder)}
                      title={exists ? folder : `${folder} (아직 없음 — 클릭하면 빈 폴더로 열림)`}
                    >
                      <span className="fm-quick-icon">{icon}</span>
                      <span className="fm-quick-label">{label}</span>
                      <span className="fm-quick-desc">{desc}</span>
                      {!exists && <span className="fm-quick-badge">없음</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 파일 목록 ── */}
          {(isRoot ? otherEntries.length > 0 : entries.length > 0) ? (
            <div className="file-list" style={{ marginTop: isRoot ? '20px' : '8px' }}>
              {isRoot && (
                <div className="file-list-section-label">기타 파일</div>
              )}
              <div className="file-list-header">
                <span>이름</span>
                <span>크기</span>
                <span>수정일</span>
                <span></span>
              </div>
              {(isRoot ? otherEntries : entries).map(entry => (
                <div key={entry.name} className="file-row">
                  <span className="file-name">
                    {entry.type === 'dir' ? (
                      <button className="text-button file-entry-btn"
                        onClick={() => loadDir(path + '/' + entry.name)}>
                        {fileIcon(entry)} {entry.name}
                      </button>
                    ) : (
                      <span className="file-entry-label">{fileIcon(entry)} {entry.name}</span>
                    )}
                  </span>
                  <span className="file-size muted">
                    {entry.type === 'file' ? formatSize(entry.size) : '—'}
                  </span>
                  <span className="file-mtime muted">{formatDate(entry.modified)}</span>
                  <span className="file-actions">
                    {canEdit(entry) && (
                      <button className="secondary small" disabled={busy} title="텍스트 편집"
                        onClick={() => void handleEdit(entry)}>편집</button>
                    )}
                    {entry.type === 'file' && entry.name.endsWith('.zip') && (
                      <button className="secondary small" disabled={busy} title="압축 해제"
                        onClick={() => void handleExtract(entry)}>압축 해제</button>
                    )}
                    {entry.type === 'file' && (
                      <button className="secondary small" disabled={busy} title="다운로드"
                        onClick={() => void handleDownload(entry)}>↓</button>
                    )}
                    <button className="secondary small" disabled={busy} title="삭제"
                      style={{ color: 'var(--danger, #f87171)' }}
                      onClick={() => void handleDelete(entry)}>✕</button>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            !isRoot && <p className="muted" style={{ marginTop: '16px' }}>빈 폴더입니다.</p>
          )}
          {editing && (
            <div className="fm-editor" style={{ marginTop: '20px' }}>
              <div className="section-title"><h3>{editing.name} 편집</h3></div>
              <textarea value={editing.content}
                onChange={e => setEditing({ ...editing, content: e.target.value })}
                spellCheck={false} rows={18} style={{ width: '100%', fontFamily: 'monospace' }}/>
              <div className="actions">
                <button onClick={() => void handleSave()} disabled={busy}>저장</button>
                <button className="secondary" onClick={() => setEditing(null)} disabled={busy}>취소</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
