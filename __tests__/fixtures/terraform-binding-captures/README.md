# Terraform workspace bindings (S2 intake I2b): producer captures

The real answers of the backend's `/api/system-boundary/terraform-bindings*` routes. Every success answer carries
`contract: terraform_workspace_binding_read/v1`. They cover:
- creation (201) and its replay (200, `replayed: true`), for raw and show documents;
- the retained read before and after a revoke, the revoke and its replay;
- the named refusals: 409 `BINDING_REVOKED` / `VERSION_CONFLICT` / `REQUEST_ID_REUSED`; 422 `REDUCTION_INVALID`
  (`IDENTITY_NOT_RETAINED`) / `CONSENT_REQUIRED` / `STATE_VALUE_CREDENTIAL_SHAPED`; 413; 404 `BINDING_NOT_FOUND`; 403 for a person
  without classify; and 401 `PERSON_TOKEN_REQUIRED` without a token.

Each file is a byte-for-byte copy of `tests/fixtures/system_boundary_terraform_binding_captures/` at saferemediate-backend
**f2f6a6d7e97ae66564392d47b453522b435a22c6** (branch claude/s2-tf-raw-state-c1, local). That commit's
`tests/test_system_boundary_terraform_captures.py::test_the_real_terraform_binding_route_answers_are_exactly_the_captures`
asserts the mounted routes still answer exactly these. A request is recorded with its document by sha256 and size only.

Never edit these by hand. Re-copy them from the backend commit that asserts them, and update the SHA above.
