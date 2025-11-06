import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const mockPredictions = [
  {
    id: 1,
    type: "performance",
    severity: "high",
    title: "Latency spike predicted in 15 minutes",
    description: "ML model detected pattern similar to previous incidents. Consider scaling up resources.",
    confidence: 87,
    timestamp: "2 minutes ago",
  },
  {
    id: 2,
    type: "reliability",
    severity: "medium",
    title: "Increased error rate likely during peak hours",
    description: "Historical data suggests 15% error rate increase during 2-4 PM window.",
    confidence: 72,
    timestamp: "5 minutes ago",
  },
  {
    id: 3,
    type: "optimization",
    severity: "low",
    title: "Resource optimization opportunity",
    description: "Service A shows consistent over-provisioning. Safe to reduce by 20%.",
    confidence: 91,
    timestamp: "10 minutes ago",
  },
];

const severityConfig = {
  high: { color: "destructive", icon: AlertTriangle },
  medium: { color: "warning", icon: TrendingUp },
  low: { color: "success", icon: CheckCircle },
};

export default function AIInsights() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">AI Insights</h2>
        <p className="text-muted-foreground mt-1">Predictive analytics and recommendations</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Predictions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockPredictions.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Last updated 2 min ago</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Model Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">94.2%</div>
            <p className="text-xs text-success mt-1">+2.1% from last week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prevented Incidents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">18</div>
            <p className="text-xs text-muted-foreground mt-1">This month</p>
          </CardContent>
        </Card>
      </div>

      {/* Predictions List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Current Predictions
          </CardTitle>
          <CardDescription>AI-generated insights and recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockPredictions.map((prediction) => {
              const config = severityConfig[prediction.severity as keyof typeof severityConfig];
              const Icon = config.icon;
              
              return (
                <div 
                  key={prediction.id} 
                  className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg bg-${config.color}/10 border border-${config.color}/20`}>
                        <Icon className={`h-4 w-4 text-${config.color}`} />
                      </div>
                      <div>
                        <h4 className="font-medium">{prediction.title}</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {prediction.timestamp}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono">
                      {prediction.confidence}% confidence
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground ml-12">
                    {prediction.description}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Model Info */}
      <Card>
        <CardHeader>
          <CardTitle>Model Information</CardTitle>
          <CardDescription>Current AI model configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Model Type</div>
              <div className="font-medium">LSTM Time Series Predictor</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Training Data</div>
              <div className="font-medium">30 days rolling window</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Features</div>
              <div className="font-medium">Request rate, latency, errors, time-of-day</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Prediction Horizon</div>
              <div className="font-medium">5-60 minutes ahead</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
