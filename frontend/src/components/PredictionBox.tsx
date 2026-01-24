import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PredictionResponse } from "@/types";
import { Loader2, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface PredictionBoxProps {
  prediction: PredictionResponse | null;
  loading: boolean;
  onProceed: () => void;
  onAdjust: () => void;
}

export function PredictionBox({
  prediction,
  loading,
  onProceed,
  onAdjust,
}: PredictionBoxProps) {
  // Show loading state
  if (loading) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-medium text-muted-foreground">
              Analyzing impact...
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Hide component if no prediction
  if (!prediction) {
    return null;
  }

  const prob = prediction.predicted_failure_probability;

  // Determine risk level
  const getRiskLevel = () => {
    if (prob >= 0.7) {
      return {
        label: "⚠️ HIGH RISK",
        bgColor: "bg-destructive/10",
        borderColor: "border-destructive/50",
        dotColor: "bg-destructive",
      };
    } else if (prob >= 0.4) {
      return {
        label: "⚡ MEDIUM RISK",
        bgColor: "bg-warning/10",
        borderColor: "border-warning/50",
        dotColor: "bg-warning",
      };
    } else {
      return {
        label: "✓ LOW RISK",
        bgColor: "bg-success/10",
        borderColor: "border-success/50",
        dotColor: "bg-success",
      };
    }
  };

  const riskLevel = getRiskLevel();

  return (
    <Card
      className={cn("transition-all", riskLevel.borderColor, riskLevel.bgColor)}
    >
      {/* Header */}
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("h-3 w-3 rounded-full", riskLevel.dotColor)} />
            <CardTitle className="text-lg">{riskLevel.label}</CardTitle>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-primary">
              {(prob * 100).toFixed(0)}%
            </span>
            <p className="text-xs text-muted-foreground">Failure probability</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Affected Services */}
        {prediction.affected_services.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Affected Services</h3>
            <div className="space-y-2">
              {prediction.affected_services.map((service) => (
                <div
                  key={service.service_name}
                  className="rounded-lg border border-border/50 bg-card p-3 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {service.service_name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {service.reason}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-primary">
                        {(service.failure_probability * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendation */}
        {prediction.recommendation && (
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-4">
            <div className="flex gap-3">
              <Lightbulb className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                {prediction.recommendation}
              </p>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 pt-2">
          <Button onClick={onProceed} className="flex-1" variant="default">
            Proceed with Test
          </Button>
          <Button onClick={onAdjust} className="flex-1" variant="outline">
            Adjust Fault
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
