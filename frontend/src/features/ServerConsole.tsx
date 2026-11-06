import { useState, useRef, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';

type Line = { type: 'cmd' | 'rcon' | 'err'; text: string };

type ServerConsoleProps = {
  serverId: string;
  active: boolean;
  rconEnabled: boolean;
  consolePlaceholder: string;
};

export function ServerConsole({ serverId, active, rconEnabled, consolePlaceholder }: ServerConsoleProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supported = rconEnabled;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  useEffect(() => {
    setLines([]);
    setInput('');
  }, [serverId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const cmd = input.trim();
    if (!cmd || !supported || !active) return;
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
      <div><h2>RCON 콘솔</h2></div>
      {active && supported && <span className="tag">LIVE</span>}
    </div>
    <div className="console-output">
      {lines.length === 0
        ? <div className="console-line console-log">{supported ? '명령어를 입력하면 결과가 여기에 표시됩니다.' : 'RCON 연결이 설정되지 않았습니다.'}</div>
        : lines.map((line, i) => <div key={i} className={`console-line console-${line.type}`}>{line.text}</div>)}
      <div ref={bottomRef}/>
    </div>
    {!supported
      ? <p className="muted">이 게임 서버의 RCON 명령 전송은 현재 지원하지 않습니다.</p>
      : active
      ? <form onSubmit={send} className="console-form">
          <input value={input} onChange={e => setInput(e.target.value)}
            placeholder={consolePlaceholder}
            disabled={busy} autoComplete="off" spellCheck={false}/>
          <button type="submit" disabled={busy || !input.trim()}>{busy ? '…' : '전송'}</button>
        </form>
      : <p className="muted">서버가 실행 중일 때 명령어를 입력할 수 있습니다.</p>}
  </section>;
}
