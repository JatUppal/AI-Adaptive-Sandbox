import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlayCircle, Loader2 } from "lucide-react";
import { useReplay } from "@/contexts/ReplayContext";

export default function Replay() {
  const { config, setConfig, isRunning, result, error, startReplay } = useReplay();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Traffic Replay</h2>
        <p className="text-muted-foreground mt-1">Simulate production traffic patterns</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Set replay parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="count">Request Count</Label>
              <Input
                id="count"
                type="number"
                value={config.count}
                onChange={(e) =>
                  setConfig({ ...config, count: parseInt(e.target.value) || 1 })
                }
                min={1}
                max={1000}
                disabled={isRunning}
              />
              <p className="text-xs text-muted-foreground">
                Number of requests to send (1-1000)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="delay">Delay (ms)</Label>
              <Input
                id="delay"
                type="number"
                value={config.delay}
                onChange={(e) =>
                  setConfig({ ...config, delay: parseInt(e.target.value) || 100 })
                }
                min={100}
                max={5000}
                disabled={isRunning}
              />
              <p className="text-xs text-muted-foreground">
                Delay between requests (100-5000ms)
              </p>
            </div>

            <Button
              onClick={startReplay}
              disabled={isRunning}
              className="w-full"
              size="lg"
            >
              {isRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Replay...
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Start Replay
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>Replay execution summary</CardDescription>
          </CardHeader>
          <CardContent>
            {/* No result yet, not running */}
            {!result && !isRunning && !error && (
              <div className="text-center py-12 text-muted-foreground">
                <PlayCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No replay results yet</p>
                <p className="text-sm mt-1">Configure and start a replay to see results</p>
              </div>
            )}

            {/* Running */}
            {isRunning && (
              <div className="text-center py-12">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                <p className="text-muted-foreground">Running replay...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Sending {config.count} requests with {config.delay}ms delay
                </p>
              </div>
            )}

            {/* Error */}
            {error && !isRunning && (
              <div className="text-center py-12">
                <p className="text-destructive font-medium">Replay failed</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            )}

            {/* Completed results */}
            {result && !isRunning && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-success/10 rounded-lg border border-success/20">
                    <div className="text-2xl font-bold font-mono text-success">
                      {result.counts?.success || 0}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Success</div>
                  </div>
                  <div className="text-center p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                    <div className="text-2xl font-bold font-mono text-destructive">
                      {result.counts?.error || 0}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Errors</div>
                  </div>
                  <div className="text-center p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <div className="text-2xl font-bold font-mono text-primary">
                      {result.counts?.total || 0}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Total</div>
                  </div>
                </div>

                <div className="p-4 bg-secondary rounded-lg">
                  <div className="text-sm font-medium mb-2">Success Rate</div>
                  <div className="text-2xl font-bold font-mono text-primary">
                    {result.counts
                      ? ((result.counts.success / result.counts.total) * 100).toFixed(1)
                      : 0}
                    %
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
