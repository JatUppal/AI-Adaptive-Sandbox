import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json());

const SERVICE_A_URL = process.env.SERVICE_A_URL || 'http://localhost:8001';
const PROM_URL = process.env.PROM_URL || 'http://localhost:9090';
const TOXIPROXY_URL = process.env.TOXIPROXY_URL || 'http://localhost:8474';
const PREDICTOR_URL = process.env.PREDICTOR_URL || 'http://localhost:8003';

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
  console.log(`PROM_URL: ${PROM_URL}`);
  console.log(`TOXIPROXY_URL: ${TOXIPROXY_URL}`);
  console.log(`PREDICTOR_URL: ${PREDICTOR_URL}`);
});
