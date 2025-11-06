import { useQuery } from "@tanstack/react-query";
import { MetricCard } from "@/components/MetricCard";
import { Activity, AlertCircle, Clock, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Mock data for demo purposes
const mockTimeSeriesData = Array.from({ length: 20 }, (_, i) => ({
  time: `${i}m`,
  requests: Math.floor(Math.random() * 100) + 50,
  errors: Math.floor(Math.random() * 10),
  latency: Math.floor(Math.random() * 200) + 100,
}));

export default function Dashboard() {
  // In production, these would fetch real data from the proxy
  const { data: metrics } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => ({
      requests: 1247,
      errors: 8,
      latency: 145,
      uptime: 99.8,
    }),
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground mt-1">Real-time system monitoring and metrics</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Requests/min"
          value={metrics?.requests || 0}
          subtitle="+12% from last hour"
          icon={Activity}
          trend="up"
          variant="success"
        />
        <MetricCard
          title="Error Rate"
          value={`${metrics?.errors || 0}%`}
          subtitle="Within acceptable range"
          icon={AlertCircle}
          trend="neutral"
        />
        <MetricCard
          title="P95 Latency"
          value={`${metrics?.latency || 0}ms`}
          subtitle="-5ms from baseline"
          icon={Clock}
          trend="up"
          variant="success"
        />
        <MetricCard
          title="Uptime"
          value={`${metrics?.uptime || 0}%`}
          subtitle="30-day average"
          icon={TrendingUp}
          variant="success"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Request Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={mockTimeSeriesData}>
                <defs>
                  <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="time" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="requests" 
                  stroke="hsl(var(--primary))" 
                  fill="url(#colorRequests)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latency Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={mockTimeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="time" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="latency" 
                  stroke="hsl(var(--chart-3))" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle>Active Services</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {['Service A', 'Prometheus', 'Toxiproxy', 'AI Predictor'].map((service) => (
              <div key={service} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  <span className="font-medium">{service}</span>
                </div>
                <span className="text-sm text-muted-foreground font-mono">Healthy</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
