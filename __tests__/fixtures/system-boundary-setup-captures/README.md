# Resumable System setup (onboarding G2): producer captures

The real answers of the backend's `/api/system-boundary/setup*` routes. Each file is a byte-for-byte copy of
`tests/fixtures/system_boundary_setup_captures/` at saferemediate-backend
**9ad9be86f2461b597e9b38347aabe03e58a05970** (branch claude/onboarding-g2-setup). That commit's
`tests/test_system_boundary_setup_captures.py::test_the_real_setup_route_answers_are_exactly_the_captures` asserts the
mounted routes still answer exactly these.

How they were captured: one run on the authoring harness -- the real console person check, an ACTIVE protocol state at
revision 1, the moto boundary table and account registry, the route's real root admission factory (the root resolver is the
PRESENT double of the save tests), and the real save through the setup companion. Pinned: the setup module's clock and uuid
source, the save clock, and the request ids posted. Each file's `_provenance` names the request.

Never edit these by hand. Re-copy them from the backend commit that asserts them, and update the SHA above.
