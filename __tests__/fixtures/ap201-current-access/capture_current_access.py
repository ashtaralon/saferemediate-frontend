"""TEST_ONLY capture (AP201 / CP-B): the by-crown-jewel summary, every path's detail, the target catalog and the list,
as the REAL enforce-mode attack-path router serves them from a receipted publication in moto DynamoDB.

Not a product test. It reuses ``tests/test_attack_paths_list_publication.py``'s harness verbatim: the real projection
builder over ``tests/test_attack_path_evidence_contract``'s rows (SUBSTITUTED graph, labelled there), the phase-3
binder's network observation fields, the real publishers / receipts, the real router under
``CYNTRO_SERVING_READ_GUARD=enforce``. It writes the served bodies to ``AP201_CAPTURE_DIR`` with a manifest so the
frontend can test its rendering against producer-shaped bodies instead of hand-written ones.

Never commit this file; never ship the bodies as product data (UI-31).
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from tests.test_attack_paths_list_publication import (  # noqa: F401 -- the harness, verbatim
    A,
    A_VERSION,
    LIST,
    SYSTEM,
    _publish,
    _published_paths,
    aws,
    enforced,
    gated,
    projection,
)

OUT = Path(os.environ.get("AP201_CAPTURE_DIR", "/tmp/ap201-capture"))


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _write(name: str, body: bytes) -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_bytes(body)
    return {"file": name, "sha256": _sha(body), "bytes": len(body)}


def test_capture_current_access_bodies(aws, monkeypatch, projection):
    _publish(monkeypatch, aws, A, A_VERSION, network_only=True)
    published = _published_paths(aws, A)
    tenant, account, jewel = A
    entries = []

    def grab(name, path, **params):
        response = projection(A, path, **params)
        body = response.content
        entry = _write(name, body)
        entry.update({"path": path, "params": params, "status": response.status_code})
        try:
            parsed = json.loads(body)
            entry["top_level_keys"] = sorted(parsed.keys()) if isinstance(parsed, dict) else type(parsed).__name__
            if isinstance(parsed, dict) and "semantic_status" in parsed:
                entry["semantic_status"] = parsed.get("semantic_status")
                entry["hold_reason"] = parsed.get("hold_reason")
        except ValueError:
            entry["top_level_keys"] = None
        entries.append(entry)
        return response

    grab("targets.json", f"/api/attack-paths/{SYSTEM}/targets")
    grab("list.json", LIST, include_configured=True)
    summary = grab("by-crown-jewel-summary.json", f"/api/attack-paths/{SYSTEM}/by-crown-jewel/summary", cj_arn=jewel)
    for raw in published:
        pid = raw["id"]
        grab(f"by-crown-jewel-detail-{pid[-12:]}.json", f"/api/attack-paths/{SYSTEM}/by-crown-jewel/detail",
             cj_arn=jewel, path_id=pid)

    head = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=Path(__file__).parents[1]).stdout.strip()
    manifest = {
        "kind": "TEST_ONLY_CAPTURE",
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "backend_commit": head,
        "harness": "tests/test_attack_paths_list_publication.py (real projection builder + publishers + enforce router; SUBSTITUTED graph rows)",
        "scope": {"tenant": tenant, "account": account, "jewel": jewel, "system": SYSTEM, "version": A_VERSION},
        "python": sys.version.split()[0],
        "published_path_ids": [raw["id"] for raw in published],
        "entries": entries,
        "not_a_claim": "No installed, live or customer data. Rendering/contract checks only.",
    }
    (OUT / "MANIFEST.json").write_text(json.dumps(manifest, indent=2, sort_keys=True))
    # The capture is useful only when the summary answered; say so loudly either way.
    assert summary.status_code in (200, 503), summary.text[:400]
