/**
 * Prometheon API Client — Phase 2B Full Integration
 *
 * All service/toxiproxy/metrics calls now route through RCA API's sandbox proxy.
 * Old Node.js proxy server is no longer needed.
 */

import { getStoredToken } from '../contexts/AuthContext';

const RCA_URL = import.meta.env.VITE_RCA_URL || 'http://localhost:8000';
const SANDBOX_URL = import.meta.env.VITE_SANDBOX_URL || 'http://localhost:9000';

// ---------------------------------------------------------------------------
// Base fetchers
// ---------------------------------------------------------------------------

async function fetchRcaData<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options?.method && ['POST', 'PUT', 'PATCH'].includes(options.method) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${RCA_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem('prometheon_token');
    localStorage.removeItem('prometheon_user');
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API Error (${response.status}): ${body || response.statusText}`);
  }

  return response.json();
}

async function fetchSandboxMgr<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };

  if (options?.method && ['POST', 'PUT', 'PATCH'].includes(options.method) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${SANDBOX_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Sandbox API Error (${response.status}): ${body || response.statusText}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const api = {

  // ============================================================
  // Auth
  // ============================================================

  rcaHealth: () => fetchRcaData<{ status: string; analyzer_loaded: boolean }>('/health'),

  // ============================================================
  // Sandbox-aware service endpoints (replaces old proxy server)
  // All require a sandbox_id parameter
  // ============================================================

  // Health checks for services inside a sandbox
  sandboxServicesHealth: (sandboxId: string) =>
    fetchRcaData<ServiceHealth[]>(`/api/sandbox/${sandboxId}/services/health`),

  // Prometheus metrics for a sandbox's services
  getRequestMetrics: (sandboxId: string) =>
    fetchRcaData<MetricValue>(`/api/sandbox/${sandboxId}/prom/requests`),

  getErrorMetrics: (sandboxId: string) =>
    fetchRcaData<MetricValue>(`/api/sandbox/${sandboxId}/prom/errors`),

  getP95Latency: (sandboxId: string) =>
    fetchRcaData<MetricValue>(`/api/sandbox/${sandboxId}/prom/p95`),

  getRequestMetricsRange: (sandboxId: string) =>
    fetchRcaData<MetricPoint[]>(`/api/sandbox/${sandboxId}/prom/requests/range`),

  getErrorMetricsRange: (sandboxId: string) =>
    fetchRcaData<MetricPoint[]>(`/api/sandbox/${sandboxId}/prom/errors/range`),

  getP95LatencyRange: (sandboxId: string) =>
    fetchRcaData<MetricPoint[]>(`/api/sandbox/${sandboxId}/prom/p95/range`),

  // Toxiproxy — list/add/remove toxics in a sandbox
  listToxics: (sandboxId: string) =>
    fetchRcaData<Record<string, ProxyInfo>>(`/api/sandbox/${sandboxId}/toxics/list`),

  addToxic: (sandboxId: string, proxy: string, toxic: any) =>
    fetchRcaData(`/api/sandbox/${sandboxId}/toxics/add`, {
      method: 'POST',
      body: JSON.stringify({ proxy, toxic }),
    }),

  removeToxic: (sandboxId: string, proxy: string, toxic: string) =>
    fetchRcaData(`/api/sandbox/${sandboxId}/toxics/remove/${proxy}/${toxic}`, {
      method: 'DELETE',
    }),

  // Replay — send traffic to a sandbox's service-a
  startReplay: (sandboxId: string, count: number = 60, delay: number = 1000) =>
    fetchRcaData<ReplayResult>(`/api/sandbox/${sandboxId}/replay/start`, {
      method: 'POST',
      body: JSON.stringify({ count, delay }),
    }),

  // ============================================================
  // RCA Analysis — now sandbox-aware
  // ============================================================

  analyzeFailure: (sandboxId: string, service: string = 'service-a', timeWindowMinutes: number = 5) =>
    fetchRcaData<RcaAnalysis>('/api/analyze-failure', {
      method: 'POST',
      body: JSON.stringify({
        service,
        time_window_minutes: timeWindowMinutes,
        sandbox_id: sandboxId,
      }),
    }),

  predictImpact: (faultType: string, faultTarget: string, faultMagnitude: number) =>
    fetchRcaData<any>('/api/predict-impact', {
      method: 'POST',
      body: JSON.stringify({
        fault_type: faultType,
        fault_target: faultTarget,
        fault_magnitude: faultMagnitude,
      }),
    }),

  // ============================================================
  // Test Results (persisted)
  // ============================================================

  listTestResults: (limit: number = 20, offset: number = 0) =>
    fetchRcaData<TestResultSummary[]>(`/api/test-results?limit=${limit}&offset=${offset}`),

  getTestResult: (resultId: string) =>
    fetchRcaData<RcaAnalysis>(`/api/test-results/${resultId}`),

  // ============================================================
  // Chaos Config CRUD
  // ============================================================

  listChaosConfigs: () =>
    fetchRcaData<ChaosConfigItem[]>('/api/chaos-configs'),

  createChaosConfig: (config: CreateChaosConfig) =>
    fetchRcaData<{ id: string; name: string }>('/api/chaos-configs', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  deleteChaosConfig: (configId: string) =>
    fetchRcaData<{ deleted: boolean }>(`/api/chaos-configs/${configId}`, {
      method: 'DELETE',
    }),

  // ============================================================
  // Sandbox Manager
  // ============================================================

  sandboxHealth: () =>
    fetchSandboxMgr<{ status: string }>('/health'),

  createSandbox: (tenantId: string, name: string, resourceTier: string = 'small', services?: ServiceInput[], connections?: ConnectionInput[], useDemo?: boolean) =>
    fetchSandboxMgr<SandboxDetail>('/sandboxes', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        name,
        resource_tier: resourceTier,
        services: services || [],
        connections: connections || [],
        use_demo: useDemo || false,
      }),
    }),

  listSandboxes: (tenantId?: string) =>
    fetchSandboxMgr<SandboxSummary[]>(
      tenantId ? `/sandboxes?tenant_id=${tenantId}` : '/sandboxes'
    ),

  getSandbox: (sandboxId: string) =>
    fetchSandboxMgr<SandboxDetail>(`/sandboxes/${sandboxId}`),

  getSandboxConfig: (sandboxId: string) =>
    fetchRcaData<SandboxConfig>(`/api/sandbox/${sandboxId}/config`),

  deleteSandbox: (sandboxId: string) =>
    fetchSandboxMgr<{ deleted: boolean; sandbox_id: string; namespace: string }>(
      `/sandboxes/${sandboxId}`,
      { method: 'DELETE' }
    ),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceHealth {
  name: string;
  status: string;
}

export interface MetricValue {
  value: number;
  label: string;
}

export interface MetricPoint {
  time: number;
  value: number;
}

export interface ProxyInfo {
  listen: string;
  upstream: string;
  enabled: boolean;
  toxics: any[];
}

export interface ReplayResult {
  total: number;
  success: number;
  failed: number;
  errors: string[];
}

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
  result_id?: string;
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
  _cached?: boolean;
}

export interface TestResultSummary {
  id: string;
  test_id: string;
  service: string;
  status: string;
  error_rate: number;
  total_traces: number;
  failed_traces: number;
  root_cause_count: number;
  ai_summary: string;
  created_at: string;
}

export interface ChaosConfigItem {
  id: string;
  name: string;
  description: string;
  proxy: string;
  toxic_type: string;
  attributes: Record<string, any>;
  is_default: boolean;
  created_at: string;
}

export interface CreateChaosConfig {
  name: string;
  description?: string;
  proxy: string;
  toxic_type: string;
  attributes: Record<string, any>;
}

export interface ServiceInput {
  name: string;
  image: string;
  port: number;
  env: Record<string, string>;
  entry_point: boolean;
}

export interface ConnectionInput {
  from_service: string;
  to_service: string;
}

export interface SandboxSummary {
  sandbox_id: string;
  namespace: string;
  tenant_id: string;
  name: string;
  status: string;
  pods: string;
  created_at: string | null;
}

export interface SandboxConfig {
  services: Array<{ name: string; image: string; port: number; entry_point: boolean }>;
  connections: Array<{ from: string; to: string }>;
  entry_point: string;
  proxy_map: Record<string, any>;
}

export interface SandboxPod {
  name: string;
  status: string;
  ready: boolean;
}

export interface SandboxDetail {
  sandbox_id: string;
  namespace: string;
  tenant_id: string;
  name: string;
  status: string;
  services: Record<string, string>;
  pods?: SandboxPod[];
  created_at: string;
}