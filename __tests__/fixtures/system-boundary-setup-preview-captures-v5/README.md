# Draft preview and preview-bearing Finish under setup contract level 5 (S1b): producer captures

The real answers of the backend's `/api/system-boundary/setup*` routes, tagged `setup_contract: system_boundary_setup/v5`.

- **The 25 names of `../system-boundary-setup-preview-captures/`** are re-derived under setup v5. A single draft still previews as
  `system_boundary_setup_preview/v1`.
- **The `plural_*` answers** are the plural guided journey on TWO DEDICATED STACKS: prod on "shop" and staging on "api". They are:
  - the draft and the draft read;
  - the v2 preview (`system_boundary_setup_preview/v2`: `draft_targets.deployment_ids`, each account's
    `deployment_context_state`, each member's `deployment_context` `{resolution, deployments: [{key, version}]}`);
  - the members page, the Finish on the seen digest, the finished read and the status.
- **`plural_*_held` / `plural_finish_not_computed`** are the same draft held LATE (`CENSUS_NOT_SERVED`). Its nested decoration is a
  DIAGNOSTIC (SERVED, members 0, here); the outer HELD state governs, and the Finish is refused `PREVIEW_NOT_COMPUTED`.

Each file is a byte-for-byte copy of `tests/fixtures/system_boundary_setup_preview_captures_v5/` at saferemediate-backend
**fff8cdaca89823c7300c03f2e777f6ba038eea0d** (identical at C3f `ab4437b4`). They were captured by `tests/cyntro_data/test_system_boundary_preview_captures.py`
on the CF harness of `test_system_boundary_preview_cf.py`.

They are NOT byte-stable: ids, digests and times are ONE real run's. The backend test asserts each answer's status, cache header,
contract tags, state, refusal code and whole shape.

Never edit these by hand. Re-copy them from the backend commit that asserts them, and update the SHA above.
