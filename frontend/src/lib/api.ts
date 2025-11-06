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
