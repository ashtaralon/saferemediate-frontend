# Terraform binding list (S2 lifecycle): producer captures

The real answers of `GET /api/system-boundary/terraform-bindings/list`: the Terraform states the asking person uploaded, read
from their own creator index (design E, SW121). Every success answer carries `contract: terraform_workspace_binding_list/v1`.

- **`list`:** Alice's three uploads, in index key order (a digest of the binding id, not upload order). One of them is named
  by a setup she can see (`found`); the others read `none_found`, never "unused".
- **`list_page_1` / `list_page_2`:** one row per page. The cursor names the last index key read, never a binding id. Each
  page is full, so each answers `complete: false` with a cursor: more may follow.
- **`list_scoped_incomplete`:** the same person scoped to the bound account, with the read bound at one entry. Her highest
  index key is an upload she may not see now, so the answer is no row, `complete: false` and a cursor past that entry: never
  "the end".
- **`list_scoped_continued`:** that cursor, at the normal bound: her two visible uploads, then `complete: true`.
- **`list_another_person`:** Carol (tenant-wide) while Alice's three exist: no row, complete. Never another person's upload.
- **`list_cursor_invalid`:** 400 `CURSOR_INVALID`.
- **`list_other_account`:** a filter naming another account: empty and complete.

Each file is a byte-for-byte copy of `tests/fixtures/system_boundary_terraform_binding_list_captures/` at saferemediate-backend
**5d5ee8da6cfb6b7717d0348838c3e5641339f689** (branch claude/s2-tf-raw-state-c1, local). That commit's
`tests/test_system_boundary_terraform_lifecycle.py::test_captures_of_the_list_route` asserts the route still answers exactly
these. Never edit by hand.
