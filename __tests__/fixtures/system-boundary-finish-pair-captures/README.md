# One two-stack Finish: its receipt, Applied and result, read together (S1b C3f-P): producer captures

These three answers come from ONE run of the backend's CloudFormation harness. The plural two-stack journey goes
through the real setup routes:
- prod rests on the "shop" stack: instance, security group and role;
- staging rests on the "api" stack: a second instance.

Its Finish is made on the seen v2 digest. Then, all on that same run:
1. `project_account` stages the generation;
2. the cohort cycle's real PREPARE (`prepare_account`) publishes the result, and its real BUILD activates the cohort;
3. the three routes a person's Progress screen reads answer.

| File | Request | What it holds |
|---|---|---|
| `finished` | GET `/api/system-boundary/setup/{id}` | The Finish's own receipt: its association pins the System and both Deployments at their versions. `result_scope` is v2 SERVED. |
| `applied` | GET `/api/system-boundary/declarations/applied` | `applied_known`, at the receipt's completed revision, on the served cohort's generation. |
| `result` | GET `/api/system-boundary/result` for the receipt's System | `system_boundary_result_read/v2` on that same generation, with each member's Deployment context. |

No pairing is named by hand: the frontend pairs these files exactly as it pairs live answers.

**Seams.** The backend test states them; they are summarized here.
- The snapshot store is the test's moto table, and the graph is the projector graph double.
- The publication reads the authoring table, not the projector's read-only grant.
- The cohort BUILD requires only the result family.
- One Systems row on this generation's pin gives the result route its v2 mode.

**What the backend test asserts.** The files are NOT byte-stable (ids, digests and times are that run's). On every run
the test asserts:
- each answer's status, cache header, contract, state and whole shape, equal to the stored capture;
- the binding: Applied's generation is the result's, its applied revision is the receipt's completed revision, every
  context names a receipt Deployment at its pinned version, and shop → prod, api → staging.

Each file is a byte-for-byte copy of `tests/fixtures/system_boundary_finish_pair_captures/` at saferemediate-backend
**766edc561402c1dd8614fe74794348ce00a448c4** (C3f-P), asserted by
`tests/cyntro_data/test_system_boundary_finish_pair_captures.py`.

Never edit these by hand. Re-copy them from the backend commit that asserts them, and update the SHA above.

(PC1 S0-F, 2026-10-17) Every file here was re-copied byte-for-byte from saferemediate-backend **e593baec7** (branch
`claude/pc1-s0-f-t3-boundary-words`, local), regenerated through the same harness: answers that carry a summary now also carry
`not_member_reasons` (the closed class count). Under the harness's own masking each file differs from the earlier copy only by that
field or not at all. The commit named above remains the history of the earlier shape.
