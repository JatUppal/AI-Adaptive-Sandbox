import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AISummaryCardProps {
  aiSummary: string;
  errorRate: number;
  projectName: string;
  testId: string;
}

export function AISummaryCard({
  aiSummary,
  errorRate,
  projectName,
  testId,
}: AISummaryCardProps) {
  // Determine error rate severity
  const getErrorRateBadge = () => {
    const percentage = errorRate * 100;

    if (percentage >= 10) {
      return {
        label: "Critical",
        bgColor: "bg-destructive/10",
        textColor: "text-destructive",
        borderColor: "border-destructive/30",
      };
    } else if (percentage >= 5) {
      return {
        label: "Warning",
        bgColor: "bg-warning/10",
        textColor: "text-warning",
        borderColor: "border-warning/30",
      };
    } else if (percentage >= 1) {
      return {
        label: "Elevated",
        bgColor: "bg-yellow-100/50",
        textColor: "text-yellow-700",
        borderColor: "border-yellow-300/50",
      };
    } else {
      return {
        label: "Normal",
        bgColor: "bg-success/10",
        textColor: "text-success",
        borderColor: "border-success/30",
      };
    }
  };

  const errorBadge = getErrorRateBadge();

  return (
    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200/50 shadow-md hover:shadow-lg transition-shadow">
      {/* Header */}
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="text-3xl">🤖</span>
            <div>
              <CardTitle className="text-xl">AI-Powered Analysis</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Project: {projectName} • Test: {testId}
              </p>
            </div>
          </div>

          {/* Error Rate Badge */}
          <div
            className={cn(
              "rounded-lg border px-3 py-2 whitespace-nowrap text-right",
              errorBadge.bgColor,
              errorBadge.borderColor
            )}
          >
            <p className={cn("text-xs font-semibold", errorBadge.textColor)}>
              {errorBadge.label}
            </p>
            <p className={cn("text-sm font-bold", errorBadge.textColor)}>
              {(errorRate * 100).toFixed(1)}% Error Rate
            </p>
          </div>
        </div>
      </CardHeader>

      {/* Summary Content */}
      <CardContent className="space-y-6">
        <p className="text-base leading-relaxed text-foreground/80">
          {aiSummary}
        </p>

        {/* Footer Actions */}
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1">
            View Full Report
          </Button>
          <Button variant="default" className="flex-1">
            Acknowledge
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
