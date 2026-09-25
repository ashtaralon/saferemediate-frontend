"""Capture the IAP route's HELD / UNAVAILABLE answers from the backend's own code.

Run from a backend checkout at 7889920a5caef9c156c1eeb35cabc15986fee357 with
tests/ importable, e.g.:  python -m pytest -q -p no:cacheprovider <this file>
Writes the JSON path given by $CYNTRO_HOLD_CAPTURE_OUT.

Nothing below is hand-written: every body is what a real FastAPI TestClient
received from the real code named next to it.
"""
import json
import os

import tests.test_attack_path_evidence_contract as t
from tests.test_iap_publication_receipts import aws, gated  # noqa: F401 -- fixtures


def _record(response):
    return {"status": response.status_code,
            "cache_control": response.headers.get("cache-control"),
            "body": response.json()}


def test_capture_holds(aws, gated, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from cyntro_data.semantic import serving_read_guard as guard
    from cyntro_data.semantic.estate_read import EstateRead, finish_estate_read

    out = {}
    # A published, B not: the real gated IAP router answering for B.
    t._publish(aws, t.A, t.A_VERSION)
    gated.versions.update({(t.A[0], t.A[1]): t.A_VERSION, (t.B[0], t.B[1]): t.B_VERSION})

    # 1. Install (guard enforce): B's readers are not CONSUMER_READY -> typed not_recorded hold.
    monkeypatch.setenv("CYNTRO_SERVING_READ_GUARD", "enforce")
    out["install_not_recorded"] = _record(gated(t.B, "/payments"))

    # 2. C1 (guard off): the live read failed -> legacy 200, labelled unavailable.
    monkeypatch.delenv("CYNTRO_SERVING_READ_GUARD", raising=False)
    out["c1_unavailable"] = _record(gated(t.B, "/payments"))

    # 3. Install: a failed reader body -> finish_estate_read's typed 503.
    monkeypatch.setenv("CYNTRO_SERVING_READ_GUARD", "enforce")
    read = EstateRead(customer_id=t.A[0], account_id=t.A[1], region="eu-west-1",
                      generation_status="ACTIVE", graph_version=t.A_VERSION, coverage={"complete": True})
    reader_app = FastAPI()

    @reader_app.get("/api/identity-attack-paths/{system_name}")
    def _failed_reader(system_name: str):
        return finish_estate_read(read, {"error": "503: Neo4j not connected", "paths": [], "crown_jewels": []})

    out["install_semantic_read_unavailable"] = _record(
        TestClient(reader_app, raise_server_exceptions=False).get("/api/identity-attack-paths/payments"))

    # 4. Install: the serving-read guard refuses a held customer read -> typed 503.
    guard_app = FastAPI()

    @guard_app.get("/api/identity-attack-paths/{system_name}")
    def _guarded(system_name: str):
        guard.check_read(mode=guard.ENFORCE, caller_resolver=lambda: "api/identity_attack_paths.py")
        return {"unreachable": True}

    guard_app.add_middleware(guard._RefusedReadResponse)
    out["install_serving_read_refused"] = _record(
        TestClient(guard_app, raise_server_exceptions=False).get("/api/identity-attack-paths/payments"))

    for name, rec in out.items():
        assert t.A[1] not in json.dumps(rec) or name == "install_semantic_read_unavailable", name
    with open(os.environ["CYNTRO_HOLD_CAPTURE_OUT"], "w") as fh:
        fh.write(json.dumps(out, indent=1, sort_keys=True))
