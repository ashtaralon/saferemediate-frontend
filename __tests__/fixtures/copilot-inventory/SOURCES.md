# Sources (copied unchanged; do not edit)

Semantic's actual snapshots, not hand-written:

- route-e05bad32/: HTTP responses of the corrected registered `/api/resource-inventory/{count,list}` routes at backend
  `e05bad32da4f5fa93bc90849303f414148398dc1` (branch decision-layer/inventory-envelope-route), captured through the
  committed route suite's own fixture (composed runtime, real count/list readers, labelled graph substitute, counting
  legacy driver). Each file is `{http, graph_calls, legacy_runs, executes, lifecycle_reads, body}`; `age_seconds` is a
  wall-clock marker. Source: semantic-inventory-route-dispatch-provenance-seam-6ae869ba-2026-09-16.md §5c and
  semantic-status-route-final-ack-request-consumers-release-sequence-2026-09-16.md §1.
- legacy-route-47e01757/: today's /api/resource-inventory/count route at backend main
  47e017575ee870ac34ae3f4e7ada39eeddc213e9 (semantic-resource-inventory-envelope-hunk-and-snapshots-2026-09-16.md).

The earlier runtime-bfe10ed9/ fixtures (runtime output before any route mapping) and the proposed mapping the tests
applied to them are removed: the route now exists, and these are its actual bodies.

sha256 (route-e05bad32 must equal SB-INVENTORY-ROUTE-SEAM-e05bad32/SHA256SUMS; legacy as before):

    9d4d231973685c592eb471b525acdc55e4e4e3b76c550df6e368cb135fbfe72a  route-e05bad32/count-401-unverified.json
    aa271e28fa0892347991355432cb54cd7da27e2182055d6146204ceab95eaa10  route-e05bad32/count-503-no-runtime.json
    dac8255ed2c03887aee920674ea3b3006af8dc937850204b0c97aaed264eb5ca  route-e05bad32/count-abstained-uncertified-subnet.json
    95e8e076b57a3b9093b38afbf98680505550309964e4a3c4e21c0d982b8f4a9d  route-e05bad32/count-raw-envelope-absent.json
    e6d3040d6734f4a5e09945ab62795a2a0f85037b992a6e3d7d6b6cb2f0b15f29  route-e05bad32/count-raw-envelope-false.json
    820b9817d7bfa469aad0eafe55e3faafcdd7d5d0b15a30469d80af2e8863dcf5  route-e05bad32/count-ready.json
    a6f9e432c2dd2595db31efa75938d935e37a70e2cb54e659ecf9f282ad44a911  route-e05bad32/count-refused-account-mismatch.json
    4fb47bcfb785509689eb383e8a1acb956d2dd18abdc830386d2b52d14e1c24a9  route-e05bad32/count-refused-forbidden-subnet.json
    f647d948553e65e8bdaf3ebd7bf617c6bf42aa10a059dc6784898236c2883c54  route-e05bad32/count-refused-lifecycle-missing.json
    74323ef3aeb0ac152db3a3f25eeaac489dc42da28d95b58c25499b082f9bb273  route-e05bad32/count-refused-offboarded.json
    eaf0b5d21200d0ed530c8df99ce29ba8d6ee3ea439dbf90223611c4399da36fd  route-e05bad32/count-unavailable-graph.json
    ed1839234b3caefabd1fac5f282e488ce9f84953f1cfd6eac9bf0975c9687c55  route-e05bad32/list-abstained-uncertified-subnet.json
    615e28e40a5fde797bfd05b5eb54a5d85fee6953b4452a20d3bd7f50fedf9524  route-e05bad32/list-ready.json
    ac065aca6eb6102b9c8b849f7b7572346827472260870001faa6011fc021b508  route-e05bad32/list-refused-bad-cursor.json
    e6231dbeebf0a2df890f786e1e442d8681ee543ca1a91ef638ad645f9ee3150b  route-e05bad32/list-refused-forbidden-subnet.json
    a29dbd648501d545f8accdb768abebc354190c637a7f81e2bf2a3835899e4c66  route-e05bad32/list-refused-offboarded.json
    201c9df32746554ce541d559e487251edbc7e5c978e9ef908a7995b1b044ee11  route-e05bad32/list-refused-unsupported-filter.json
    3f787c0faa08001982691abc039bd72b1fe2ac44cae33326d7ef528e67a117d2  route-e05bad32/list-unavailable-graph.json
    6ab3d4354f49f8a327812ae6b649bb5509f6a35c292fa9a1348d23a94d387392  legacy-route-47e01757/legacy-count-graph-unavailable.json
    bbaee5be89dff4fd0219008fc5bf1d7f0b64f170489ff942e774136879572651  legacy-route-47e01757/legacy-count-ready-s3.json
    906c3f471a7a22b5e2bcb0570e231e742fbb6c140f9b8428e0923e33b4e7067c  legacy-route-47e01757/legacy-count-unknown-alias.json
