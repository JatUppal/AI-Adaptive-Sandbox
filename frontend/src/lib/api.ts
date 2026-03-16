const PROXY_URL = import.meta.env.VITE_PROXY_URL || '/proxy';
const RCA_URL = import.meta.env.VITE_RCA_URL || 'http://localhost:8000';

export async function fetchProxyData<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${PROXY_URL}${endpoint}`, options);
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }
  
  return response.json();
}

async function fetchRcaData<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${RCA_URL}${endpoint}`, options);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`RCA API Error (${response.status}): ${body || response.statusText}`);
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

  // Range (for charts)
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

  // ---- RCA API (port 8000) ----
  rcaHealth: () => fetchRcaData<{ status: string; analyzer_loaded: boolean }>('/health'),

  analyzeFailure: (service: string = 'service-a', timeWindowMinutes: number = 5) =>
    fetchRcaData<RcaAnalysis>('/api/analyze-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, time_window_minutes: timeWindowMinutes }),
    }),

  predictImpact: (faultType: string, faultTarget: string, faultMagnitude: number) =>
    fetchRcaData<any>('/api/predict-impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fault_type: faultType, fault_target: faultTarget, fault_magnitude: faultMagnitude }),
    }),
};

// ---------- Types ----------

export interface RootCause {
  rank: number;
  service: string;
  issue: string;
  confidence: number;
  evidence: string;
  trace_ids: string[];
  details: {
    error_message: string;
    affected_span: string;
    avg_duration_ms: number;
  };
}

export interface RcaAnalysis {
  test_id: string;
  project_name: string;
  analyzed_services: string[];
  status: 'success' | 'failed';
  error_rate: number;
  total_traces: number;
  failed_traces: number;
  root_causes: RootCause[];
  ai_summary: string;
  recommendations: string[];
  service: string;
  time_window_minutes: number;
}