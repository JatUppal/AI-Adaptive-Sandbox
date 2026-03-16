import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Brain,
  AlertTriangle,
  CheckCircle,
  Search,
  Loader2,
  ShieldAlert,
  Activity,
  Clock,
  Sparkles,
  Lightbulb,
  Hash,
} from "lucide-react";
import { toast } from "sonner";
import { api, type RcaAnalysis, type RootCause } from "@/lib/api";

function confidenceColor(c: number) {
  if (c >= 0.7) return "destructive";
  if (c >= 0.4) return "secondary";
  return "outline";
}

function statusBadge(status: string) {
  if (status === "failed")
    return (
      <Badge variant="destructive" className="text-xs">
        <ShieldAlert className="h-3 w-3 mr-1" />
        Failures Detected
      </Badge>
    );
  return (
    <Badge className="bg-success/20 text-success border-success/30 text-xs">
      <CheckCircle className="h-3 w-3 mr-1" />
      Healthy
    </Badge>
  );
}

function issuePretty(issue: string) {
  return issue.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function RootCauseCard({ cause }: { cause: RootCause }) {
  return (
    <div className="border border-border rounded-lg p-5 hover:border-primary/40 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-destructive/15 border border-destructive/30 text-destructive font-bold text-sm font-mono">
            {cause.rank}
          </div>
          <div>
            <h4 className="font-semibold">{issuePretty(cause.issue)}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-mono">{cause.service}</span>
              {" · "}
              <span className="font-mono">{cause.details.affected_span}</span>
            </p>
          </div>
        </div>
        <Badge variant={confidenceColor(cause.confidence)} className="font-mono text-xs shrink-0">
          {(cause.confidence * 100).toFixed(0)}% confidence
        </Badge>
      </div>

      {/* Evidence */}
      <div className="ml-11 space-y-2">
        <p className="text-sm text-muted-foreground">{cause.evidence}</p>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Avg {cause.details.avg_duration_ms.toFixed(0)}ms
          </span>
          <span className="flex items-center gap-1">
            <Hash className="h-3 w-3" />
            {cause.trace_ids.length} trace{cause.trace_ids.length !== 1 ? "s" : ""}
          </span>
        </div>

        {cause.details.error_message && cause.details.error_message !== "Error occurred" && (
          <p className="text-xs font-mono text-destructive/80 bg-destructive/5 rounded px-2 py-1 border border-destructive/10">
            {cause.details.error_message}
          </p>
        )}
      </div>
    </div>
  );
}

export default function AIInsights() {
  const [service, setService] = useState("service-a");
  const [timeWindow, setTimeWindow] = useState("5");
  const [analysis, setAnalysis] = useState<RcaAnalysis | null>(null);

  const analyzeMutation = useMutation({
    mutationFn: () => api.analyzeFailure(service, parseInt(timeWindow)),
    onSuccess: (data) => {
      setAnalysis(data);
      if (data.status === "failed") {
        toast.warning(`Found ${data.root_causes.length} root cause(s) across ${data.failed_traces} failed traces`);
      } else {
        toast.success("System is healthy — no failures detected");
      }
    },
    onError: (error: Error) => {
      toast.error(`Analysis failed: ${error.message}`);
    },
  });

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">AI Insights</h2>
        <p className="text-muted-foreground mt-1">Root cause analysis powered by trace intelligence</p>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-primary" />
            Run Analysis
          </CardTitle>
          <CardDescription>Analyze recent Jaeger traces to identify failure root causes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2 min-w-[160px]">
              <Label htmlFor="service">Service</Label>
              <Select value={service} onValueChange={setService}>
                <SelectTrigger id="service">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service-a">service-a</SelectItem>
                  <SelectItem value="service-b">service-b</SelectItem>
                  <SelectItem value="service-c">service-c</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-[160px]">
              <Label htmlFor="window">Time Window</Label>
              <Select value={timeWindow} onValueChange={setTimeWindow}>
                <SelectTrigger id="window">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">Last 2 minutes</SelectItem>
                  <SelectItem value="5">Last 5 minutes</SelectItem>
                  <SelectItem value="10">Last 10 minutes</SelectItem>
                  <SelectItem value="30">Last 30 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              size="lg"
            >
              {analyzeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Brain className="mr-2 h-4 w-4" />
                  Analyze Traces
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {analyzeMutation.isPending && (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Fetching traces from Jaeger and analyzing patterns…</p>
          </CardContent>
        </Card>
      )}

      {/* Empty / no-run state */}
      {!analysis && !analyzeMutation.isPending && (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-muted-foreground">
            <Brain className="h-12 w-12 mb-4 opacity-40" />
            <p>No analysis run yet</p>
            <p className="text-sm mt-1">Select a service and time window, then click Analyze Traces</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {analysis && !analyzeMutation.isPending && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
              </CardHeader>
              <CardContent>{statusBadge(analysis.status)}</CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Error Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold font-mono ${analysis.error_rate > 0 ? "text-destructive" : "text-success"}`}>
                  {(analysis.error_rate * 100).toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {analysis.failed_traces} / {analysis.total_traces} traces
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Root Causes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">{analysis.root_causes.length}</div>
                <p className="text-xs text-muted-foreground mt-1">Distinct failure patterns</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Analysis ID</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-mono truncate">{analysis.test_id}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {analysis.service} · {analysis.time_window_minutes}m window
                </p>
              </CardContent>
            </Card>
          </div>

          {/* AI Summary */}
          <Card className="border-primary/30 bg-primary/[0.03]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                AI Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{analysis.ai_summary}</p>
            </CardContent>
          </Card>

          {/* Root causes */}
          {analysis.root_causes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Root Causes
                  <Badge variant="outline" className="ml-auto font-mono text-xs">
                    Ranked by confidence
                  </Badge>
                </CardTitle>
                <CardDescription>Failure patterns identified from Jaeger traces</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.root_causes.map((cause) => (
                  <RootCauseCard key={`${cause.service}-${cause.issue}`} cause={cause} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {analysis.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lightbulb className="h-4 w-4 text-warning" />
                  Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {analysis.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-lg bg-secondary/40 border border-border text-sm"
                  >
                    <span className="text-muted-foreground font-mono text-xs mt-0.5">{i + 1}.</span>
                    <span>{rec}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Healthy state — no failures */}
          {analysis.status === "success" && analysis.root_causes.length === 0 && (
            <Card className="border-success/30">
              <CardContent className="flex flex-col items-center py-12">
                <CheckCircle className="h-12 w-12 text-success mb-4" />
                <p className="font-medium text-lg">All Clear</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No failures detected in the last {analysis.time_window_minutes} minutes for{" "}
                  <span className="font-mono">{analysis.service}</span>
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
