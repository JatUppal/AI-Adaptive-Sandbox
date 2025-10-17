## AI Adaptive Sandbox

Monorepo for Phase 0.1 (live observation) and Phase 0.2 (sandbox replay + failures):

* Person 1: Observation (OpenTelemetry + baseline)
* Person 2: Replay/Failures (Python replay engine + Toxiproxy)
* Person 3: Reporting/Monitoring (Prom/Grafana + Slack)

Contract files live in `data/`:

* `data/captures/capture_001.json` (NDJSON traces)
* `data/baselines/normal_baseline.yaml`
* `data/replays/replay_run_001.json`

See `docs/flow-draft.md` for the flow.

## Running the Sandbox

This repo spins up three FastAPI microservices (Service A, Service B, Service C) instrumented with OpenTelemetry, along with an OTel Collector, Jaeger, Prometheus, and Grafana.

### 1. Start the stack

```bash
docker compose up -d --build
```

This launches:

* `service-a` (exposed at `localhost:8081`)
* `service-b` (internal, port `8080`)
* `service-c` (internal, port `8080`)
* `otel-collector` (ports `4317` gRPC / `4318` HTTP)
* `jaeger` ([http://localhost:16686](http://localhost:16686))
* `prometheus` ([http://localhost:9090](http://localhost:9090))
* `grafana` ([http://localhost:3000](http://localhost:3000))

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

Open [http://localhost:16686](http://localhost:16686) in your browser, select a service (e.g. `service-a`), and run a query to see end-to-end distributed traces across A → B → C.

### 6. Replay Engine

Replay captured traffic using `scripts/replay_engine.py`:

```bash
python scripts/replay_engine.py \
  --input data/captures/capture_001.ndjson \
  --output data/captures/capture_replay_001.ndjson \
  --count 30
```

* Confirms that requests are replayed to `service-a`.
* Verify new traces in Jaeger.
* Output capture saved to `data/captures/capture_replay_001.ndjson`.

### 7. Toxiproxy: Failure Injection

Toxiproxy allows controlled failures between services. Proxies are already created:

* `ab` → routes traffic from A → B (localhost:8666)
* `bc` → routes traffic from B → C (localhost:8667)

#### Add Failures (Toxics)

**Latency (ms)**

```bash
# A→B latency
curl -X POST http://localhost:8474/proxies/ab/toxics -d '{
  "name": "latency_ab",
  "type": "latency",
  "attributes": {"latency":500}
}'

# B→C latency
curl -X POST http://localhost:8474/proxies/bc/toxics -d '{
  "name": "latency_bc",
  "type": "latency",
  "attributes": {"latency":500}
}'
```

**Packet Loss**

```bash
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
```

**Abort / Timeout**

```bash
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
```

**Verify Toxics**

```bash
curl http://localhost:8474/proxies | jq
```

**Remove / Disable Toxics**

```bash
# Remove all toxics from a proxy
curl -X DELETE http://localhost:8474/proxies/ab/toxics

# Remove a specific toxic
curl -X DELETE http://localhost:8474/proxies/bc/toxics/latency_bc
```

### 8. Run Replay Under Failures

Replay requests while toxics are active:

```bash
# Latency scenario
python scripts/replay_engine.py \
  --input data/captures/capture_001.ndjson \
  --output data/captures/capture_failure_latency.ndjson \
  --count 30

# Packet loss scenario
python scripts/replay_engine.py \
  --input data/captures/capture_001.ndjson \
  --output data/captures/capture_failure_packetloss.ndjson \
  --count 30
```

### 9. Baseline Comparison

Compute metrics and compare failure vs normal:

```bash
python scripts/make_baseline.py \
  --baseline data/captures/capture_001.ndjson \
  --compare data/captures/capture_failure_latency.ndjson \
  --output data/baselines/failure_vs_normal.yaml
```

Metrics computed:

* `p50_ms` → median latency
* `p95_ms` → 95th percentile latency
* `error_rate` → fraction of failed requests

Output example (`data/baselines/failure_vs_normal.yaml`):

```yaml
sample_count: 151
p50_ms: 26.16
p95_ms: 35.66
error_rate: 0.1987
```
