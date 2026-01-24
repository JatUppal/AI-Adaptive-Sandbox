import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, FileText, Zap } from "lucide-react";
import { AISummaryCard } from "@/components/AISummaryCard";
import { RootCauseCard } from "@/components/RootCauseCard";
import { SimilarIncidentCard } from "@/components/SimilarIncidentCard";
import {
  analyzeFailure,
  generateReport,
  findSimilarIncidents,
  api,
} from "@/lib/api";

export default function AIInsights() {
  const navigate = useNavigate();

  // Fetch analysis
  const {
    data: analysis,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["rca-analysis"],
    queryFn: () => analyzeFailure(),
    refetchInterval: 10000, // 10 seconds
  });

  // Fetch p95 latency
  const { data: p95LatencyData } = useQuery({
    queryKey: ["p95-latency"],
    queryFn: () => api.getP95Latency(),
    refetchInterval: 10000,
  });

  // Fetch similar incidents only if analysis has data
  const { data: similarIncidents = [] } = useQuery({
    queryKey: ["similar-incidents", analysis?.test_id],
    queryFn: () =>
      findSimilarIncidents({
        error_rate: analysis?.error_rate || 0,
        p95_latency: (p95LatencyData as any)?.value || 0,
        failed_services_count: analysis?.analyzed_services?.length || 0,
      }),
    enabled: !!analysis?.test_id,
  });

  const handleGenerateReport = async () => {
    if (analysis?.test_id) {
      await generateReport(analysis.test_id);
    }
  };

  const handleRunAnotherTest = () => {
    navigate("/failure-injection");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        <p className="ml-2 text-gray-600">Analyzing failure...</p>
      </div>
    );
  }

  // Empty State (No Failures)
  if (analysis?.status === "success" && analysis?.failed_traces === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">✅</div>
        <h3 className="text-2xl font-bold text-gray-800 mb-2">
          System Healthy
        </h3>
        <p className="text-gray-600">{analysis.ai_summary}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. AI Summary Section */}
      {analysis?.ai_summary && (
        <AISummaryCard
          aiSummary={analysis.ai_summary}
          errorRate={analysis.error_rate}
          projectName={analysis.project_name}
          testId={analysis.test_id}
        />
      )}

      {/* 2. Recommendations Section */}
      {analysis?.recommendations && analysis.recommendations.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            💡 Recommended Actions
          </h3>
          <div className="space-y-3">
            {analysis.recommendations.map((rec: string, i: number) => (
              <div
                key={i}
                className="flex items-start gap-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200 hover:bg-yellow-100 transition-colors"
              >
                <span className="flex-shrink-0 text-2xl">
                  {rec.split(" ")[0]} {/* Extract emoji */}
                </span>
                <p className="text-gray-800 flex-1">
                  {rec.substring(rec.indexOf(" ") + 1)} {/* Text after emoji */}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Active Test Summary */}
      {analysis && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Test Summary</CardTitle>
              <CardDescription>Active failure test analysis</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-gray-600">Test ID</p>
                <p className="text-lg font-semibold">{analysis.test_id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <Badge
                  variant={
                    analysis.status === "success" ? "default" : "destructive"
                  }
                  className="mt-1"
                >
                  {analysis.status}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-gray-600">Error Rate</p>
                <p className="text-lg font-semibold text-red-600">
                  {(analysis.error_rate * 100).toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Traces</p>
                <p className="text-lg font-semibold">
                  {analysis.failed_traces} / {analysis.total_traces}
                </p>
              </div>
            </div>

            {analysis.analyzed_services &&
              analysis.analyzed_services.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <p className="text-sm font-semibold text-gray-700 mb-3">
                    Services Analyzed
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {analysis.analyzed_services.map(
                      (service: string, i: number) => (
                        <Badge key={i} variant="secondary">
                          {service}
                        </Badge>
                      )
                    )}
                  </div>
                </div>
              )}
          </CardContent>
        </Card>
      )}

      {/* 4. Root Causes */}
      {analysis?.root_causes && analysis.root_causes.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-4">Root Causes</h3>
          <div className="space-y-4">
            {analysis.root_causes.map((cause: any, i: number) => (
              <RootCauseCard key={i} rootCause={cause} />
            ))}
          </div>
        </div>
      )}

      {!analysis?.root_causes ||
        (analysis.root_causes.length === 0 && (
          <div className="text-center py-8 text-gray-600">
            <p>No root causes identified yet.</p>
          </div>
        ))}

      {/* 5. Similar Incidents */}
      {similarIncidents.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-4">Similar Incidents</h3>
          <div className="space-y-4">
            {similarIncidents.map((incident: any, i: number) => (
              <SimilarIncidentCard key={i} incident={incident} />
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-6">
        <Button onClick={handleGenerateReport} className="gap-2">
          <FileText className="h-4 w-4" />
          Generate Report
        </Button>
        <Button
          variant="outline"
          onClick={handleRunAnotherTest}
          className="gap-2"
        >
          <Zap className="h-4 w-4" />
          Run Another Test
        </Button>
      </div>
    </div>
  );
}
