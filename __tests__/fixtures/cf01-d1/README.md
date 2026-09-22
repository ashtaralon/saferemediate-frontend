# CF01 · D1 identity fixtures — provenance

Every byte under this directory and in `__tests__/fixtures/estate-identity-access.json`
was produced by running a backend script. Nothing here was hand-written to reach a
state, and nothing was edited after it was emitted.

## Backend the fixtures were produced from

| | |
|---|---|
| Producer commit | `6e08d6b291eb9508212517702c9647c515d8e532` — *Emit fixtures whose identity graph was actually read* (CF01 lane F) |
| Assembled candidate | `bc512560e422924f0759ae3926ef159bf9e7d6f4` (lane F integrated at `6cad0842`, plus lane E) |
| Snapshots used | `cf01/review/F-6e08d6b2` and `cf01/be-integration` — the four producer files (`scripts/emit_estate_identity_access_fixtures.py`, `scripts/estate_identity_access.py`, `scripts/estate_identity_graph.py`, `unified/tenant_lifecycle/serving.py`) are byte-identical between them, and both snapshots emit the same 272,236 bytes (sha256 `09051e96…8113af`) |
| Runtime | `cf01/.venv313/bin/python` |

## `__tests__/fixtures/estate-identity-access.json` (272,236 B)

The backend's own fixture file, copied verbatim.

```sh
cd <backend snapshot>
PYTHONPATH=. python scripts/emit_estate_identity_access_fixtures.py \
  > <frontend>/__tests__/fixtures/estate-identity-access.json
PYTHONPATH=. python scripts/emit_estate_identity_access_fixtures.py \
  --check <frontend>/__tests__/fixtures/estate-identity-access.json   # prints OK
```

8 payloads, 26 relationship-capability rows each (13 available). Its `ready`
identity graph holds **5 nodes / 13 edges across 9 families**.

**This file previously carried `IDENTITY_GRAPH_READ_FAILED` in every payload** —
the emitter's in-memory graph did not model the identity-graph queries and
`_read_identity_graph` swallows exceptions by design, so D1's adapter had never
seen a real identity graph. `__tests__/cf01-d1-identity-lens-model.test.ts`
now fails if that gap code reappears anywhere in this file.

Account-context coverage carried by the backend fixture:

| Payload | Account context |
|---|---|
| `ready`, `partial`, `empty_authoritative`, `partial_no_decision_authority`, `partial_unresolved_role_id` | in an organisation (5 nodes, 13 edges) |
| `standalone_account` | positively standalone — an `aws_account` node, no org edges, **no gap** |
| `partial_no_account_policy_context` | `ACCOUNT_POLICY_CONTEXT_ABSENT` — a named gap, not "standalone" |
| `unavailable` | graph `unavailable`, `IDENTITY_ACCESS_PROJECTION_UNAVAILABLE` |

## `estate-identity-graph-6e08d6b2.json` (287,116 B)

Emitted by `emit_identity_graph_fixture.py` beside it (renamed from
`estate-identity-graph-41f5.json` to name its producing commit).

```sh
cd <frontend>
PYTHONPATH=<backend snapshot> python \
  __tests__/fixtures/cf01-d1/emit_identity_graph_fixture.py \
  > __tests__/fixtures/cf01-d1/estate-identity-graph-6e08d6b2.json
```

It is **not** retired now that the backend fixture carries a real graph, because
it is the only route to the states the backend ships no fixture for and which
the lens must render as typed refusals rather than as emptiness:
`ACCOUNT_POLICY_CONTEXT_FOREIGN`, `ACCOUNT_POLICY_CONTEXT_AMBIGUOUS`,
`ACCOUNT_POLICY_CONTEXT_INCOMPLETE`, `PRINCIPALS_TRUNCATED`,
`CANONICAL_ATTRIBUTE_UNDECODABLE` and `IDENTITY_GRAPH_READ_FAILED`.

Every `graph.*` block is the literal return value of
`scripts.estate_identity_access._read_identity_graph`, driven through a fake
session that answers the producer's own reads and **raises** on an unmodelled
one. The six account-context blocks differ from each other in the
`organizations:account-policy-context` rows and in nothing else — every
principal, policy, credential and grant row is identical across them, so any
difference the lens renders is attributable to the account context alone.

`composed.refusal_carrying_graph` is the lane-F serving change: the `unavailable`
v1 payload with `identity_graph` carried verbatim rather than deleted.

### The empty-vs-unread pair

`graph.empty_authoritative_standalone`, `graph.empty_authoritative_in_org` and
`graph.empty_no_account_policy_context` are the real reader driven over a scope
with **no principals**, so the only thing that differs between them is the
account context:

| block | status | nodes | edges | `nodes_total` / `edges_total` | gap |
|---|---|---|---|---|---|
| `empty_authoritative_standalone` | `ready` | 1 (`aws_account`) | 0 | `1` / `0` | none |
| `empty_authoritative_in_org` | `ready` | 1 | 6 | `1` / `6` | none |
| `empty_no_account_policy_context` | `partial` | 0 | 0 | `0` / `0` | `ACCOUNT_POLICY_CONTEXT_ABSENT` |
| `unavailable_read_failed` | `unavailable` | 0 | 0 | **`null` / `null`** | `IDENTITY_GRAPH_READ_FAILED` |

The discriminator is the **totals, not the lists**. Every row above carries
`edges: []` except the in-org one, so a consumer that keys "is this empty?" off
list length renders a failed read as "there is nothing in this estate".
`scripts/estate_identity_graph.unavailable_identity_graph` states the rule in
its own docstring: an empty node/edge list on its own "claims an estate with no
identities, which is the inversion every other refusal in this contract exists
to prevent". An integer total — including `0` — is an answer; `null` is the
absence of one.

`composed.empty_authoritative_with_empty_graph` and
`composed.empty_authoritative_with_unread_graph` pair the **same**
authoritatively-empty v1 roles projection with, respectively, a graph that was
read and found empty and a graph that was never read. Both draw zero
relationships. They are the two payloads that must never render identically,
and `__tests__/cf01-d1-identity-lens-model.test.ts` and
`cf01-d1-identity-canvas.test.tsx` both pin that they do not.

## Re-running after a backend change

The recipe refuses to write a fixture it cannot vouch for. It exits non-zero if
the backend on `PYTHONPATH` predates lane F (missing `ACCOUNT_*` edge families),
if the emitter has no `account_context_row()`, or if any block that should have
been read comes back carrying `IDENTITY_GRAPH_READ_FAILED`.


---

## CF01-F candidate — `estate-identity-graph-F-candidate.json`

Literal output of the recipe against `cf01/be-F` (unintegrated; **read-only**, nothing there was
edited). Named a *candidate* because F is not landed.

Reproduce:

```sh
PYTHONPATH=<cf01/be-F> python __tests__/fixtures/cf01-d1/emit_identity_graph_fixture.py \
  > __tests__/fixtures/cf01-d1/estate-identity-graph-F-candidate.json
```

What it carries that the legacy fixture cannot:

| block | state |
|---|---|
| `partial_principals_truncated` | **201 nodes / 606 edges with BOTH totals `null`** — a truncated read that still carries its edges. The state the old validator rejected outright. |
| `ready` | exhausted read: `edges_total == len(edges)`, `all_required_committed: true` |
| `coverage_unknown` | the SAME rows with no committed scopes — `partial`, `REQUIRED_FAMILY_COVERAGE_UNKNOWN` |
| `unavailable_read_failed` | `null` totals, wholly-UNKNOWN coverage |

### Recipe changes CF01-F forced

1. **`principals_total` / `grants_total` removed from the input rows.** `read_paged` *refuses* a
   statement whose rows carry a populated total field — a value there means a `collect()`/`size()`
   census was put back in front of the `LIMIT`. Leaving them in produced
   `IDENTITY_GRAPH_READ_NOT_BOUNDED` on every principal-bearing block.
2. **`FakeSession` pages by keyset.** It honours `after`/`limit` on `_READ_PRINCIPALS` and
   `_READ_RESOURCE_GRANTS`, returning rows ordered by `resource_uid` strictly after the cursor.
   Slicing a whole list to `limit` would answer every page with the same first rows, so the walk
   would never advance.
3. **Truncation is produced, not asserted.** 201 real roles at `MAX_PRINCIPALS` 200 /
   `PRINCIPAL_PAGE_SIZE` 50, instead of one row declaring a total of 2. Substituting a number for
   the thing it describes is the defect this lane keeps finding.

### Provenance of the legacy fixture — read this before re-running

`estate-identity-graph-6e08d6b2.json` was emitted by **this recipe as it stood at git `64d19479`**,
against backend `6e08d6b2`. The recipe has since changed its INPUT ROWS for the three reasons
above, so re-running it today against `6e08d6b2` produces **different bytes** — most visibly the
old `PRINCIPALS_TRUNCATED` case, which that reader signalled from `principals_total` and which no
longer exists as an input.

The recipe still RUNS against `6e08d6b2` (the fake answers the un-paged read shape, and the
coverage argument is passed only when the backend defines `REQUIRED_FAMILIES`), so the legacy
states remain reachable. But to reproduce the committed legacy bytes exactly, check out the recipe
at `64d19479`. Both files are kept: the legacy one is the contract in force until F integrates, and
the candidate is what the consumer is being reconciled against.

### `producer_refusal.inventory_authority_invalid` — a refusal with no name

Builder output, **not** a composed block: nothing about it was assembled by the
recipe, and no gap was written by hand.

`INVENTORY_AUTHORITY_INVALID` is the code `build_estate_identity_access`
publishes when a refusal happened that its own contract cannot name. In
`_read_inventory_authority` a malformed receipt raises a `ValueError` whose
message is not a refusal code; rather than promote an exception message into
the payload's vocabulary, the builder emits this catch-all with a detail that
names only the exception **type**. So the code is real, the refusal is real,
and the diagnosis behind it does not exist.

Reached through the producer's own harness by malforming exactly one receipt
field — `workload_binding_count`, the census of role bindings the generation
certified — to `-1`. A negative census cannot be one, so
`_strict_nonnegative_int` refuses it. No backend file was edited.

| | |
|---|---|
| `status` | `unavailable` |
| gap | `INVENTORY_AUTHORITY_INVALID` — *"Canonical inventory role bindings could not be verified: ValueError."* |
| `roles_total` | **`null`** — the absence of an answer, not a census of zero |
| `inventory_authority` | the generation's real receipt, which a hand-written gap would not carry |

The recipe **fails closed** on it: if the malformed field stops producing this
refusal — because a future backend names the failure, validates the census
earlier, or stops refusing — the recipe exits non-zero and writes nothing,
rather than committing a fixture that no longer carries the state it is named
for. Verified by setting the field well-formed: exit 1, zero bytes written.

The consumer rule this fixture exists for lives in
`components/topology-v0-2/estate-identity-access-model.ts`
(`UNNAMED_REFUSAL_GAP_CODES` / `gapNamesItsCause`): the lens prints every gap as
`CODE — detail`, which is how a named diagnosis is presented, so a code that
names no cause is marked as a refusal rather than shown as a finding. The code
itself is still displayed and the producer's wording is never rewritten.

### Emitter guard, hardened

The guard asserted the absence of one named code, `IDENTITY_GRAPH_READ_FAILED`. When CF01-F added
`IDENTITY_GRAPH_READ_NOT_BOUNDED` it sailed straight through and every principal-bearing block was
written as `unavailable` with exit 0 — the same fail-open shape as a check that only fires on an
explicit `False`. It now asserts what a read must ACHIEVE (no block that should have been read may
come back `unavailable`), which no new refusal code can outrun.
