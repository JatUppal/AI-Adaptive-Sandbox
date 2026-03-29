import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSandbox } from '../contexts/SandboxContext';
import NoSandbox from '../components/NoSandbox';

const GRAFANA_URL = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3000';

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

  const { data: servicesHealth } = useQuery({
    queryKey: ['services-health', sid],
    queryFn: () => api.sandboxServicesHealth(sid!),
    enabled: !!sid,
    refetchInterval: 10000,
  });

  if (!activeSandbox) {
    return <NoSandbox title="No sandbox selected" description="Create a sandbox to see real-time metrics from your service mesh." />;
  }

  const grafanaBase = `${GRAFANA_URL}/d-solo/prometheon-chaos/chaos-engineering`;
  const sandboxFilter = `&var-sandbox=${activeSandbox.sandbox_id}`;
  const grafanaParams = `orgId=1&from=now-30m&to=now&theme=dark&refresh=5s${sandboxFilter}`;

  const panels = {
    requestRate: `${grafanaBase}?${grafanaParams}&panelId=1`,
    errorRate: `${grafanaBase}?${grafanaParams}&panelId=2`,
    p95Latency: `${grafanaBase}?${grafanaParams}&panelId=3`,
    statusBreakdown: `${grafanaBase}?${grafanaParams}&panelId=4`,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white tracking-tight" style={{ fontFamily: "'Orbitron', sans-serif" }}>Dashboard</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Real-time monitoring for <span className="text-sky-400">{activeSandbox.name}</span>
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Requests/min" value={reqMetrics?.value ?? 0} format="number" label={reqMetrics?.label} />
        <MetricCard title="Error Rate" value={errMetrics?.value ?? 0} format="percent" label={errMetrics?.label} color={errMetrics && errMetrics.value > 5 ? 'red' : undefined} />
        <MetricCard title="P95 Latency" value={p95Metrics?.value ?? 0} format="ms" label={p95Metrics?.label} />
        <MetricCard title="Uptime" value={99.8} format="percent" label="Placeholder" color="amber" />
      </div>

      {/* Grafana panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GrafanaPanel title="Request Rate" src={panels.requestRate} />
        <GrafanaPanel title="Error Rate" src={panels.errorRate} />
        <GrafanaPanel title="P95 Latency" src={panels.p95Latency} />
        <GrafanaPanel title="Request Count by Status" src={panels.statusBreakdown} />
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
                 <span className={`w-2.5 h-2.5 rounded-full ${svc.status === 'Healthy' ? 'bg-green-400 animate-pulse' : 'bg-red-400 animate-pulse'}`} />
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

      {/* Direct Grafana link */}
      <div className="text-center">
        <a
          href={`${GRAFANA_URL}/d/prometheon-chaos/prometheon-chaos-engineering?orgId=1&from=now-30m&to=now`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-500 hover:text-sky-400 text-xs transition-colors inline-flex items-center gap-1"
        >
          Open full Grafana dashboard
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function GrafanaPanel({ title, src }: { title: string; src: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <h3 className="text-white font-semibold text-sm">{title}</h3>
      </div>
      <iframe
        src={src}
        width="100%"
        height="250"
        frameBorder="0"
        className="border-0"
        style={{ background: 'transparent' }}
      />
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
