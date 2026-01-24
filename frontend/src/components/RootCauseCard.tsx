import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RootCause } from "@/types";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface RootCauseCardProps {
  rootCause: RootCause;
}

export function RootCauseCard({ rootCause }: RootCauseCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get rank emoji
  const getRankEmoji = () => {
    switch (rootCause.rank) {
      case 1:
        return "🔴";
      case 2:
        return "🟡";
      default:
        return "🟢";
    }
  };

  // Format issue: connection_timeout → Connection Timeout
  const formatIssue = (issue: string) => {
    return issue
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const jaegerUrl = `http://localhost:16686/search?traceID=${rootCause.trace_ids.join(
    ","
  )}`;
  const traceCount = rootCause.trace_ids.length;

  return (
    <Card className="border-border hover:border-primary/30 transition-colors">
      <CardContent className="pt-6 space-y-4">
        {/* Header Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getRankEmoji()}</span>
            <div className="flex-1">
              <p className="font-semibold text-foreground">
                {rootCause.service}
              </p>
            </div>
          </div>

          {/* Confidence Badge */}
          <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-1">
            <span className="text-sm font-semibold text-primary">
              {(rootCause.confidence * 100).toFixed(0)}% Confidence
            </span>
          </div>
        </div>

        {/* Issue */}
        <div>
          <p className="text-sm text-muted-foreground">Issue</p>
          <p className="font-medium text-foreground">
            {formatIssue(rootCause.issue)}
          </p>
        </div>

        {/* Evidence */}
        <div>
          <p className="text-sm text-muted-foreground mb-2">Evidence</p>
          <p className="text-sm text-foreground leading-relaxed">
            {rootCause.evidence}
          </p>
        </div>

        {/* Details Toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <span>Details</span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
            {/* Error Message */}
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-semibold">
                Error Message
              </p>
              <code className="block text-xs bg-background/50 p-2 rounded border border-border/50 overflow-x-auto font-mono text-foreground/80">
                {rootCause.details.error_message}
              </code>
            </div>

            {/* Affected Span */}
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-semibold">
                Affected Span
              </p>
              <code className="block text-xs bg-background/50 p-2 rounded border border-border/50 overflow-x-auto font-mono text-foreground/80">
                {rootCause.details.affected_span}
              </code>
            </div>

            {/* Avg Duration */}
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-semibold">
                Average Duration
              </p>
              <p className="text-sm font-mono text-foreground">
                {rootCause.details.avg_duration_ms}ms
              </p>
            </div>
          </div>
        )}

        {/* Jaeger Link Button */}
        <Button
          onClick={() => window.open(jaegerUrl, "_blank")}
          variant="outline"
          className="w-full"
        >
          <ExternalLink className="h-4 w-4" />
          View {traceCount} Failed Trace{traceCount !== 1 ? "s" : ""} in Jaeger
        </Button>
      </CardContent>
    </Card>
  );
}
