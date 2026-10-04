# Settings C (option C) producer captures

These are the REAL backend's responses, captured by executing the producer, never hand-written. They are the test inputs for
`__tests__/settings-accounts-first-account.test.tsx`.

- Producer: saferemediate-backend `b7a010334abb228abb39c6d9cb7c4f970f59bde7` (Settings C S3b-F, source-accepted and pushed
  to `claude/settings-first-account-c`), from a detached clean tree.
- Generator: `agent-coordinator/claude-settings-c-s4-evidence-2026-10-04/test_s4_producer_captures.py`
  (sha256 `2a07d8c77a27327cc6284d5e1e210715f661a872af5e11893b758e5d63fa4662`). It is run with pytest inside that backend tree.
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

Each file is one state the first-account journey enters: `body` is GET /api/admin/accounts, and `*_response` is a POST or
GET that the step made. Regenerate them; do not edit them.
