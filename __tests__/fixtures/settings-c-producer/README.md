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

## 14-23 (Stage1B, 1B-3)

- Producer: saferemediate-backend `65cca65087ac14da852a31eb5c0c5eb5b36fe21c` (R1 self-review on 1B-2b 28b2b7d9, 1B-2 59983a8c
  and 1B-1 b73049db; local checkpoints), from a clean tree.
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
  - 23: a partly refused dispatch (the queue accepted the first batch and refused the second): BLOCKED by that reason,
    with the queued work's own runs counted beside it.

## 24-28 (gaps: Remove, measured counts)

- Producer: saferemediate-backend `c51a8075745f9d68586cf310caa34a0805972670` (R2c, on R2b 067df5d7 and R2 583af607; local
  checkpoints), from a clean detached tree.
- Generator: `agent-coordinator/claude-settings-gaps-evidence-2026-10-05/test_gaps_producer_captures.py` (sha256 in
  `generator-sha256.txt` beside it). It imports the 1B-3 generator's harness and adds:
  - the withdraw route and the real connector's `withdraw`;
  - the REAL inventory handler (`sources/handler.lambda_handler`) run over every work item the connector queued, reading the
    member account through its own CyntroRead session on moto, with the evidence store on local disk.
- Files:
  - 24: Remove asked for the registration and version shown (`withdraw_response` is the POST's answer); not yet processed.
  - 25: withdrawn: the account is no longer listed.
  - 26: a removal overtaken by an access check: refused by its own reason, the account still listed and confirmable.
  - 27: the first inventory as the real handler measured it: every item counted, the total summed.
  - 28: every item measured at zero (COLLECTED_ZERO_FACTS). The real handler cannot produce this -- every account has Regions
    and a default VPC -- so the counts are passed into the real collection envelope exactly as the handler passes them; the
    reader and the listing that judge them are the real ones.

## 29-37 (the organization listing role set up from Settings; the connection stack's instructions)

- Producer: saferemediate-backend `037f3244ee838628d19b5efecab6ce8302556c5d` (R3d, on 64068f32), from a detached tree carrying exactly that commit's diff.
- Generator: `agent-coordinator/claude-settings-r3-evidence-2026-10-05/test_r3_producer_captures.py` (sha256 in
  `generator-sha256.txt` beside it). The backend's own API harness (real router, real repository on moto DynamoDB, real
  person verification) and the real account connector. The connector's organization reads are the real ones on moto: its
  own Organizations read for the member trust, then the discovery role assumed through its own STS AssumeRole with this
  installation's ExternalId, DescribeOrganization and ListAccounts. moto keeps organization membership per account, so a
  role in an account outside the organization answers AWSOrganizationsNotInUseException as AWS does. moto's management
  account is its default account, so the platform account is that account here (it is listed as the platform account).
- Files:
  - 29: not configured: the setup values, the role's exact name and the output to copy.
  - 30: the role ARN pasted in Settings, asked for (202: the request that will run carries it).
  - 31: listed through that role (it was proven against this installation's organization and remembered).
  - 32: a role from Settings that could not be assumed: the setup again, with no installer role.
  - 33: the installer's role could not be assumed: the setup says the installer names the role.
    32 and 33 answer AssumeRole with AWS's own AccessDenied at botocore's call site (moto never refuses AssumeRole); the
    connector records only that AssumeRole failed. Every other call is real.
  - 34: a role in an account outside the organization: OTHER_ORGANIZATION, no setup.
  - 35: another installation's role name, refused by the API (422, nothing asked).
  - 36: the connection stack's instructions once the member trust exists (the Add form's stack step).
  - 37: a second ask while a request with another role is open: the open request keeps its own role.
