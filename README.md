## AI Adaptive Sandbox

Monorepo for Phase 0.1 (live observation) and Phase 0.2 (sandbox replay + one failure):

- Person 1: Observation (OpenTelemetry + baseline)
- Person 2: Replay/Failures (Python replay engine + Toxiproxy)
- Person 3: Reporting/Monitoring (Prom/Grafana + Slack)

Contract files live in `data/`:

- `data/captures/capture_001.json` (NDJSON traces)
- `data/baselines/normal_baseline.yaml`
- `data/replays/replay_run_001.json`

See `docs/flow-draft.md` for the flow.

## Running the Sandbox

This repo spins up three FastAPI microservices (Service A, Service B, Service C) instrumented with OpenTelemetry, along with an OTel Collector, Jaeger, Prometheus, and Grafana.

### 1. Start the stack

```bash
docker compose up -d --build
```

This launches:

- `service-a` (exposed at `localhost:8081`)
- `service-b` (internal, port `8080`)
- `service-c` (internal, port `8080`)
- `otel-collector` (ports `4317` gRPC / `4318` HTTP)
- `jaeger` (http://localhost:16686)
- `prometheus` (http://localhost:9090)
- `grafana` (http://localhost:3000)

### 2. Hit Service A (triggers A→B→C chain)

```bash
curl -s http://localhost:8081/checkout | jq .
```

Expected response:

```json
{
  "service": "A",
  "downstream": {
    "service": "B",
    "downstream": {
      "service": "C",
      "stock": 42
    }
  }
}
```

### 3. Generate some traffic

```bash
for i in {1..20}; do curl -s http://localhost:8081/checkout > /dev/null; done
```

### 4. Verify traces captured locally

Traces are exported by the collector to `./data/captures`.

Count events:

```bash
wc -l data/captures/capture_001.ndjson
```

Check service names:

```bash
jq -r '.resourceSpans[].resource.attributes[]
       | select(.key=="service.name")
       | .value.stringValue' data/captures/capture_001.ndjson \
  | sort | uniq -c
```

Expected output:

```
  N manual-test
  N service-a
  N service-b
  N service-c
```

### 5. Visualize in Jaeger

```
Open http://localhost:16686 in your browser, select a service (e.g. `service-a`), and run a query to see end-to-end distributed traces across A → B → C.
```

### 6. Toxiproxy: Failure Injection

Toxiproxy allows controlled failures between services. Proxies are already created:

ab → routes traffic from A → B (localhost:8666)

bc → routes traffic from B → C (localhost:8667)

Add Failures (Toxics)

Latency (ms)

# A→B latency

curl -X POST http://localhost:8474/proxies/ab/toxics -d '{
"name": "latency_ab",
"type": "latency",
"attributes": {"latency":1000,"jitter":200}
}'

# B→C latency

curl -X POST http://localhost:8474/proxies/bc/toxics -d '{
"name": "latency_bc",
"type": "latency",
"attributes": {"latency":1500,"jitter":300}
}'

Packet Loss

# A→B packet loss

curl -X POST http://localhost:8474/proxies/ab/toxics -d '{
"name": "packet_loss_ab",
"type": "limit_data",
"attributes": {"bytes":1024}
}'

# B→C packet loss

curl -X POST http://localhost:8474/proxies/bc/toxics -d '{
"name": "packet_loss_bc",
"type": "limit_data",
"attributes": {"bytes":1024}
}'

Abort / Timeout

# A→B timeout

curl -X POST http://localhost:8474/proxies/ab/toxics -d '{
"name": "abort_ab",
"type": "timeout",
"attributes": {"timeout":2000}
}'

# B→C timeout

curl -X POST http://localhost:8474/proxies/bc/toxics -d '{
"name": "abort_bc",
"type": "timeout",
"attributes": {"timeout":2000}
}'

Verify Toxics
curl http://localhost:8474/proxies | jq

Remove / Disable Toxics

# Remove all toxics from a proxy

curl -X DELETE http://localhost:8474/proxies/ab/toxics

# Remove a specific toxic

curl -X DELETE http://localhost:8474/proxies/bc/toxics/latency_bc
