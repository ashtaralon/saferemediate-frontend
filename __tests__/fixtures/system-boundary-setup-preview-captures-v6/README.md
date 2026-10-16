# Draft preview v3 (S2 C4a-2): a Terraform binding joined against the account's Inventory, as producer captures

The real answers of `GET /api/system-boundary/setup/{id}/preview` for a draft whose `iac` rows use uploaded Terraform states.
Each answer carries `contract: system_boundary_setup_preview/v3` and `setup_contract: system_boundary_setup/v5`.

- **`terraform_preview`:** COMPUTED, with three Terraform rows.
  - account-wide, JOINED: 3 identities, 2 matched, 1 not in Inventory;
  - eu-west-1: a revoked binding, HELD `BINDING_REVOKED`;
  - us-east-1: an unknown key, HELD `BINDING_NOT_FOUND`.
- **`terraform_preview_page`:** a members page of that preview (page contract v3).
- **`terraform_preview_held`:** the account's assembly held (its census unreadable at assembly), so the joined row is HELD
  `ACCOUNT_NOT_JOINED:HELD` and nothing is joined.
- **`terraform_draft`:** the saved draft, whose derived rows say the same.

Each file is a byte-for-byte copy of `tests/fixtures/system_boundary_setup_preview_captures_v6/` at saferemediate-backend
**b08977d214c2915dbdcafc1b03b658d2a2a50019** (branch claude/s2-tf-raw-state-c1, local; the files are unchanged at the
SW116 correction 39629c16, whose capture test passes against them). That commit's
`tests/cyntro_data/test_system_boundary_preview_terraform.py::test_captures_of_a_v3_preview_joined_held_revoked_and_unknown`
asserts the routes still answer with these invariants and shapes. As with the S1a preview captures, ids, digests and times
are one run's.

Never edit these by hand. Re-copy them from the backend commit that asserts them, and update the SHA above.
