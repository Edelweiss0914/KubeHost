import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client';
import type { FileEntry } from '../api/client';

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
  if (['tar', 'gz', 'zip'].includes(ext)) return '🗜';
  if (['properties', 'yml', 'yaml', 'toml', 'cfg', 'conf', 'txt', 'json'].includes(ext)) return '📄';
  return '📄';
}

const LIBRARY_ROOT = '/library';

export function LibraryManager() {
  const [path, setPath] = useState(LIBRARY_ROOT);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [flash, setFlash] = useState('');
  const [flashError, setFlashError] = useState(false);
  const [newDirName, setNewDirName] = useState('');
  const [showMkdir, setShowMkdir] = useState(false);
  const [storage, setStorage] = useState<{ used_bytes: number; total_bytes: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showMsg = useCallback((msg: string, error = false) => {
    setFlash(msg);
    setFlashError(error);
    setTimeout(() => setFlash(''), 4000);
  }, []);

  const loadStorage = useCallback(() => {
    api.libraryStorage().then(setStorage).catch(() => {});
  }, []);

  const loadDir = useCallback((p: string) => {
    setLoading(true);
    setPath(p);
    api.libraryList(p)
      .then(setEntries)
      .catch(e => showMsg(e instanceof Error ? e.message : '불러오기 실패', true))
      .finally(() => setLoading(false));
  }, [showMsg]);

  useEffect(() => {
    loadDir(LIBRARY_ROOT);
    loadStorage();
  }, [loadDir, loadStorage]);

  function breadcrumbs() {
    const parts = path.split('/').filter(Boolean);
    const rootParts = LIBRARY_ROOT.split('/').filter(Boolean);
    const rootLabel = rootParts[rootParts.length - 1] ?? LIBRARY_ROOT;
    const crumbs: { label: string; path: string }[] = [{ label: rootLabel, path: LIBRARY_ROOT }];
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
      await api.libraryUpload(path, file, setUploadPct);
      showMsg(`${file.name} 업로드됨`);
      loadDir(path);
      loadStorage();
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
      await api.libraryDownload(path + '/' + entry.name);
    } catch (err) {
      showMsg(err instanceof Error ? err.message : '다운로드 실패', true);
    }
  }

  async function handleDelete(entry: FileEntry) {
    const label = entry.type === 'dir'
      ? `"${entry.name}" 폴더(와 하위 파일 전체)`
      : `"${entry.name}"`;
    if (!confirm(`${label}를 삭제하시겠습니까?`)) return;
    setBusy(true);
    try {
      await api.libraryDelete(path + '/' + entry.name);
      setEntries(prev => prev.filter(e => e.name !== entry.name));
      showMsg(`${entry.name} 삭제됨`);
      loadStorage();
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
      await api.libraryExtract(path + '/' + entry.name);
      showMsg(`${entry.name} 압축 해제 완료`);
      loadDir(path);
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
      await api.libraryMkdir(path + '/' + name);
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
  const isRoot = path === LIBRARY_ROOT;

  const usedGb = storage ? (storage.used_bytes / 1024 ** 3).toFixed(1) : '0.0';
  const totalGb = storage ? (storage.total_bytes / 1024 ** 3).toFixed(0) : '10';
  const pct = storage ? Math.min(100, Math.round(storage.used_bytes / storage.total_bytes * 100)) : 0;
  const barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';

  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">LIBRARY</span>
          <h2>내 라이브러리</h2>
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
              disabled={busy} onChange={e => void handleUpload(e)} />
          </label>
        </div>
      </div>

      {/* 스토리지 사용량 */}
      {storage && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
            <span className="muted">스토리지 사용량</span>
            <span className="muted">{usedGb} GiB / {totalGb} GiB 사용 중</span>
          </div>
          <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '3px', transition: 'width .3s' }} />
          </div>
        </div>
      )}

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
      ) : entries.length > 0 ? (
        <div className="file-list" style={{ marginTop: '8px' }}>
          <div className="file-list-header">
            <span>이름</span>
            <span>크기</span>
            <span>수정일</span>
            <span></span>
          </div>
          {entries.map(entry => (
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
        <p className="muted" style={{ marginTop: '16px' }}>
          {isRoot ? '라이브러리가 비어 있습니다. 파일을 업로드해 보세요.' : '빈 폴더입니다.'}
        </p>
      )}
    </section>
  );
}
