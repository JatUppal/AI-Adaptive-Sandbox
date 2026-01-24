import { Card, CardContent } from "@/components/ui/card";
import { SimilarIncident } from "@/types";
import { cn } from "@/lib/utils";

interface SimilarIncidentCardProps {
  incident: SimilarIncident;
}

export function SimilarIncidentCard({ incident }: SimilarIncidentCardProps) {
  // Format date
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  // Format issue: connection_timeout → Connection Timeout
  const formatIssue = (issue: string) => {
    return issue
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Determine border color based on similarity
  const getSimilarityBorder = () => {
    const similarity = incident.similarity;
    if (similarity >= 0.8) {
      return "border-success/50";
    } else if (similarity >= 0.6) {
      return "border-warning/50";
    } else {
      return "border-destructive/50";
    }
  };

  // Determine similarity badge background
  const getSimilarityBadgeColor = () => {
    const similarity = incident.similarity;
    if (similarity >= 0.8) {
      return "bg-success/10 text-success";
    } else if (similarity >= 0.6) {
      return "bg-warning/10 text-warning";
    } else {
      return "bg-destructive/10 text-destructive";
    }
  };

  const similarity = incident.similarity;

  return (
    <Card
      className={cn(
        "transition-colors hover:border-primary/30",
        getSimilarityBorder()
      )}
    >
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm font-mono text-muted-foreground">
              {incident.incident_id}
            </p>
          </div>
          <div
            className={cn(
              "rounded-lg border px-2.5 py-1 text-right whitespace-nowrap",
              getSimilarityBadgeColor()
            )}
          >
            <span className="text-xs font-bold">
              {(similarity * 100).toFixed(0)}% Match
            </span>
          </div>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-0.5">
              Date
            </p>
            <p className="text-sm text-foreground">
              {formatDate(incident.date)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-0.5">
              Duration
            </p>
            <p className="text-sm text-foreground">{incident.duration}</p>
          </div>
        </div>

        {/* Root Cause */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            Root Cause
          </p>
          <p className="text-sm font-medium text-foreground">
            {formatIssue(incident.root_cause)}
          </p>
        </div>

        {/* Description */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            Description
          </p>
          <p className="text-sm text-foreground/80 line-clamp-2 leading-relaxed">
            {incident.description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
