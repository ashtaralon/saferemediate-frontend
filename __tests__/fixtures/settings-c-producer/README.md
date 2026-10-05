# Settings C (option C) producer captures

These are the REAL backend's responses, captured by executing the producer, never hand-written. They are the test inputs for
`__tests__/settings-accounts-first-account.test.tsx`.

- Producer: saferemediate-backend `b7a010334abb228abb39c6d9cb7c4f970f59bde7` (Settings C S3b-F, source-accepted and pushed
  to `claude/settings-first-account-c`), from a detached clean tree.
- Generator: `agent-coordinator/claude-settings-c-s4f-evidence-2026-10-04/test_s4_producer_captures.py`
  (sha256 `c27f4a55d4ab279ff96a4e867166464ffabdb8fafdc3e8c21b20e06d905a436c`; 01-12 were written by its earlier revision 2a07d8c7..., which
  differs only in lacking the appended 13a/13b test; a rerun writes new timestamps, so 01-12 are kept as captured). It is run with pytest inside that backend tree.
- Harness:
  - the backend's own API harness: the real router, the real repository on moto DynamoDB, the real person verification
    and the real connector on moto STS/SQS/Organizations;
  - pinned python 3.13.4 under env -i, with fake credentials and network denied.
- Faults are injected as the backend suites inject them:
  - an AssumeRole refusal and Account Management answered at botocore's call site (moto has no Account Management);
  - a READ-session refusal at the connector's member_session;
  - definite transaction rejections at its transaction client.
- Identifiers are the backend test harness's own: tenant `acme`, member `222222222222` and platform `111111111111`.
  The timestamps are the capture's wall clock.

13a/13b are one registration checked twice, the second time with the connector's own injectable clock 20 minutes later (as
the backend suites move it). That makes a genuine later observation with a new check_id.

Each file is one state the first-account journey enters: `body` is GET /api/admin/accounts, and `*_response` is a POST or
GET that the step made. Regenerate them; do not edit them.

## 14-22 (Stage1B, 1B-3)

- Producer: saferemediate-backend `28b2b7d99ec071274f7de760041580f123087825` (1B-2b on 1B-2 59983a8c and 1B-1 b73049db; local
  checkpoints), from a clean tree.
- Generator: `agent-coordinator/claude-settings-1b3-evidence-2026-10-05/test_1b3_producer_captures.py`, the same harness
  plus two producers:
  - the organization-list harness (`tests/cyntro_data/registration_listing.py list_accounts`) for the listed path;
  - the real collection envelope (`collector_session.durable_collection` over the orchestrator's DynamoDB run store, fed
    the work items the connector actually queued) for every first-inventory state.
- Files:
  - 14 and 15: a listed account pending with its evidence, and while it is being recorded (LISTED_ADMITTED).
  - 16 to 20: the first inventory from its own runs: queued, one collecting, all collected, one failed, and no run table
    (UNAVAILABLE).
  - 21 and 22: failed requests with their stable codes: a closed installation gate, and an account with collection
    history.
