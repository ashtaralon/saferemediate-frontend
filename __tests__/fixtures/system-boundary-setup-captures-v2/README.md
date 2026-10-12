# Resumable System setup, contract level 2 (onboarding G3-A): producer captures

The real answers of the backend's `/api/system-boundary/setup*` routes at setup contract level 2: every success answer carries
`contract: system_boundary_setup/v2`, and a finished setup's status lists its owner requests. Each file is a byte-for-byte
copy of `tests/fixtures/system_boundary_setup_captures_v2/` at saferemediate-backend
**48597adf5926784c7d052e5dd854f4e100d22830** (branch claude/onboarding-g3-selected-work; the capture directory's tree,
8d625e68, is unchanged since G3-A 1489361f). That commit's
`tests/test_system_boundary_setup_captures.py::test_the_real_setup_route_answers_are_exactly_the_captures` asserts the mounted
routes still answer exactly these.

How they were captured: the same harness as the level-1 copies beside this directory (`../system-boundary-setup-captures/`,
backend 9ad9be86, kept as level-1 evidence: this frontend refuses those untagged answers). Pinned: the setup module's clock and
uuid source, the save clock, and the request ids posted. Each file's `_provenance` names the request.

Never edit these by hand. Re-copy them from the backend commit that asserts them, and update the SHA above.
