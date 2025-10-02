import os
from fastapi import FastAPI
import httpx


from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# We'll choose HTTP or gRPC exporter based on env var
PROTO = os.getenv("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf").lower().strip()
ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT",
                     "otel-collector:4317" if PROTO == "grpc" else "http://otel-collector:4318")
INSECURE = os.getenv("OTEL_EXPORTER_OTLP_INSECURE", "true").lower() in ("1", "true", "yes")
SERVICE_NAME = os.getenv("OTEL_SERVICE_NAME", "service-c")

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


from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

app = FastAPI()
FastAPIInstrumentor().instrument_app(app)

@app.get("/health")
def health():
    return {"status": "ok", "service": "C"}

@app.get("/inventory")
def inventory():
    return {"service": "C", "stock": 42}
