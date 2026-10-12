# Resumable System setup, contract level 2 (onboarding G3-A): producer captures

The real answers of the backend's `/api/system-boundary/setup*` routes at setup contract level 2: every success answer carries
`contract: system_boundary_setup/v2`, and a finished setup's status lists its owner requests. Each file is a byte-for-byte
copy of `tests/fixtures/system_boundary_setup_captures_v2/` at saferemediate-backend
**3a2756c9a292d43e2830bb50cc5d65da0c77e6a7** (branch claude/onboarding-g3-selected-work; G3-C.5: each made request's
status carries `observation` -- in the capture harness the coverage route has no scope, so it is UNKNOWN COVERAGE_NOT_ADMITTED). That commit's
`tests/test_system_boundary_setup_captures.py::test_the_real_setup_route_answers_are_exactly_the_captures` asserts the mounted
routes still answer exactly these.

How they were captured: the same harness as the level-1 copies beside this directory (`../system-boundary-setup-captures/`,
backend 9ad9be86, kept as level-1 evidence: this frontend refuses those untagged answers). Pinned: the setup module's clock and
uuid source, the save clock, and the request ids posted. Each file's `_provenance` names the request.

Never edit these by hand. Re-copy them from the backend commit that asserts them, and update the SHA above.
