# AP201 · Current Access fixtures — provenance

These JSON files are **backend route output served by the real enforce-mode attack-path router** from a receipted
publication in moto DynamoDB, captured by `capture_current_access.py` (kept beside them verbatim; it ran as an
untracked test file in a detached checkout of backend `origin/release/resident`, commit in `MANIFEST.json`).

They are **not** a production capture, **not** from any installed system or C1, and **not** acceptance evidence.
Their input rows are the backend's own synthetic fixture rows (`tests/test_attack_path_evidence_contract.py`), in
the producer's field shape, with the phase-3 binder's network-observation fields
(`tests/test_attack_paths_list_publication.py`). Nothing here was written by hand. They exist so the frontend can
test rendering and contract handling against producer-shaped bodies (UI-31).

| file | route |
|---|---|
| `targets.json` | `GET /api/attack-paths/payments/targets` |
| `list.json` | `GET /api/attack-paths/payments?include_configured=true` |
| `by-crown-jewel-summary.json` | `GET /api/attack-paths/payments/by-crown-jewel/summary?cj_arn=arn:aws:s3:::acme-data` |
| `by-crown-jewel-detail-*.json` | `GET …/by-crown-jewel/detail?cj_arn=…&path_id=<published id>` (one per published path) |

What is REAL in the chain: the projection builder, the publishers and receipt protocol, the enforce-mode router and
its hold wrap, the summary/detail/catalog serializers. What is SUBSTITUTED (labelled in the harness): the Neptune
graph read (fixture rows), the Estate gate's pointer read, the scanner read.

Run recipe (from a clean backend checkout, the file copied to `tests/`):
`env -i HOME=<scratch> PATH=/usr/bin:/bin AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null
AWS_EC2_METADATA_DISABLED=true AWS_DEFAULT_REGION=eu-west-1 AP201_CAPTURE_DIR=<out>
~/.cyntro-ci-venv/3.13.4/bin/python -m pytest tests/capture_current_access.py -x -q -p no:cacheprovider`
