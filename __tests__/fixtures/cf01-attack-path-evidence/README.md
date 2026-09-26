# CF01 · attack-path evidence contract fixtures — provenance

These JSON files are **backend route output captured from the backend's own test
harness**. The input `:AttackPath` rows behind them are **explicitly synthetic
fixture rows** in the producer's field shape. They are **not** a production
capture, **not** a response from any deployed install or from C1, and **not**
proof of installed coverage. Nothing in them was written by hand.

| | |
|---|---|
| Backend commit | `7889920a5caef9c156c1eeb35cabc15986fee357` (branch `claude/cf01-attack-path-evidence-contract`), clean tree (`git status --short` empty when the holds were captured and when the two-customer file was reproduced byte-for-byte) |
| Harness | `tests/test_attack_path_evidence_contract.py` + the `aws` / `gated` fixtures of `tests/test_iap_publication_receipts.py` |
| Runtime | `~/.cyntro-ci-venv/3.13.4/bin/python`, `env -i` with `AWS_CONFIG_FILE=/dev/null`, `AWS_SHARED_CREDENTIALS_FILE=/dev/null`, `AWS_EC2_METADATA_DISABLED=true`, a scratch `HOME` |

## `iap-payments-two-customers.json` (35,116 B)

Recipe: `capture_route.py`, kept beside it **verbatim** as the capturing session
wrote it. Two edits are needed to re-run it: its output path is that session's
scratchpad, and it uses the `aws` / `gated` fixtures without importing them, so
pytest reports `fixture 'aws' not found` until you prepend
`from tests.test_iap_publication_receipts import aws, gated`. With exactly those
two edits, run the same way as the holds recipe below, it reproduced this file
**byte-for-byte** (verified 2026-09-25 against a clean `7889920a5` checkout).

Two customers, `acme` (account `111111111111`) and `beta` (account
`222222222222`), each with one S3 crown jewel and **4 paths**, one per
classification: `observed`, `unknown` (evidence `unverified`), `inferred`
(evidence `configured`) and `blocked`.

What is REAL in the chain:
- the producer path builder `unified/iap/materialized_paths.build_path_stub_from_materialized`,
  which builds each path stub (and its `evidence_contract`) from the rows;
- the receipted publication `services.iap_snapshot_projection.publish_live_iap_generation`
  into **moto** DynamoDB (receipts, pointer);
- the real gated IAP router `api.identity_attack_paths`, served in-process for each
  tenant's pinned scope (`GET .../payments`).

What is SUBSTITUTED (labelled in the harness itself): the materialized rows are
fixture rows (no graph is run), and the Estate gate's one pointer read is
answered per scope by a monkeypatched `validated_inventory_generation`.

## `iap-payments-holds.json` (1,360 B)

Recipe: `capture_holds.py` (beside it). The route's five "I cannot tell you"
answers, each exactly as a FastAPI `TestClient` received it (re-captured on
2026-09-25 to add the fifth; the other four came back identical apart from the
C1 body's `timestamp`):

| key | status | produced by |
|---|---|---|
| `install_not_recorded` | 200 | real gated router, `CYNTRO_SERVING_READ_GUARD=enforce`, `beta` never published → `semantic_status: not_recorded`, `hold_reason: CONSUMER_READINESS_UNOBSERVABLE` |
| `c1_unavailable` | 200 | real gated router, guard off (C1 legacy mode), same scope → `error` + `semantic_status: unavailable` |
| `install_semantic_read_unavailable` | 503 | `cyntro_data.semantic.estate_read.finish_estate_read` in enforce mode, given the backend test's own failed-reader body (`{"error": "503: Neo4j not connected", "paths": [], "crown_jewels": []}`) inside a one-route FastAPI app |
| `install_serving_route_held` | 503 | `cyntro_data.semantic.estate_read.held_route_refusal()` raised from a one-route FastAPI app → `SERVING_ROUTE_HELD: HELD_CUSTOMER_READ` |
| `install_serving_read_refused` | 503 | `cyntro_data.semantic.serving_read_guard.check_read(mode=ENFORCE, caller_resolver=lambda: "api/identity_attack_paths.py")` behind the guard's own `_RefusedReadResponse` middleware → `FACADE_READ_OUTSIDE_ADMISSION` |

The `error` string in `c1_unavailable` is what the harness's router said when it
had no graph driver; it is not a message from any deployed backend.

## Re-running

```sh
cd <backend checkout at 7889920a5caef9c156c1eeb35cabc15986fee357>
env -i PATH="$HOME/.cyntro-ci-venv/3.13.4/bin:/usr/bin:/bin" HOME="$(mktemp -d)" \
  AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null AWS_EC2_METADATA_DISABLED=true \
  PYTHONPATH="$PWD" CYNTRO_HOLD_CAPTURE_OUT=<frontend>/__tests__/fixtures/cf01-attack-path-evidence/iap-payments-holds.json \
  python -m pytest -q -p no:cacheprovider --rootdir="$PWD" <frontend>/__tests__/fixtures/cf01-attack-path-evidence/capture_holds.py
```

A later backend that changes the evidence contract, the hold bodies or the
refusal codes will produce different bytes; regenerate from that commit and
record it here rather than editing the JSON.
