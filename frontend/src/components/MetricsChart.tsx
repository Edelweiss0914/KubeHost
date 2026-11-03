import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
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

  const values = formatted.map(p => p.v);
  const currentVal = values[values.length - 1] ?? 0;
  const maxVal = Math.max(...values);
  const avgVal = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  // Gradient id safe for SVG (strip # from color hex)
  const gradientId = `gradient-${color.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <div className="metrics-chart">
      <div className="metrics-stats-row">
        <span className="eyebrow">{title}</span>
        <div className="metrics-stats-values">
          <span className="metrics-stat-item">
            <span className="metrics-stat-label">현재</span>
            <span className="metrics-stat-value" style={{ color }}>{tickFormatter(currentVal)}</span>
          </span>
          <span className="metrics-stat-item">
            <span className="metrics-stat-label">최대</span>
            <span className="metrics-stat-value">{tickFormatter(maxVal)}</span>
          </span>
          <span className="metrics-stat-item">
            <span className="metrics-stat-label">평균</span>
            <span className="metrics-stat-value">{tickFormatter(avgVal)}</span>
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={formatted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.30} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} interval="preserveStartEnd" />
          <YAxis tickFormatter={tickFormatter} tick={{ fontSize: 10, fill: 'var(--muted)' }} width={56} />
          <Tooltip
            formatter={(v) => [tickFormatter(typeof v === 'number' ? v : Number(v)), title]}
            labelStyle={{ color: 'var(--text)', fontSize: 11 }}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
