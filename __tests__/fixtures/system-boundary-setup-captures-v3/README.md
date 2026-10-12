# Resumable System setup, contract level 3 (onboarding G3-G): producer captures

The real answers of the backend's `/api/system-boundary/setup*` routes at setup contract level 3: every success answer carries
`contract: system_boundary_setup/v3`, each derived disposition's `required_facts` is typed from the backend's versioned
requirement profile (`{profile, support, reason}`), and every read and status answer serves that profile once as
`requirement_profile` `{hash, document}`. Each file is a byte-for-byte copy of `tests/fixtures/system_boundary_setup_captures_v3/`
at saferemediate-backend **0e97a76fe7d24f1eff36e47c83396a0a70ff1688** (branch claude/onboarding-g3-selected-work). That commit's
`tests/test_system_boundary_setup_captures.py::test_the_real_setup_route_answers_are_exactly_the_captures` asserts the mounted
routes still answer exactly these.

How they were captured: the same harness as the level-1 and level-2 copies beside this directory
(`../system-boundary-setup-captures/` and `../system-boundary-setup-captures-v2/`, kept as those levels' evidence: this frontend
refuses those answers). Pinned: the setup module's clock and uuid source, the save clock, and the request ids posted. Each file's
`_provenance` names the request.

Never edit these by hand. Re-copy them from the backend commit that asserts them, and update the SHA above.
