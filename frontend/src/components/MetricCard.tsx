import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  variant?: "default" | "success" | "warning" | "destructive";
}

export function MetricCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon,
  trend,
  variant = "default" 
}: MetricCardProps) {
  const variantStyles = {
    default: "border-border",
    success: "border-success/50 bg-success/5",
    warning: "border-warning/50 bg-warning/5",
    destructive: "border-destructive/50 bg-destructive/5",
  };

  const trendStyles = {
    up: "text-success",
    down: "text-destructive",
    neutral: "text-muted-foreground",
  };

  return (
    <Card className={cn("transition-all hover:border-primary/50", variantStyles[variant])}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-mono">{value}</div>
        {subtitle && (
          <p className={cn("text-xs mt-1", trend ? trendStyles[trend] : "text-muted-foreground")}>
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
