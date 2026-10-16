# Terraform binding list (S2 lifecycle): producer captures

The real answers of `GET /api/system-boundary/terraform-bindings/list`. Every success answer carries
`contract: terraform_workspace_binding_list/v1`.

- **`list`:** three bindings, newest key first. One of them is named by a setup the person can see (`found`); the others
  read `none_found`, never "unused".
- **`list_page_1` / `list_page_2`:** one row per page. The cursor names the last row shown. Each page is full, so each answers
  `complete: false` with a cursor: more may follow.
- **`list_scoped_incomplete`:** the same person scoped to the bound account, with the read bound at one head. The newest head
  is one she may not see, so the answer is no row, no cursor and `complete: false`: never "the end".
- **`list_cursor_invalid`:** 400 `CURSOR_INVALID`.
- **`list_other_account`:** a filter naming another account: empty and complete.

Each file is a byte-for-byte copy of `tests/fixtures/system_boundary_terraform_binding_list_captures/` at saferemediate-backend
**715b8fdfd80a8b119a45bad25152f32ee473c9ce** (branch claude/s2-tf-raw-state-c1, local). That commit's
`tests/test_system_boundary_terraform_lifecycle.py::test_captures_of_the_list_route` asserts the route still answers exactly
these. Never edit by hand.
