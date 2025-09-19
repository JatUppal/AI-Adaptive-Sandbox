# Adaptive Testing & Debugging Sandbox — MVP Flow Draft

## Executive Summary

This project is like a practice arena for microservices.

**Phase 0.1 (Live Observation)**: We watch how services normally talk to each other and record those interactions.

**Phase 0.2 (Sandbox Replay)**: We replay the same traffic in a safe environment, inject one failure (like delay or dropped request), and see how the system reacts.

👉 These phases don't run at the same time. First we capture and learn (Phase 0.1), then we replay and test (Phase 0.2).

## Analogy for Beginner Developers

Think of it like debugging a multiplayer game:

In **Phase 0.1**, you just watch how players move and interact in real matches. You write down what "normal" looks like (e.g., most players move at speed X).

In **Phase 0.2**, you replay the same match in a training mode, but this time you add an obstacle or slow one player down to see how the whole game reacts.

## High-Level Flow

**Phase 0.1: Capture → Baseline → Detect → Notify → Transition → → → Phase 0.2: Replay → Inject → Detect → Notify**

```mermaid
graph TD
    Start([Start MVP]) --> Phase1[Phase 0.1: Live Observation]
    
    subgraph "Phase 0.1 --- Watch + Learn"
        Phase1 --> Capture[📹 Capture Real Traffic]
        Capture --> Analyze[🔍 Analyze Patterns]
        Analyze --> Baseline[📊 Build Normal Baseline]
        Baseline --> Detect[🚨 Detect Anomalies]
    end
    
    Detect --> Wait[⏸️ Phase Transition]
    Wait --> Phase2[Phase 0.2: Sandbox Testing]
    
    subgraph "Phase 0.2 - Test Safely"
        Phase2 --> Setup[🏗️ Setup Sandbox Environment]
        Setup --> Replay[▶️ Replay Captured Traffic]
        Replay --> Inject[💉 Inject One Failure]
        Inject --> Watch[👀 Watch System React]
        Watch --> Report[📝 Generate Report]
        Report --> Notify[📲 Send Slack Email]
    end
    
    Notify --> End([End])
    
    style Phase1 fill:#e1f5fe
    style Phase2 fill:#fff3e0
```

## Step-by-Step Flow

### Phase 0.1: Live Observation

1. **Capture traffic** — Use OpenTelemetry to record real requests between services.
2. **Build a baseline** — Measure what's "normal" (e.g., Service B usually replies in 200ms with <2% errors).
3. **Detect changes** — If future runs show slower replies or higher error rates, we flag it.
4. **Notify** — Send a Slack/email with a short summary of what changed.

### Phase 0.2: Sandbox Replay

1. **Replay traffic** — Re-run the same captured requests in a safe test environment.
2. **Inject one failure** — Add either artificial delay or drop a request using Toxiproxy.
3. **Observe effects** — Measure how the system reacts under failure.
4. **Notify** — Send another alert/report explaining which service failed first and by how much.

## Tech Stack (MVP)

- **OpenTelemetry + Collector** → the “microphones and video camera” 🎤📹

    - Captures every conversation between services (A → B → C).

    - The Collector exports those traces into a neat JSON/NDJSON file (the “recording”) so we can replay later.

- **Jaeger** → the “video player” 🎬

    - Stores and visualizes those service traces.

    - Lets us rewind and see: “Oh, Service B was 200ms slower here.”

- **Prometheus + Grafana** → the “scoreboard and scoreboard screen” 📊

    - Prometheus = collects metrics (how fast, how many errors).

    - Grafana = dashboard to make those numbers look understandable (charts, alerts).

- **Python (asyncio + httpx)** → the “replay engine” ▶️

    - Reads the captured JSON bundle.

    - Replays requests in the same order/timing as the original run.

    - Easy for us devs to write quickly (asyncio for timing, httpx for HTTP).

- **Toxiproxy** → the “mischief remote control” 💉

    - Lets us break one thing on purpose (add delay, drop a request).

    - Example: “Make Service B 200ms slower this run.”

- **Docker Compose** → the “sandbox builder” 🏗️

    - Spins up local copies of Jaeger, Prometheus, Grafana, Toxiproxy, and our services in one simple config file.

    - Lighter weight than Kubernetes — faster for MVP development.

- **Slack Webhooks** → the “alarm bell” 🚨

    - When anomalies are detected, send a short message straight to Slack:

    - Example: “⚠️ Service B latency +40% (220ms → 310ms).”

- **JSON/YAML files** → the “notebooks and rulebooks” 📒

    - Capture bundles (what we recorded), replay reports, and failure injection configs all live here.

    - Example: capture_001.json, replay_run_007.json, failure.yaml.

    - Makes tests reproducible without needing a database.


## Simple BDD Conditions

### When Things Are Normal:
- **GIVEN** Service A usually responds in 50-100ms
- **WHEN** Service A responds in 75ms
- **THEN** Mark as "✅ Normal"

### When Things Go Wrong:
- **GIVEN** Service B normally handles 100 requests/minute
- **WHEN** Service B suddenly drops to 10 requests/minute
- **THEN** Send alert: "⚠️ Service B is really slow!"

### During Testing:
- **GIVEN** We're in sandbox mode with fake traffic
- **WHEN** We make Database connection 50% slower
- **THEN** Measure if checkout still works or times out

## Simple Testing Rules

- If p95 latency increases by 20%, send alert.
- If error rate increases by >2%, send alert.
- Always flag the first failing service in the chain.

# Data Flow Chart - Adaptive Testing & Debugging Sandbox

## Complete Data Flow Diagram

```mermaid
graph TB
    subgraph "📡 Real Production Environment"
        User([👤 Real Users]) -->|HTTP Requests| ServiceA[Service A]
        ServiceA -->|API Calls| ServiceB[Service B]
        ServiceB -->|Database Queries| ServiceC[Service C/DB]
    end
    
    subgraph "🎥 PHASE 0.1: LIVE OBSERVATION"
        ServiceA -->|Traces| OTel1[OpenTelemetry Agent A]
        ServiceB -->|Traces| OTel2[OpenTelemetry Agent B]
        ServiceC -->|Traces| OTel3[OpenTelemetry Agent C]
        
        OTel1 -->|Export| Collector[OTel Collector]
        OTel2 -->|Export| Collector
        OTel3 -->|Export| Collector
        
        Collector -->|Store Traces| Jaeger[(Jaeger Storage)]
        Collector -->|Export Metrics| Prometheus[(Prometheus)]
        Collector -->|Save Raw Data| JSON1[(capture_001.json)]
        
        Prometheus -->|Query| Grafana[Grafana Dashboard]
        
        JSON1 -->|Analyze| Baseline[📊 Baseline Builder]
        Baseline -->|Generate| Normal[(normal_baseline.yaml)]
        
        Normal -->|Compare| Detector[🚨 Anomaly Detector]
        Detector -->|If Anomaly| Slack1[Slack Alert]
    end
    
    Normal -.->|Phase Transition| Phase2Start
    JSON1 -.->|Phase Transition| Phase2Start
    
    subgraph "🎮 PHASE 0.2: SANDBOX REPLAY"
        Phase2Start([Start Sandbox]) -->|Read| JSON1Read[(capture_001.json)]
        Phase2Start -->|Read| NormalRead[(normal_baseline.yaml)]
        
        JSON1Read -->|Parse| Replay[Python Replay Engine]
        
        subgraph "🏗️ Docker Compose Environment"
            Replay -->|Replay Requests| MockA[Mock Service A]
            MockA -->|Through| Proxy1[Toxiproxy A]
            Proxy1 -->|To| MockB[Mock Service B]
            MockB -->|Through| Proxy2[Toxiproxy B]
            Proxy2 -->|To| MockC[Mock Service C]
            
            FailureConfig[(failure.yaml)] -->|Configure| Proxy1
            FailureConfig -->|Configure| Proxy2
        end
        
        MockA -->|Traces| OTelSand1[OTel Agent Mock A]
        MockB -->|Traces| OTelSand2[OTel Agent Mock B]
        MockC -->|Traces| OTelSand3[OTel Agent Mock C]
        
        OTelSand1 -->|Export| CollectorSand[Sandbox OTel Collector]
        OTelSand2 -->|Export| CollectorSand
        OTelSand3 -->|Export| CollectorSand
        
        CollectorSand -->|Store| JaegerSand[(Sandbox Jaeger)]
        CollectorSand -->|Metrics| PromSand[(Sandbox Prometheus)]
        CollectorSand -->|Save Results| ReplayJSON[(replay_run_007.json)]
        
        ReplayJSON -->|Compare With| NormalRead
        NormalRead -->|Analysis| Reporter[📝 Report Generator]
        Reporter -->|Generate| FinalReport[(failure_impact_report.json)]
        FinalReport -->|Send| Slack2[Slack/Email Report]
    end
    
    style User fill:#ffd54f
    style Slack1 fill:#ff6b6b
    style Slack2 fill:#ff6b6b
    style Baseline fill:#4fc3f7
    style Detector fill:#ffa726
    style Reporter fill:#66bb6a
    style FailureConfig fill:#ef5350
```

## Simplified Data Flow - Key Data Points

```mermaid
flowchart LR
    subgraph "Data Sources"
        RT[Real Traffic] 
        MT[Metrics]
        TR[Traces]
    end
    
    subgraph "Phase 0.1 Storage"
        RT --> CAP[capture_001.json]
        MT --> PROM[(Prometheus)]
        TR --> JAEG[(Jaeger)]
        CAP --> BASE[normal_baseline.yaml]
    end
    
    subgraph "Phase 0.2 Input"
        CAP --> REPLAY[Replay Engine]
        BASE --> COMPARE[Comparator]
        FAIL[failure.yaml] --> TOX[Toxiproxy]
    end
    
    subgraph "Phase 0.2 Output"
        REPLAY --> RESULT[replay_run_007.json]
        RESULT --> REPORT[failure_impact_report.json]
        REPORT --> ALERT[Slack/Email]
    end
    
    style RT fill:#e3f2fd
    style FAIL fill:#ffebee
    style ALERT fill:#f3e5f5
```

## Data Transformation Pipeline

```mermaid
graph LR
    subgraph "Raw Data"
        A1[HTTP Headers]
        A2[Request Bodies]
        A3[Response Times]
        A4[Status Codes]
    end
    
    subgraph "Structured Data"
        A1 --> B1[OpenTelemetry Spans]
        A2 --> B1
        A3 --> B2[Prometheus Metrics]
        A4 --> B2
    end
    
    subgraph "Stored Formats"
        B1 --> C1[JSON Traces]
        B2 --> C2[Time Series Data]
        C1 --> C3[Baseline YAML]
        C2 --> C3
    end
    
    subgraph "Analysis Results"
        C3 --> D1[Anomaly Flags]
        C3 --> D2[Performance Deltas]
        D1 --> D3[Alert Messages]
        D2 --> D3
    end
    
    style A1 fill:#fff3e0
    style C1 fill:#e8f5e9
    style D3 fill:#ffcdd2
```

## Key Data Files & Formats

| File | Purpose | Format | Example Content |
|------|---------|--------|-----------------|
| `capture_001.json` | Stores captured real traffic | JSON/NDJSON | Request headers, bodies, timings |
| `normal_baseline.yaml` | Defines "normal" behavior | YAML | p50: 50ms, p95: 100ms, error_rate: 0.01 |
| `failure.yaml` | Configures injected failures | YAML | service: B, type: latency, value: 200ms |
| `replay_run_007.json` | Stores sandbox test results | JSON | Actual vs expected metrics |
| `failure_impact_report.json` | Final analysis report | JSON | Which services degraded, by how much |

## Data Flow Summary

1. **Real traffic** flows through production services
2. **OpenTelemetry agents** capture every interaction
3. **Collector** aggregates and exports to multiple destinations
4. **Phase 0.1** builds baseline from captured data
5. **Phase transition** moves captured data to sandbox
6. **Phase 0.2** replays data through Toxiproxy-wrapped services
7. **Comparison engine** detects deviations from baseline
8. **Reports** flow to Slack/Email for human review

*Note: Dotted lines (- - -) represent phase transitions where data moves from observation to testing phase.*
---

## Why It Matters

Instead of waiting for production outages, this sandbox helps us:

- Understand what "normal" looks like in our system.
- Test failures safely before real users are impacted.
- Find weak spots early, saving debugging time and avoiding downtime.
- This is like building a safety net: we first watch the real system, then practice breaking it in a safe copy so we know how to react before real users are impacted.
