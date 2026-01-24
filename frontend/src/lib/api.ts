import { AnalysisResponse, PredictionResponse, SimilarIncident, Report } from "@/types";

const PROXY_URL = import.meta.env.VITE_PROXY_URL || '/proxy';

export async function fetchProxyData<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${PROXY_URL}${endpoint}`, options);
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }
  
  return response.json();
}

export const api = {
  // Health checks
  health: () => fetchProxyData('/health'),
  serviceStatus: () => fetchProxyData('/status'),
  servicesHealth: () => fetchProxyData('/services/health'),
  
  // Prometheus metrics
  getRequestMetrics: () => fetchProxyData('/prom/requests'),
  getErrorMetrics: () => fetchProxyData('/prom/errors'),
  getP95Latency: () => fetchProxyData('/prom/p95'),
  
  // Replay
  startReplay: (count: number = 60, delay: number = 1000) => 
    fetchProxyData('/replay/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count, delay })
    }),

  // NEW: range (for charts)
  getRequestMetricsRange: () => fetchProxyData('/prom/requests/range'),
  getErrorMetricsRange: () => fetchProxyData('/prom/errors/range'),
  getP95LatencyRange: () => fetchProxyData('/prom/p95/range'),
  
  // Toxiproxy
  listToxics: () => fetchProxyData('/toxics/list'),
  addToxic: (proxy: string, toxic: any) =>
    fetchProxyData('/toxics/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxy, toxic })
    }),
  removeToxic: (proxy: string, toxic: string) =>
    fetchProxyData(`/toxics/remove/${proxy}/${toxic}`, {
      method: 'DELETE'
    }),
  
  // AI Predictor
  predict: (data: any) =>
    fetchProxyData('/ai/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }),
};

export async function predictImpact(faultConfig: {
  fault_type: string;
  fault_target: string;
  fault_magnitude: number;
}): Promise<PredictionResponse> {
  return fetchProxyData('/api/predict-impact', {
    method: 'POST',
    body: JSON.stringify(faultConfig)
  });
}

export async function analyzeFailure(
  testId: string = "latest",
  service: string = "service-a",
  timeWindowMinutes: number = 5
): Promise<AnalysisResponse> {
  return fetchProxyData('/api/analyze-failure', {
    method: 'POST',
    body: JSON.stringify({
      test_id: testId,
      service,
      time_window_minutes: timeWindowMinutes
    })
  });
}

export async function findSimilarIncidents(metrics: {
  error_rate: number;
  p95_latency: number;
  failed_services_count: number;
}): Promise<SimilarIncident[]> {
  return fetchProxyData('/api/similar-incidents', {
    method: 'POST',
    body: JSON.stringify(metrics)
  });
}

export async function generateReport(testId: string): Promise<{ filename: string }> {
  return fetchProxyData('/api/generate-report', {
    method: 'POST',
    body: JSON.stringify({ test_id: testId })
  });
}

export async function listReports(): Promise<Report[]> {
  return fetchProxyData('/api/reports');
}