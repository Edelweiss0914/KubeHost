import { useState, useRef, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';

type Line = { type: 'cmd' | 'rcon' | 'log' | 'err'; text: string };

type ServerConsoleProps = {
  serverId: string;
  active: boolean;
};

export function ServerConsole({ serverId, active }: ServerConsoleProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLogsRef = useRef<string[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  useEffect(() => {
    let cancelled = false;

    async function pollLogs() {
      try {
        const result = await api.logs(serverId, 300);
        if (cancelled) return;
        const fresh = result.lines;
        const prev = prevLogsRef.current;

        if (!initialized.current) {
          initialized.current = true;
          prevLogsRef.current = fresh;
          setLines(fresh.map(text => ({ type: 'log' as const, text })));
          setLoaded(true);
          return;
        }

        if (fresh.length === 0) return;
        const lastPrev = prev[prev.length - 1];
        if (lastPrev && fresh[fresh.length - 1] === lastPrev) return;
        const lastIdx = lastPrev ? fresh.lastIndexOf(lastPrev) : -1;
        const added = lastIdx >= 0 ? fresh.slice(lastIdx + 1) : fresh.slice(Math.max(0, fresh.length - 50));
        if (added.length > 0) {
          prevLogsRef.current = fresh;
          setLines(p => [...p, ...added.map(text => ({ type: 'log' as const, text }))]);
        }
      } catch { /* silent */ }
    }

    pollLogs();
    const id = setInterval(pollLogs, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [serverId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;
    setLines(p => [...p, { type: 'cmd', text: `> ${cmd}` }]);
    setInput('');
    setBusy(true);
    try {
      const result = await api.console(serverId, cmd);
      if (result.output) setLines(p => [...p, { type: 'rcon', text: `← ${result.output}` }]);
    } catch (e) {
      setLines(p => [...p, { type: 'err', text: e instanceof Error ? e.message : '오류 발생' }]);
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel">
    <div className="section-title">
      <div><span className="eyebrow">RCON + LOGS</span><h2>서버 콘솔</h2></div>
      {active && <span className="tag">LIVE</span>}
    </div>
    <div className="console-output">
      {!loaded
        ? <div className="console-line console-log">로그를 불러오는 중…</div>
        : lines.length === 0
          ? <div className="console-line console-log">로그가 없습니다.</div>
          : lines.map((line, i) => <div key={i} className={`console-line console-${line.type}`}>{line.text}</div>)}
      <div ref={bottomRef}/>
    </div>
    {active
      ? <form onSubmit={send} className="console-form">
          <input value={input} onChange={e => setInput(e.target.value)}
            placeholder="/list, /op 플레이어명, /gamemode creative @a …"
            disabled={busy} autoComplete="off" spellCheck={false}/>
          <button type="submit" disabled={busy || !input.trim()}>{busy ? '…' : '전송'}</button>
        </form>
      : <p className="muted">서버가 실행 중일 때 명령어를 입력할 수 있습니다.</p>}
  </section>;
}
