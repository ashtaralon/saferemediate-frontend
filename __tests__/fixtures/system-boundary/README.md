# System Boundary authoring: producer goldens

These are the real answers of the backend's System Boundary authoring routes, plus the request bodies that produced them.
Each file is a byte-for-byte copy of `tests/fixtures/system_boundary_authoring/` at saferemediate-backend
**472d41052fab563b23e90a1825ac6b66d7a3203f**. That commit's
`tests/cyntro_data/test_system_boundary_root_admission.py::test_r6_the_authoring_answers_are_exactly_the_producer_goldens`
asserts the real route still answers exactly these.

How they were captured: on the real stack, with no double of the resolver.
- The current-root resolver, the person verifier with installed keys, and a P3a2 inventory publication are all real.
- The IAM role is the real IAM normalizer's output.
- The clock, the publication attempt, the evidence store's recorded identity, the receipt clock, the save clock and the
  envelopes' request ids are pinned. Each file's `_provenance` says so.

`requests.json` holds the envelopes posted, by name. The create was built with the console form's own Deployment cell
rule (`cellsOf`).

Never edit these by hand. Re-copy them from the backend commit that asserts them, and update the SHA above.
