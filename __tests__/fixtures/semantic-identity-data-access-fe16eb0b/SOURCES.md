# identity.data_access — fixture bodies captured from the mounted route

- Candidate: `fe16eb0bc34fa164d1c5f1abe8167001ad1caa3b` (tree `f7717573408c9a7ffe5fe9138a171eecf5ec2786`),
  branch `semantic/r274-identity-data-access` (local only; not pushed).
- Parent chain: `565dcdc0` → R273 closure (`67db31a4`, `8650a343`) → `d7a45965` (operation, reader, route,
  wiring, tests) → `fe16eb0b` (regenerated Decision contract, moved pins).
- Probe: `tests/decision/test_identity_data_access_route.py`, run with
  `IDENTITY_DATA_ACCESS_CAPTURE_DIR=<dir> python -m pytest tests/decision/test_identity_data_access_route.py`
  in a closed env (scratch HOME, null AWS config and credentials, IMDS off): 18 passed. A second capture was
  byte-identical (`diff -r` clean).
- Each file is `{"http_status": <int>, "body": <response JSON>}`. Only `provenance.generated_at` is removed
  (wall clock). The fixture clock is pinned at 2026-09-18T08:00:00Z, so `age_seconds` is 7200.

## What produced them

The REAL registered router (`api.identity_data_access.router`), the REAL `install_auth_boundary` in ENFORCE
mode, the REAL Decision seam (`unified.analyst.composition.build_decision_seam_from_env`, installed through
`unified.decision.startup.install_decision_runtime`), the REAL service-principal verifier and deployment
scope builder over an EXPLICITLY LABELLED SYNTHETIC FIXTURE grant (`tests/_review_synthetic_grant.py`), the
read-contract suites' labelled lifecycle authority, and the graph selected through the REAL Neptune
authority. Only the external graph transport is doubled: `FixtureDataAccessGraph`
(`tests/decision/test_identity_data_access_operation.py`), a labelled synthetic graph that answers the
product's exact statements and raises on any other. Bucket, role and table names are synthetic
(`fixture-…`); the account is the documentation placeholder `111122223333`. This is contract evidence, not
production evidence.

## The bodies

| file | state |
| --- | --- |
| 01-ready-populated | ready; `data_stores` COMPUTED with one S3 store (real `name`); `table_access` PARTIAL with an inferred row |
| 02-ready-genuine-empty | ready; `data_stores` COMPUTED `[]`; `table_access` NOT_COMPUTED (see deviation) |
| 03-ready-table-not-computed | ready; `data_stores` COMPUTED with rows; `table_access` NOT_COMPUTED (`…TABLE_COVERAGE_INCOMPLETE`) |
| 04-identity-unknown | refused `DECISION_IDENTITY_DATA_ACCESS_IDENTITY_NOT_FOUND` (absence) |
| 05-out-of-scope | refused `DECISION_IDENTITY_DATA_ACCESS_SCOPE_MISMATCH`, before any graph read |
| 06-lifecycle-refusal | refused `TENANT_LIFECYCLE_OFFBOARDED`, before any graph read |
| 07-unauthenticated-401 | HTTP 401 from the auth boundary, before routing |
| 08-partial-with-rows | ready; `data_stores` PARTIAL with rows; `missing_proofs: ["s3_access_logs"]` |
| 09-partial-empty | ready; `data_stores` PARTIAL `[]` (not established; never an empty) |
| 10-inferred-table-access | ready; `table_access` PARTIAL, `link_basis: INFERRED_FLOW_LOG_CORRELATION` on the part and every row |

Every ready body carries `scope.resolved_by: "server"`, `serving_generation {generation, last_sync,
freshness_status, age_seconds, max_age_seconds}`, `provenance.freshness.serving_graph {generation,
last_sync, status}`, `evidence_sources: ["Neptune Serving Graph"]`, and `allowed_operations: null` with
`DECISION_IDENTITY_DATA_ACCESS_ALLOWED_OPERATIONS_UNSUPPORTED` on every store.

## Deviation from the consumer contract

Body 2 was asked for as "both parts computed, zero rows". `table_access` can never be COMPUTED: its role link
is inferred from flow-log correlation, so absence can never be established. Body 2 is the nearest real body
(`data_stores` COMPUTED `[]`); the requested one does not exist and was not hand-written.

## Open

- Real-engine: the operation's five statements have never run on Neptune (open gate, as for the pointer).
- CI metadata pending Root: the P0 census (`route-census.json`, `source-map.json`), one consumer-ledger row,
  and one graph-read ratchet exception (category + baseline). None changes a served body.
