# Draft preview and preview-bearing Finish (setup contract level 4, S1a): producer captures

The real answers of the backend's `/api/system-boundary/setup*` routes for a CloudFormation-bound draft: the preview
(`system_boundary_setup_preview/v1`, tagged `setup_contract: system_boundary_setup/v4`), its pages, the refusals a person can
meet (stale version, FINISHED, PREVIEW_REQUIRED, PREVIEW_CHANGED, PREVIEW_NOT_COMPUTED, PREVIEW_INPUT_CHANGED), the Finish that
pins the preview (`receipt.preview`), its replay, and the setups read back. `census_collected.json` is the account census at the collected
depth (`account_census_read/v1`, the census route mounted with the enforced serving guard on the same install): the bound
stack's resources the guided setup offers per-resource decisions on. The `*_unrecorded` files are a refusal the backend could not
record (the authoring grant revoked before the refusal was recorded: `detail.setup.recorded=false`, FINISHING, GRANT_REVOKED)
and the setup read back still FINISHING. Each file is a byte-for-byte copy of
`tests/fixtures/system_boundary_setup_preview_captures/` at saferemediate-backend
**0fef0bdc87d2dd34d6d629fe53ce52f490c4eeb5** (branch claude/onboarding-s1a, local).

How they were captured: `tests/cyntro_data/test_system_boundary_preview_captures.py` on the CF harness of
`test_system_boundary_preview_cf.py` -- the inventory and census published by their REAL producers, the REAL setup routes and
guarded save, and for the computed preview the route's OWN production sources (enforced serving guard, the tenant's
evidence-read path). Each file's `_provenance` names the request.

NOT byte-stable: ids, digests and times are ONE real run's (the harness publishes its census at the wall clock and mints setup
ids). The backend test asserts each answer's status, cache header, contract tags, state, refusal code and whole shape (every
key at every depth, with its JSON type) against these files; it does not assert the bytes. Values that vary are never
compared across files here except where one answer names another (a digest the Finish was sent, a cursor a page returned).

Never edit these by hand. Re-copy them from the backend commit that asserts them, and update the SHA above.
