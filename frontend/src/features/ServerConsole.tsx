import { useState, useRef, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import { wsApiUrl } from '../api/config';
import type { Server } from '../domain/server';

type Line = { type: 'cmd' | 'rcon' | 'log' | 'err'; text: string };

type ServerConsoleProps = {
  serverId: string;
  active: boolean;
  game: Server['game'];
};

export function ServerConsole({ serverId, active, game }: ServerConsoleProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLogsRef = useRef<string[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let pollId: number | null = null;

    function startPolling() {
      async function poll() {
        if (cancelled) return;
        try {
          const result = await api.logs(serverId, 300);
          if (cancelled) return;
          const fresh = result.lines;
          const prev = prevLogsRef.current;
          if (prev.length === 0) {
            prevLogsRef.current = fresh;
            setLines(fresh.map(text => ({ type: 'log' as const, text })));
            setLoaded(true);
            return;
          }
          if (!fresh.length || fresh[fresh.length - 1] === prev[prev.length - 1]) return;
          const lastIdx = prev.length ? fresh.lastIndexOf(prev[prev.length - 1]) : -1;
          const added = lastIdx >= 0 ? fresh.slice(lastIdx + 1) : fresh.slice(Math.max(0, fresh.length - 50));
          if (added.length > 0) {
            prevLogsRef.current = fresh;
            setLines(p => [...p, ...added.map(text => ({ type: 'log' as const, text }))]);
          }
        } catch { /* silent */ }
      }
      poll();
      pollId = window.setInterval(poll, 3000);
    }

    try {
      const token = localStorage.getItem('kubehost-token') ?? '';
      const url = wsApiUrl(`/api/v1/servers/${encodeURIComponent(serverId)}/logs/stream`) +
        (token ? `?token=${encodeURIComponent(token)}` : '');
      ws = new WebSocket(url);

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const msg: { type: string; lines?: string[] } = JSON.parse(event.data);
          if (msg.type === 'init' && msg.lines) {
            prevLogsRef.current = msg.lines;
            setLines(msg.lines.map(text => ({ type: 'log' as const, text })));
            setLoaded(true);
          } else if (msg.type === 'append' && msg.lines?.length) {
            prevLogsRef.current = [...prevLogsRef.current, ...msg.lines];
            setLines(p => [...p, ...msg.lines!.map(text => ({ type: 'log' as const, text }))]);
          }
        } catch { /* ignore malformed frames */ }
      };

      ws.onerror = () => {
        ws = null;
        if (!cancelled) startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      cancelled = true;
      ws?.close();
      if (pollId !== null) clearInterval(pollId);
    };
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
      <div><span className="eyebrow">{game === 'minecraft-java' ? 'RCON + LOGS' : 'POD LOGS'}</span><h2>{game === 'minecraft-java' ? '서버 콘솔' : '파드 로그'}</h2></div>
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
    {game !== 'minecraft-java'
      ? <p className="muted">게임 파드의 출력 로그입니다. 이 게임의 RCON 명령 전송은 아직 지원하지 않습니다.</p>
      : active
      ? <form onSubmit={send} className="console-form">
          <input value={input} onChange={e => setInput(e.target.value)}
            placeholder="/list, /op 플레이어명, /gamemode creative @a …"
            disabled={busy} autoComplete="off" spellCheck={false}/>
          <button type="submit" disabled={busy || !input.trim()}>{busy ? '…' : '전송'}</button>
        </form>
      : <p className="muted">서버가 실행 중일 때 명령어를 입력할 수 있습니다.</p>}
  </section>;
}
