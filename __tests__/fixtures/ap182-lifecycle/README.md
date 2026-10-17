# AP182 · lifecycle-coverage fixtures — provenance

These JSON files are **backend output captured from the backend's own test harness**. They are not a production capture,
not a response from any deployed install or from C1, and not proof of installed coverage. Nothing in them was written by
hand. The inputs behind them are the harness's labelled synthetic rows (X5 / S1 worlds).

| | |
|---|---|
| Backend revision | `262d21bc2acb425091b9aaa8dbfd69a5429b1fe5` (AP177–AP181 lifecycle checkpoint, local only), clean detached checkout |
| Recipe | `capture_ap182.py`, kept here verbatim. It was run from that checkout as `tests/cyntro_data/test_zz_ap182_capture.py` |
| Runtime | `~/.cyntro-ci-venv/3.13.4/bin/python -m pytest -s` under the backend's offline sandbox (`.github/ci/offline-gates.sb`, `env -i`, no AWS credentials) |
| Encoding | each body passed through `fastapi.encoders.jsonable_encoder`, as the serving routes encode an answer, then indented and key-sorted |

## The files

| File | What produced it | Shape |
|---|---|---|
| `all-resolved.json` | `api.identity_attack_paths._published_all_iap`: the governed `/all` over the X5 publications (2 systems, records resolved) | READY, `analysis_complete`, totals |
| `all-lifecycle-held.json` | the same, with Orders' path P2 lifecycle-HELD (not in the snapshot) | PARTIAL, null totals, `scanned_totals`, `lifecycle_held_systems: [Orders, 1]` |
| `all-record-missing.json` | the same, with Payments' catalog SECTION_HELD, so its coverage-path row carries no record | PARTIAL, `lifecycle_unverified_systems: ["Payments (authored_system:pay): jewel_coverage_record_missing"]` |
| `target-catalog-section.json` | `unified.attack_map.target_catalog_activated.ready_catalog_section` over the S1 world's real frozen mapping | see below |

`target-catalog-section.json` is the section the report cycle publishes. On an install, `GET
/api/attack-paths/{system}/targets` serves it verbatim (`_answer_read_model`):

| Target | State | Paths | `held_path_count` | `coverage_withheld_reason` |
|---|---|---|---|---|
| `bucket-1` | observed | 1 | 2 | `lifecycle_held` (mixed) |
| `empty-bucket` | coverage_incomplete | 0 | 1 | `lifecycle_held` (all-held) |
| RDS clusters `aurora-a` / `cluster-1` / `orders` | observed / coverage_incomplete | 1 / 0 / 0 | — | `database_eni_binding_not_in_normalized_inventory` (the stage receipt's withheld claim) |
| the other RDS instances and S3 `orders` | coverage_incomplete | 0 | — | — (no manifest entry: the original cause) |

## Derived variants (in the tests, never stored)

A test may derive a variant of these bodies ONLY by removing fields, saying which. For example, it may drop
`held_path_count` to get the non-install shape: the live route's `TargetCatalogEntry` model does not declare it.
Nothing is added to a body. The malformed-input cases (a non-integer or `0` count, a non-string reason, an unknown or
prototype-named reason code, a `null` or wrong-shaped list) are not fixture bodies, because no producer writes them.
They are constructed values, labelled `CONSTRUCTED` where they appear: in the unit tests of
`lib/attack-paths/lifecycle-coverage.ts`, and in the rail / page / card tests (AP183). The rail and page tests build
theirs from one captured row by replacing one field's value, and say which.
