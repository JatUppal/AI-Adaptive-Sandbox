import os
import json
import tempfile
from unittest import mock

import pytest

from scripts import build_dataset


class DummyResponse:
    def __init__(self, payload):
        self._payload = payload
        self.status_code = 200


    def raise_for_status(self):
        return None


    def json(self):
        return self._payload
    
def fake_prom_response_scalar(val):
    return {"status": "success", "data": {"resultType": "vector", "result": [{"value": ["0", str(val)]}]}}

def test_build_rows_and_write(tmp_path, monkeypatch):
    # Monkeypatch requests.get to return deterministic Prometheus and toxiproxy responses
    def fake_get(url, params=None, timeout=5):
        if "/api/v1/query" in url:
            q = params.get("query", "")
            # return a small non-zero value for rate queries
            if "rate(request_count_total" in q:
                return DummyResponse(fake_prom_response_scalar(0.5))
            if "rate(error_count_total" in q:
                return DummyResponse(fake_prom_response_scalar(0.0))
            if "histogram_quantile(0.50" in q:
                return DummyResponse(fake_prom_response_scalar(0.02))
            if "histogram_quantile(0.95" in q:
                return DummyResponse(fake_prom_response_scalar(0.05))
            return DummyResponse({"status": "success", "data": {"result": []}})
        if "/proxies/" in url:
            # return proxy with no toxics
            return DummyResponse({"name": "ab", "toxics": []})
        return DummyResponse({"status": "success", "data": {"result": []}})
    
    monkeypatch.setattr(build_dataset.requests, "get", fake_get)

    out = tmp_path / "out.csv"
    rows = build_dataset.build_rows("http://localhost:9090", window=60, minutes=2, service="service-a", threshold_p95_ms=700, toxiproxy_url="http://localhost:8474")
    assert len(rows) > 0
    build_dataset.write_csv(str(out), rows)
    assert out.exists()
    text = out.read_text()
    assert "p95_ms" in text