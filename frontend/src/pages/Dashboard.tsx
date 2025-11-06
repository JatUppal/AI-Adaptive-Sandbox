import { useQuery } from "@tanstack/react-query";
import { MetricCard } from "@/components/MetricCard";
import { Activity, AlertCircle, Clock, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";

type PromResult = {
  status: "success" | "error";
  data?: { resultType: string; result: Array<{ metric: Record<string,string>, value?: [number,string], values?: [number,string][] }> };
};

function toNumber(s?: string) {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseInstantSeries(resp?: PromResult, keyLabel: string) {
  // Returns [{name, value}] for a single stacked display; we’ll sum per service.
  if (!resp || resp.status !== "success" || !resp.data) return 0;
  let total = 0;
  for (const r of resp.data.result) {
    if (r.value) total += toNumber(r.value[1]);
  }
  return total;
}

function parseRangeSeries(resp?: PromResult, valueKey: string) {
  // For charts: produce [{time, <valueKey>: number}]
  if (!resp || resp.status !== "success" || !resp.data) return [];
  // Merge series by timestamp (sum services together)
  const bucket = new Map<number, number>();
  for (const r of resp.data.result) {
    for (const [ts, val] of (r.values ?? [])) {
      const t = Number(ts);
      const v = toNumber(val);
      bucket.set(t, (bucket.get(t) ?? 0) + v);
    }
  }
  // Turn into sorted recharts data
  return [...bucket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ time: new Date(t * 1000).toLocaleTimeString([], {minute: "2-digit"}), [valueKey]: v }));
}

export default function Dashboard() {
  const { data: reqs } = useQuery({
    queryKey: ['prom-requests'],
    queryFn: api.getRequestMetrics,
    refetchInterval: 5000,
  });

  const { data: errs } = useQuery({
    queryKey: ['prom-errors'],
    queryFn: api.getErrorMetrics,
    refetchInterval: 5000,
  });

  const { data: p95 } = useQuery({
    queryKey: ['prom-p95'],
    queryFn: api.getP95Latency,
    refetchInterval: 5000,
  });

  // Range for charts (history)
  const { data: reqsRange } = useQuery({
    queryKey: ['prom-requests-range'],
    queryFn: api.getRequestMetricsRange,   // NEW
    refetchInterval: 5000,
  });

  const { data: p95Range } = useQuery({
    queryKey: ['prom-p95-range'],
    queryFn: api.getP95LatencyRange,       // NEW
    refetchInterval: 5000,
  });

  const { data: health } = useQuery({
    queryKey: ['services-health'],
    queryFn: api.servicesHealth,
    refetchInterval: 5000,
  });

  const services = (health?.services ?? []) as Array<{name: string; healthy: boolean}>;

  // Top metric tiles (instant)
  const requestsPerMin = parseInstantSeries(reqs as any, "requests");
  const errorRate = parseInstantSeries(errs as any, "errors") * 100; // if your error metric is a rate, keep it raw; if it's ratio, *100 for %
  const p95ms = parseInstantSeries(p95 as any, "p95") * 1000; // seconds -> ms

  // charts (use range)
  const timeSeriesRequests = parseRangeSeries(reqsRange as any, "requests"); // CHANGED
  const timeSeriesLatency  = parseRangeSeries(p95Range  as any, "latency");  // CHANGED


  // Fallbacks for first paint
  const showReqs = timeSeriesRequests.length ? timeSeriesRequests : Array.from({ length: 20 }, (_, i) => ({ time: `${i}m`, requests: 0 }));
  const showLat  = timeSeriesLatency.length ? timeSeriesLatency : Array.from({ length: 20 }, (_, i) => ({ time: `${i}m`, latency: 0 }));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground mt-1">Real-time system monitoring and metrics</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Requests/min"
          value={requestsPerMin.toFixed(1)}
          subtitle="Last scrape"
          icon={Activity}
          trend="neutral"
        />
        <MetricCard
          title="Error Rate"
          value={`${errorRate.toFixed(2)}%`}
          subtitle="Last scrape"
          icon={AlertCircle}
          trend={errorRate > 0 ? "down" : "neutral"}
        />
        <MetricCard
          title="P95 Latency"
          value={`${p95ms.toFixed(0)}ms`}
          subtitle="Last scrape"
          icon={Clock}
          trend="neutral"
        />
        <MetricCard
          title="Uptime"
          value={`99.8%`}
          subtitle="Placeholder"
          icon={TrendingUp}
          variant="success"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Request Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={showReqs}>
                <defs>
                  <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12}/>
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12}/>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}/>
                <Area type="monotone" dataKey="requests" stroke="hsl(var(--primary))" fill="url(#colorRequests)" strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latency Trend (p95)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={showLat}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12}/>
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12}/>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}/>
                <Line type="monotone" dataKey="latency" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Services</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {services.length === 0 && (
              <div className="text-sm text-muted-foreground">Checking services…</div>
            )}

            {services.map((svc) => (
              <div
                key={svc.name}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      svc.healthy ? "bg-success" : "bg-destructive"
                    } animate-pulse`}
                  />
                  <span className="font-medium">{svc.name}</span>
                </div>
                <span
                  className={`text-sm font-mono ${
                    svc.healthy ? "text-muted-foreground" : "text-destructive"
                  }`}
                >
                  {svc.healthy ? "Healthy" : "Unhealthy"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
