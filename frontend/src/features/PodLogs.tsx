import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { wsApiUrl } from '../api/config';

export function PodLogs({ serverId, active }: { serverId: string; active: boolean }) {
  const [lines, setLines] = useState<string[]>([]);
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
    prevLogsRef.current = [];
    setLines([]);
    setLoaded(false);

    function startPolling() {
      if (pollId !== null || cancelled) return;
      async function poll() {
        if (cancelled) return;
        try {
          const result = await api.logs(serverId, 300);
          if (cancelled) return;
          const fresh = result.lines;
          const prev = prevLogsRef.current;
          if (prev.length === 0) {
            prevLogsRef.current = fresh;
            setLines(fresh);
            setLoaded(true);
            return;
          }
          if (!fresh.length || fresh[fresh.length - 1] === prev[prev.length - 1]) return;
          const lastIdx = fresh.lastIndexOf(prev[prev.length - 1]);
          const added = lastIdx >= 0 ? fresh.slice(lastIdx + 1) : fresh.slice(Math.max(0, fresh.length - 50));
          if (added.length > 0) {
            prevLogsRef.current = fresh;
            setLines(p => [...p, ...added]);
          }
        } catch { /* keep the current output until the next poll */ }
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
            setLines(msg.lines);
            setLoaded(true);
          } else if (msg.type === 'append' && msg.lines?.length) {
            prevLogsRef.current = [...prevLogsRef.current, ...msg.lines];
            setLines(p => [...p, ...msg.lines!]);
          }
        } catch { /* ignore malformed frames */ }
      };

      ws.onerror = startPolling;
      ws.onclose = startPolling;
    } catch {
      startPolling();
    }

    return () => {
      cancelled = true;
      ws?.close();
      if (pollId !== null) clearInterval(pollId);
    };
  }, [serverId]);

  return <section className="panel">
    <div className="section-title">
      <div><span className="eyebrow">POD LOGS</span><h2>파드 로그</h2></div>
      {active && <span className="tag">LIVE</span>}
    </div>
    <div className="console-output">
      {!loaded
        ? <div className="console-line console-log">로그를 불러오는 중…</div>
        : lines.length === 0
          ? <div className="console-line console-log">로그가 없습니다.</div>
          : lines.map((line, i) => <div key={i} className="console-line console-log">{line}</div>)}
      <div ref={bottomRef}/>
    </div>
  </section>;
}
