import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { MetricPoint } from '../api/client';

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GiB';
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(0) + ' MiB';
  return (bytes / 1024).toFixed(0) + ' KiB';
}

type Props = {
  title: string;
  data: MetricPoint[];
  color?: string;
  unit?: 'cpu' | 'bytes' | 'pct';
  height?: number;
};

export function MetricsChart({ title, data, color = '#79aaff', unit = 'cpu', height = 140 }: Props) {
  if (!data.length) return (
    <div className="metrics-chart-empty">
      <span className="eyebrow">{title}</span>
      <p className="muted">데이터 없음</p>
    </div>
  );

  const formatted = data.map(p => ({
    t: p.t,
    label: formatTime(p.t),
    v: unit === 'bytes' ? p.v : unit === 'pct' ? Math.round(p.v * 10) / 10 : Math.round(p.v * 1000) / 1000,
  }));

  const tickFormatter = (v: number) => {
    if (unit === 'bytes') return formatBytes(v);
    if (unit === 'pct') return v.toFixed(0) + '%';
    return v.toFixed(3);
  };

  return (
    <div className="metrics-chart">
      <span className="eyebrow">{title}</span>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={formatted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} interval="preserveStartEnd" />
          <YAxis tickFormatter={tickFormatter} tick={{ fontSize: 10, fill: 'var(--muted)' }} width={56} />
          <Tooltip
            formatter={(v) => [tickFormatter(typeof v === 'number' ? v : Number(v)), title]}
            labelStyle={{ color: 'var(--text)', fontSize: 11 }}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
          />
          <Line type="monotone" dataKey="v" stroke={color} dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
