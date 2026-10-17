# Resumable System setup, contract level 5 (S1b): producer captures

The real answers of the backend's `/api/system-boundary/setup*` routes at setup contract level 5. Every success answer carries
`contract: system_boundary_setup/v5`.

- **The 13 single-setup answers** are level 4's with the new tag. Nothing else differs from `../system-boundary-setup-captures-v4/`.
- **The `plural_*` answers** are a PLURAL setup through the same routes: one new System with two new Deployments (`prod`, `staging`)
  in one cell, each on its own root, with Deployment-scoped dispositions (`scope.deployment`). The flow is create, update and
  the draft read, then a Finish whose receipt association pins both Deployments in canonical `deployment_key` order, the
  finished read and the status. The status carries `result_scope` v2 (`from`: every pinned Deployment).

Each file is a byte-for-byte copy of `tests/fixtures/system_boundary_setup_captures_v5/` at saferemediate-backend
**fff8cdaca89823c7300c03f2e777f6ba038eea0d** (branch claude/s1b-plural-deployments, local; the files are identical at C3f `ab4437b4`). That commit's
`tests/test_system_boundary_setup_captures.py::test_the_real_setup_route_answers_are_exactly_the_captures` asserts the mounted
routes still answer exactly these.

The level-1..4 copies beside this directory are those levels' evidence: this frontend reads level 4 AND level 5 answers.

Never edit these by hand. Re-copy them from the backend commit that asserts them, and update the SHA above.
