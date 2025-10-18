import time
from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
import httpx, os
import logging
from json import JSONDecodeError

logger = logging.getLogger("service-a")

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
    start = time.perf_counter()
    # Always count the incoming request
    request_count.labels(service="service-a", endpoint="/checkout").inc()

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Call B through Toxiproxy (may fail due to toxics)
            r = await client.get(f"{SERVICE_B_URL}/charge")
            r.raise_for_status()
            body = r.json()
            return {"service": "A", "downstream": body}

    except (httpx.RequestError, httpx.HTTPStatusError, JSONDecodeError) as e:
        # Count ANY downstream error (network, status, bad JSON)
        error_count.labels(service="service-a", endpoint="/checkout").inc()
        logger.warning("Downstream error talking to B: %s", e)
        return JSONResponse(
            {"error": "downstream_request_error", "detail": str(e)},
            status_code=502,
        )

    except Exception as e:
        # Belt-and-suspenders: catch anything unexpected too
        error_count.labels(service="service-a", endpoint="/checkout").inc()
        logger.exception("Unexpected error in /checkout: %s", e)
        return JSONResponse(
            {"error": "unexpected_error", "detail": str(e)},
            status_code=500,
        )

    finally:
        # Always observe latency
        request_latency.labels(service="service-a", endpoint="/checkout").observe(
            time.perf_counter() - start
        )


# quick probe to emit a span on-demand for debugging
@app.get("/trace-probe")
def trace_probe():
    tr = trace.get_tracer(__name__)
    with tr.start_as_current_span("trace-probe-span"):
        pass
    return {"ok": True}
