FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt
COPY app.py /app/app.py
ENV OTEL_RESOURCE_ATTRIBUTES=service.name=service-a
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
ENV OTEL_TRACES_EXPORTER=otlp
CMD uvicorn app:app --host 0.0.0.0 --port 8080

