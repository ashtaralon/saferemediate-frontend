# Sources (copied unchanged; do not edit)

Semantic's actual snapshots, not hand-written:
- runtime-bfe10ed9/: real DecisionRuntime.execute at analyst bfe10ed9cc27a9387860bbd5a37d79d3bdf2a1f2 (semantic-inventory-envelope-post-b1b2-snapshots-and-route-mapping-2026-09-16.md). This is what the envelope=true route would receive, before its held mapping.
- legacy-route-47e01757/: today's /api/resource-inventory/count route at backend main 47e017575ee870ac34ae3f4e7ada39eeddc213e9 (semantic-resource-inventory-envelope-hunk-and-snapshots-2026-09-16.md).

sha256 (must equal the SHA256SUMS in .qa-artifacts/symentic-p1-canary/claude-review-2026-09-15/):

    dc5aa6a03d2e6d091b352b2c851146666bf2f8c363f39d88679847d47b16979e  runtime-bfe10ed9/count-abstained-uncertified-subnet-in-scope.json
    8ad47066de0654a3100bd1a00587c7871ec9cafc4da1588a6be7d2095e5e98a7  runtime-bfe10ed9/count-bad-alias.json
    b1c341d9d26a5cbf92eb2c4d8c096957760334d3d270df47fbd12803b91c0aa1  runtime-bfe10ed9/count-graph-unavailable.json
    f0436fd860ad986f10c47d0eae58c5ec9de76b52a796d4dff3df0cce39f3fe92  runtime-bfe10ed9/count-ready-s3-ACTIVE.json
    de3c9e42e38b8cf4b20bd083f30982f5720bede47ad428dac5f17bfe8d3b729e  runtime-bfe10ed9/count-refused-OFFBOARDED.json
    8ad47066de0654a3100bd1a00587c7871ec9cafc4da1588a6be7d2095e5e98a7  runtime-bfe10ed9/count-refused-forbidden-subnet-outside-scope.json
    4d456b80c10c67cbd7e0f71f146486bfc2ad9eae3d538569cf0ae7add43c72bf  runtime-bfe10ed9/list-abstained-uncertified-subnet-in-scope.json
    04aaf46fdb5cc8084ea5b85e474b65257cb195be43788ed6bc43b0f55a0dd5dd  runtime-bfe10ed9/list-bad-alias.json
    c914620f82c119158cc49f6f3f651f0321e488a4d038fb4969e899e98921a1c3  runtime-bfe10ed9/list-bad-cursor.json
    cf7e3ca1fbde38aba398a6a09ec5d306b7ca3bc8a35d4a6369e48774ac34d8c9  runtime-bfe10ed9/list-bad-sort.json
    ca188fa4e238b1b55f19dd821fda54a4855d4585d476e51be313b79e4f7f9af2  runtime-bfe10ed9/list-graph-unavailable.json
    95c0bd158f794bfd91b1af6f44bfbdb4bbe1642065d5f5fa2efb45cfaaea6063  runtime-bfe10ed9/list-ready-s3-ACTIVE.json
    d9a7c99dbab1cfe71b14e246485976a9025c849b4e341d5b2704464325b66c59  runtime-bfe10ed9/list-refused-OFFBOARDED.json
    c3b8a9679a3dc1820778cec72adb055d6b56eac3a3127be2b3d83eccba86d7c8  runtime-bfe10ed9/list-refused-forbidden-subnet-outside-scope.json
    6ab3d4354f49f8a327812ae6b649bb5509f6a35c292fa9a1348d23a94d387392  legacy-route-47e01757/legacy-count-graph-unavailable.json
    bbaee5be89dff4fd0219008fc5bf1d7f0b64f170489ff942e774136879572651  legacy-route-47e01757/legacy-count-ready-s3.json
    906c3f471a7a22b5e2bcb0570e231e742fbb6c140f9b8428e0923e33b4e7067c  legacy-route-47e01757/legacy-count-unknown-alias.json
