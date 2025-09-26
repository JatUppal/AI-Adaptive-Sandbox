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
