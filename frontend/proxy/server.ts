import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';


const app = express();
app.use(cors());
app.use(express.json());

const SERVICE_A_URL = process.env.SERVICE_A_URL || 'http://localhost:8001';
const SERVICE_B_URL = process.env.SERVICE_B_URL || 'http://localhost:8666';
const SERVICE_C_URL = process.env.SERVICE_C_URL || 'http://localhost:8667';
const PROM_URL = process.env.PROM_URL || 'http://localhost:9090';
const TOXIPROXY_URL = process.env.TOXIPROXY_URL || 'http://localhost:8474';
const PREDICTOR_URL = process.env.PREDICTOR_URL || 'http://localhost:8003';

async function check(url: string, opts: {method?: string} = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 2500);
  try {
    const r = await fetch(url, { signal: controller.signal, method: opts.method || 'GET' });
    clearTimeout(t);
    const ok = r.ok;
    let body: any = null;
    try { body = await r.json(); } catch { body = await r.text(); }
    return { ok, status: r.status, body };
  } catch (e:any) {
    clearTimeout(t);
    return { ok: false, status: 0, body: String(e?.message || e) };
  }
}


// Health check
app.get('/proxy/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Service A status
app.get('/proxy/status', async (req, res) => {
  try {
    const response = await fetch(`${SERVICE_A_URL}/health`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Service A unavailable', details: error.message });
  }
});

app.get('/proxy/services/health', async (_req, res) => {
  const checks = [
    { name: 'Service A', url: `${SERVICE_A_URL}/health` },
    { name: 'Service B', url: `${SERVICE_B_URL}/health` },
    { name: 'Service C', url: `${SERVICE_C_URL}/health` },
    { name: 'Prometheus', url: `${PROM_URL}/api/v1/query?query=up` },   // Prom readiness
    { name: 'Toxiproxy', url: `${TOXIPROXY_URL}/proxies` }, // list proxies as a health signal
    { name: 'AI Predictor', url: `${PREDICTOR_URL}/health` },
  ];

  const results = await Promise.all(checks.map(async c => {
    const r = await check(c.url);
    return {
      name: c.name,
      url: c.url,
      healthy: r.ok,
      status: r.status,
      detail: r.body
    };
  }));

  res.json({ services: results });
});

// Prometheus metrics - requests
app.get('/proxy/prom/requests', async (req, res) => {
  try {
    const query = 'sum by (service)(rate(request_count_total[1m]))';
    const response = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Prometheus unavailable', details: error.message });
  }
});

// Prometheus metrics - errors
app.get('/proxy/prom/errors', async (req, res) => {
  try {
    const query = 'sum by (service)(rate(error_count_total[1m]))';
    const response = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Prometheus unavailable', details: error.message });
  }
});

// Prometheus metrics - p95 latency
app.get('/proxy/prom/p95', async (req, res) => {
  try {
    const query = 'histogram_quantile(0.95, sum(rate(request_latency_seconds_bucket[1m])) by (le, service))';
    const response = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Prometheus unavailable', details: error.message });
  }
});

// Replay traffic
app.post('/proxy/replay/start', async (req, res) => {
  const { count = 60, delay = 1000 } = req.body;
  let successCount = 0;
  let errorCount = 0;

  try {
    for (let i = 0; i < count; i++) {
      try {
        const response = await fetch(`${SERVICE_A_URL}/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: `user_${i}`, amount: Math.random() * 100 })
        });
        
        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
      }

      if (i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    res.json({ 
      ok: true, 
      counts: { success: successCount, error: errorCount, total: count }
    });
  } catch (error) {
    res.status(500).json({ 
      ok: false, 
      error: error.message,
      counts: { success: successCount, error: errorCount, total: count }
    });
  }
});

// Toxiproxy - list proxies
app.get('/proxy/toxics/list', async (req, res) => {
  try {
    const response = await fetch(`${TOXIPROXY_URL}/proxies`);
    const data = await response.json();
    
    // Condense to simpler format
    const condensed = Object.entries(data).map(([name, proxy]: [string, any]) => ({
      name,
      listen: proxy.listen,
      upstream: proxy.upstream,
      enabled: proxy.enabled,
      toxics: proxy.toxics || []
    }));
    
    res.json(condensed);
  } catch (error) {
    res.status(500).json({ error: 'Toxiproxy unavailable', details: error.message });
  }
});

// Toxiproxy - add toxic
app.post('/proxy/toxics/add', async (req, res) => {
  const { proxy, toxic } = req.body;
  
  try {
    const response = await fetch(`${TOXIPROXY_URL}/proxies/${proxy}/toxics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toxic)
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add toxic', details: error.message });
  }
});

// Toxiproxy - remove toxic
app.delete('/proxy/toxics/remove/:proxy/:toxic', async (req, res) => {
  const { proxy, toxic } = req.params;
  
  try {
    const response = await fetch(`${TOXIPROXY_URL}/proxies/${proxy}/toxics/${toxic}`, {
      method: 'DELETE'
    });
    
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove toxic', details: error.message });
  }
});

// AI Predictor - get prediction
app.post('/proxy/ai/predict', async (req, res) => {
  try {
    const response = await fetch(`${PREDICTOR_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Predictor unavailable', details: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
  console.log(`SERVICE_A_URL: ${SERVICE_A_URL}`);
  console.log(`SERVICE_B_URL: ${SERVICE_B_URL}`);
  console.log(`SERVICE_C_URL: ${SERVICE_C_URL}`);
  console.log(`PROM_URL: ${PROM_URL}`);
  console.log(`TOXIPROXY_URL: ${TOXIPROXY_URL}`);
  console.log(`PREDICTOR_URL: ${PREDICTOR_URL}`);
});

// ---------- Prometheus RANGE queries (for charts) ----------
function toRFC3339(d: Date) {
  return d.toISOString(); // Prom accepts ISO-8601
}

// last 5 minutes, 15s step
function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 5 * 60 * 1000);
  const step = '15s';
  return { start, end, step };
}

// Requests/min (range)
app.get('/proxy/prom/requests/range', async (req, res) => {
  try {
    const { start, end, step } = defaultRange();
    const query = 'sum by (service)(rate(request_count_total[1m]))';
    const url = `${PROM_URL}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${encodeURIComponent(
      toRFC3339(start)
    )}&end=${encodeURIComponent(toRFC3339(end))}&step=${encodeURIComponent(step)}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Prometheus unavailable', details: error.message });
  }
});

// Error rate (range)
app.get('/proxy/prom/errors/range', async (req, res) => {
  try {
    const { start, end, step } = defaultRange();
    const query = 'sum by (service)(rate(error_count_total[1m]))';
    const url = `${PROM_URL}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${encodeURIComponent(
      toRFC3339(start)
    )}&end=${encodeURIComponent(toRFC3339(end))}&step=${encodeURIComponent(step)}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Prometheus unavailable', details: error.message });
  }
});

// p95 latency (range) — seconds; multiply by 1000 in UI if you want ms
app.get('/proxy/prom/p95/range', async (req, res) => {
  try {
    const { start, end, step } = defaultRange();
    const query =
      'histogram_quantile(0.95, sum(rate(request_latency_seconds_bucket[1m])) by (le, service))';
    const url = `${PROM_URL}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${encodeURIComponent(
      toRFC3339(start)
    )}&end=${encodeURIComponent(toRFC3339(end))}&step=${encodeURIComponent(step)}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Prometheus unavailable', details: error.message });
  }
});
