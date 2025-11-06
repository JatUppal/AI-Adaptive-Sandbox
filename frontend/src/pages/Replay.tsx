import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlayCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export default function Replay() {
  const [requestCount, setRequestCount] = useState(60);
  const [delay, setDelay] = useState(1000);
  const [results, setResults] = useState<any>(null);

  const replayMutation = useMutation({
    mutationFn: () => api.startReplay(requestCount, delay),
    onSuccess: (data) => {
      setResults(data);
      toast.success("Replay completed successfully");
    },
    onError: (error: Error) => {
      toast.error(`Replay failed: ${error.message}`);
    },
  });

  const handleStartReplay = () => {
    setResults(null);
    replayMutation.mutate();
  };

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
                value={requestCount}
                onChange={(e) => setRequestCount(parseInt(e.target.value))}
                min={1}
                max={1000}
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
                value={delay}
                onChange={(e) => setDelay(parseInt(e.target.value))}
                min={100}
                max={5000}
              />
              <p className="text-xs text-muted-foreground">
                Delay between requests (100-5000ms)
              </p>
            </div>

            <Button
              onClick={handleStartReplay}
              disabled={replayMutation.isPending}
              className="w-full"
              size="lg"
            >
              {replayMutation.isPending ? (
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
            {!results && !replayMutation.isPending && (
              <div className="text-center py-12 text-muted-foreground">
                <PlayCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No replay results yet</p>
                <p className="text-sm mt-1">Configure and start a replay to see results</p>
              </div>
            )}

            {replayMutation.isPending && (
              <div className="text-center py-12">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                <p className="text-muted-foreground">Running replay...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Sending {requestCount} requests
                </p>
              </div>
            )}

            {results && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-success/10 rounded-lg border border-success/20">
                    <div className="text-2xl font-bold font-mono text-success">
                      {results.counts?.success || 0}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Success</div>
                  </div>
                  <div className="text-center p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                    <div className="text-2xl font-bold font-mono text-destructive">
                      {results.counts?.error || 0}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Errors</div>
                  </div>
                  <div className="text-center p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <div className="text-2xl font-bold font-mono text-primary">
                      {results.counts?.total || 0}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Total</div>
                  </div>
                </div>

                <div className="p-4 bg-secondary rounded-lg">
                  <div className="text-sm font-medium mb-2">Success Rate</div>
                  <div className="text-2xl font-bold font-mono text-primary">
                    {results.counts ? 
                      ((results.counts.success / results.counts.total) * 100).toFixed(1) 
                      : 0}%
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
