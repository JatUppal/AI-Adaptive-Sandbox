import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSandbox } from '../contexts/SandboxContext';
import NoSandbox from '../components/NoSandbox';
import { Line } from 'recharts';
import { LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function Dashboard() {
  const { activeSandbox } = useSandbox();
  const sid = activeSandbox?.sandbox_id;

  const { data: reqMetrics } = useQuery({
    queryKey: ['prom-requests', sid],
    queryFn: () => api.getRequestMetrics(sid!),
    enabled: !!sid,
    refetchInterval: 10000,
  });

  const { data: errMetrics } = useQuery({
    queryKey: ['prom-errors', sid],
    queryFn: () => api.getErrorMetrics(sid!),
    enabled: !!sid,
    refetchInterval: 10000,
  });

  const { data: p95Metrics } = useQuery({
    queryKey: ['prom-p95', sid],
    queryFn: () => api.getP95Latency(sid!),
    enabled: !!sid,
    refetchInterval: 10000,
  });

  const { data: reqRange } = useQuery({
    queryKey: ['prom-requests-range', sid],
    queryFn: () => api.getRequestMetricsRange(sid!),
    enabled: !!sid,
    refetchInterval: 15000,
  });

  const { data: p95Range } = useQuery({
    queryKey: ['prom-p95-range', sid],
    queryFn: () => api.getP95LatencyRange(sid!),
    enabled: !!sid,
    refetchInterval: 15000,
  });

  const { data: servicesHealth } = useQuery({
    queryKey: ['services-health', sid],
    queryFn: () => api.sandboxServicesHealth(sid!),
    enabled: !!sid,
    refetchInterval: 10000,
  });

  if (!activeSandbox) {
    return <NoSandbox title="No sandbox selected" description="Create a sandbox to see real-time metrics from your service mesh." />;
  }

  const chartData = (reqRange || []).map((p: any, i: number) => ({
    time: `${i}m`,
    requests: p.value,
  }));

  const latencyData = (p95Range || []).map((p: any, i: number) => ({
    time: `${i}m`,
    latency: p.value,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Real-time monitoring for <span className="text-emerald-400">{activeSandbox.name}</span>
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Requests/min" value={reqMetrics?.value ?? 0} format="number" label={reqMetrics?.label} />
        <MetricCard title="Error Rate" value={errMetrics?.value ?? 0} format="percent" label={errMetrics?.label} color={errMetrics && errMetrics.value > 5 ? 'red' : undefined} />
        <MetricCard title="P95 Latency" value={p95Metrics?.value ?? 0} format="ms" label={p95Metrics?.label} />
        <MetricCard title="Uptime" value={99.8} format="percent" label="Placeholder" color="amber" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Request Volume</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="time" stroke="#666" fontSize={12} />
              <YAxis stroke="#666" fontSize={12} />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }} />
              <Line type="monotone" dataKey="requests" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Latency Trend (p95)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={latencyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="time" stroke="#666" fontSize={12} />
              <YAxis stroke="#666" fontSize={12} />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }} />
              <Line type="monotone" dataKey="latency" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Active services */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4">Active Services</h3>
        {!servicesHealth ? (
          <p className="text-zinc-500 text-sm">Checking services...</p>
        ) : (
          <div className="space-y-2">
            {servicesHealth.map((svc: any) => (
              <div key={svc.name} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${svc.status === 'Healthy' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <span className="text-zinc-200 text-sm">{svc.name}</span>
                </div>
                <span className={`text-sm font-medium ${svc.status === 'Healthy' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {svc.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ title, value, format, label, color }: {
  title: string;
  value: number;
  format: 'number' | 'percent' | 'ms';
  label?: string;
  color?: string;
}) {
  const borderColor = color === 'red' ? 'border-red-500/40' : color === 'amber' ? 'border-amber-500/40' : 'border-zinc-800';

  let displayValue = '';
  if (format === 'number') displayValue = value.toFixed(1);
  else if (format === 'percent') displayValue = `${value.toFixed(2)}%`;
  else if (format === 'ms') displayValue = `${Math.round(value)}ms`;

  return (
    <div className={`bg-zinc-900 border ${borderColor} rounded-xl p-4`}>
      <div className="text-sm text-zinc-400">{title}</div>
      <div className="text-2xl font-bold text-white font-mono mt-1">{displayValue}</div>
      <div className={`text-xs mt-1 ${color === 'red' ? 'text-red-400' : 'text-zinc-500'}`}>
        {label || 'Last scrape'}
      </div>
    </div>
  );
}
