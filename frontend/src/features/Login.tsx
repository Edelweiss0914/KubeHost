import { useState, useEffect, useRef, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';

type Props = {
  onLogin: (token: string, username: string) => void;
  onClose?: () => void;
};
type Tab = 'login' | 'register';

export function Login({ onLogin, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (onClose) {
      dialogRef.current?.showModal();
    }
  }, [onClose]);

  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose?.();
  }

  function handleCancel(e: React.SyntheticEvent<HTMLDialogElement>) {
    e.preventDefault();
    onClose?.();
  }

  function switchTab(t: Tab) {
    setTab(t); setError(''); setNotice('');
    setUsername(''); setPassword(''); setConfirm(''); setInviteCode('');
  }

  async function submitLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { token } = await api.login(username, password);
      onLogin(token, username);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 실패');
    } finally { setBusy(false); }
  }

  async function submitRegister(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('비밀번호가 일치하지 않습니다.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await api.register(username, password, inviteCode || undefined);
      // auto-login after registration
      const { token } = await api.login(username, password);
      onLogin(token, username);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError('신규 가입이 제한되어 있습니다. 관리자에게 문의하세요.');
      } else {
        setError(err instanceof Error ? err.message : '가입 실패');
      }
    } finally { setBusy(false); }
  }

  const cardContent = (
    <div className="login-card">
      {onClose && (
        <button
          type="button"
          className="login-close-btn"
          onClick={onClose}
          aria-label="닫기"
        >
          ✕
        </button>
      )}
      <div className="login-brand">
        <img src="/kubehost-icon.png" alt="" width={40} height={40} style={{borderRadius:'8px'}}/>
        <span className="login-title">KubeHost</span>
      </div>
      <p className="login-sub">게임 서버 운영 플랫폼</p>

      <div className="login-tabs">
        <button className={tab === 'login' ? 'active' : ''} onClick={() => switchTab('login')} type="button">로그인</button>
        <button className={tab === 'register' ? 'active' : ''} onClick={() => switchTab('register')} type="button">회원가입</button>
      </div>

      {tab === 'login' ? (
        <form onSubmit={submitLogin} className="login-form">
          <label>사용자명
            <input value={username} onChange={e => setUsername(e.target.value)}
              autoComplete="username" autoFocus disabled={busy}/>
          </label>
          <label>비밀번호
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete="current-password" disabled={busy}/>
          </label>
          {error && <div role="alert" className="error">{error}</div>}
          <button type="submit" disabled={busy || !username || !password}>
            {busy ? '로그인 중…' : '로그인'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitRegister} className="login-form">
          <label>사용자명 <small>(3~32자, 영문·숫자·_·-)</small>
            <input value={username} onChange={e => setUsername(e.target.value)}
              autoComplete="username" autoFocus disabled={busy} minLength={3} maxLength={32}/>
          </label>
          <label>비밀번호 <small>(8자 이상)</small>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete="new-password" disabled={busy} minLength={8}/>
          </label>
          <label>비밀번호 확인
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password" disabled={busy}/>
          </label>
          <label>초대 코드
            <input value={inviteCode} onChange={e => setInviteCode(e.target.value)}
              autoComplete="off" disabled={busy} placeholder="관리자에게 문의하세요"/>
          </label>
          {notice && <p role="status" className="notice">{notice}</p>}
          {error && <div role="alert" className="error">{error}</div>}
          <button type="submit" disabled={busy || !username || !password || !confirm}>
            {busy ? '가입 중…' : '가입하기'}
          </button>
        </form>
      )}
    </div>
  );

  if (onClose) {
    return (
      <dialog
        ref={dialogRef}
        className="login-dialog"
        onClick={handleDialogClick}
        onCancel={handleCancel}
      >
        {cardContent}
      </dialog>
    );
  }

  return (
    <div className="login-shell">
      {cardContent}
    </div>
  );
}
