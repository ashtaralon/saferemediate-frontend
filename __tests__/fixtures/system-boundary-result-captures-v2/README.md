# The served result, `system_boundary_result_read/v2` (S1b C3d / C3f-R): producer captures

The real answers of GET `/api/system-boundary/result` (the backend's result route on its authoring harness: the real console
person check, the registered account). The publication behind them is made by the real chain: a REAL plural Finish (prod,
staging, and a global role), the REAL planner's rows over the boundary the store gives, the REAL publication with the planner's
own input vector, and the REAL cohort build.

- **`served_context`**: SERVED, `deployment_context_state` `{state: SERVED, members: 3}`, every member SINGLE with its
  Deployment `{key, version}`.
- **`served_context_withheld`**: the same rows pinned at a later revision. The context is withheld whole by name
  (`DEPLOYMENT_VERSION_NOT_PLANNER_INPUT`), and every member is still listed.
- **`served_without_context`**: a version-1 publication, `PUBLICATION_WITHOUT_CONTEXT`.

There are two seams, outside the captured shape: the route's snapshot store is the test's, and "membership v2 serves" is true. The
files are NOT byte-stable (the Finish mints ids; the publication, times). The backend test
`tests/test_system_boundary_result_captures.py` asserts each answer's status, contract, state, reason, decoration state and
reason, and whole shape.

Each file is a byte-for-byte copy of `tests/fixtures/system_boundary_result_captures_v2/` at saferemediate-backend
**fff8cdaca89823c7300c03f2e777f6ba038eea0d** (C3f-R). The v1 / held result answers stay in `../system-boundary-captures/`.

Never edit these by hand. Re-copy them from the backend commit that asserts them, and update the SHA above.

(PC1 S0-F, 2026-10-17) Every file here was re-copied byte-for-byte from saferemediate-backend **e593baec7** (branch
`claude/pc1-s0-f-t3-boundary-words`, local), regenerated through the same harness: answers that carry a summary now also carry
`not_member_reasons` (the closed class count). Under the harness's own masking each file differs from the earlier copy only by that
field or not at all. The commit named above remains the history of the earlier shape.
