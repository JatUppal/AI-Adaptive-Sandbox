from fastapi import FastAPI, Response
import httpx, os
from json import JSONDecodeError

# ------------------------ Prometheus Metrics ------------------------
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

request_count = Counter('request_count_total', 'Total request count', ['service', 'endpoint'])
error_count = Counter('error_count_total', 'Total error count', ['service', 'endpoint'])
request_latency = Histogram('request_latency_seconds', 'Request latency', ['service', 'endpoint'])

# ------------------------ OpenTelemetry SDK setup ------------------------
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# We'll choose HTTP or gRPC exporter based on env var
PROTO = os.getenv("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf").lower().strip()
ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT",
                     "otel-collector:4317" if PROTO == "grpc" else "http://otel-collector:4318")
INSECURE = os.getenv("OTEL_EXPORTER_OTLP_INSECURE", "true").lower() in ("1", "true", "yes")
SERVICE_NAME = os.getenv("OTEL_SERVICE_NAME", "service-a")

if PROTO == "http" or PROTO == "http/protobuf":
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    exporter = OTLPSpanExporter(endpoint=f"{ENDPOINT.rstrip('/')}/v1/traces")
else:
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    exporter = OTLPSpanExporter(endpoint=ENDPOINT, insecure=INSECURE)

resource = Resource.create({"service.name": SERVICE_NAME})
provider = TracerProvider(resource=resource)
provider.add_span_processor(BatchSpanProcessor(exporter))
trace.set_tracer_provider(provider)
# ------------------------------------------------------------------------

# Auto-instrument frameworks/clients
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

SERVICE_B_URL = os.getenv("SERVICE_B_URL", "http://service-b:8080")

app = FastAPI()
FastAPIInstrumentor().instrument_app(app)
HTTPXClientInstrumentor().instrument()

@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/health")
def health():
    return {"status": "ok", "service": "A"}

@app.get("/checkout")
async def checkout():
    import time
    start_time = time.time()
    request_count.labels(service='service-a', endpoint='/checkout').inc()
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{SERVICE_B_URL}/charge")
        try:
            r.raise_for_status()
            body = r.json()
        except JSONDecodeError:
            body = {"non_json_body": r.text}
        except httpx.HTTPStatusError as e:
            error_count.labels(service='service-a', endpoint='/checkout').inc()
            body = {"error": str(e), "status_code": r.status_code, "body": r.text}
        
        return {"service": "A", "downstream": body}
    finally:
        request_latency.labels(service='service-a', endpoint='/checkout').observe(time.time() - start_time)

# quick probe to emit a span on-demand for debugging
@app.get("/trace-probe")
def trace_probe():
    tr = trace.get_tracer(__name__)
    with tr.start_as_current_span("trace-probe-span"):
        pass
    return {"ok": True}
