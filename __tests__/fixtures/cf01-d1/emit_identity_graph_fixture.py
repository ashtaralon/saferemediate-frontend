"""CF01 · D1 — emit the identity fixtures the shared-canvas lens is tested on.

Run from the frontend checkout with the backend checkout on PYTHONPATH::

    PYTHONPATH=/path/to/saferemediate-backend python \
        __tests__/fixtures/cf01-d1/emit_identity_graph_fixture.py \
        > __tests__/fixtures/cf01-d1/estate-identity-graph-<candidate>.json

The backend commit these bytes came from is NOT named here. This docstring is
prose maintained by hand, and it drifted: it went on naming 6e08d6b2 long after
the bytes came from a later lane-F commit. Provenance lives in the emitted
``_backend`` key alone, resolved at emit time from the source that actually
produced the output, and carrying an explicit dirty flag.

WHY THIS FILE STILL EXISTS AFTER LANE F
---------------------------------------
Before 6e08d6b2 the backend's own fixture emitter could not serve the identity
graph at all: its in-memory graph did not model the identity-graph queries and
``_read_identity_graph`` swallows every exception, so every committed payload
carried ``IDENTITY_GRAPH_READ_FAILED``. This recipe existed to give the lens a
graph to be tested against.

Lane F fixed the producer side, and ``__tests__/fixtures/
estate-identity-access.json`` now carries a REAL graph (5 nodes, 13 edges, 9
families) in three of the account-context states. This recipe is NOT retired,
because it is the only way to reach the states the backend emitter does not
ship a fixture for and which the lens must still render as typed refusals
rather than as emptiness:

  * ``ACCOUNT_POLICY_CONTEXT_FOREIGN``    — the row names another account
  * ``ACCOUNT_POLICY_CONTEXT_AMBIGUOUS``  — two rows in one generation
  * ``ACCOUNT_POLICY_CONTEXT_INCOMPLETE`` — organization_present not a boolean
  * ``PRINCIPALS_TRUNCATED``              — the reader cut the principal list
  * ``IDENTITY_GRAPH_READ_FAILED``        — the bounded reader itself raised
  * a canonical attribute that does not decode

The first three are the reason lane F refuses a foreign row rather than
borrowing it, and a screen that showed any of them as "not in an organisation"
would answer a question nobody asked with another account's guardrails.

WHAT IS REAL HERE AND WHAT IS NOT
---------------------------------
* Every ``identity_access`` payload in the ``v1`` section is the literal return
  value of ``scripts.estate_identity_access.build_estate_identity_access`` as
  produced by the backend's own fixture emitter
  (``scripts/emit_estate_identity_access_fixtures.py``), unmodified.
* Every ``identity_graph`` block is the literal return value of
  ``scripts.estate_identity_access._read_identity_graph`` -- the producer's
  own bounded reader -- driven through a fake graph session that answers the
  reads in ``scripts/estate_identity_graph.py`` (``_READ_PRINCIPALS``, issued
  once per entry in ``PRINCIPAL_TYPES + ACCOUNT_CONTEXT_TYPES``;
  ``_READ_POLICY_RESOURCES``; ``_READ_USER_CREDENTIALS``;
  ``_READ_RESOURCE_GRANTS``; ``_READ_PRINCIPAL_GRANTS`` is not issued by that
  reader) with rows shaped exactly as those queries RETURN them. The rows
  themselves are the inputs listed under ``_inputs``; the principal rows follow
  the record shapes in ``tests/test_estate_identity_graph.py`` (``_role`` /
  ``_user``) and the account-policy-context rows are the backend emitter's own
  ``account_context_row()``, imported rather than retyped. Nothing in an output
  was edited to reach a state.
* ``composed.ready_with_graph`` is the emitter's ``ready`` v1 payload with its
  ``identity_graph`` replaced by the ``ready`` graph block above. Only that one
  key differs from the emitter output. Since 6e08d6b2 the emitter's own
  ``identity_graph`` is itself a real read, so this substitution now swaps one
  real graph for a richer one rather than papering over a failure.

The backend in-memory graph raises on any unmodelled query, and this fake does
the same: an unanswered read must surface as a failure, never as an empty
result that reads as "no identities". The same rule governs the account-context
read: an unknown ``$resource_type`` raises instead of falling through to the
user rows, because returning IAM users for an Organizations read would invent
an account context out of two principals.
"""
from __future__ import annotations

import json
import sys
from typing import Any


def _require_backend() -> None:
    try:
        import scripts.estate_identity_graph  # noqa: F401
    except ModuleNotFoundError as exc:  # pragma: no cover - operator guidance
        raise SystemExit(
            "backend not importable: put the saferemediate-backend checkout "
            f"(6e08d6b2 or later) on PYTHONPATH ({exc})"
        )


_require_backend()

from scripts import estate_identity_access as identity  # noqa: E402
from scripts import estate_identity_graph as g  # noqa: E402
from scripts import emit_estate_identity_access_fixtures as emitter  # noqa: E402

# Fail on an OLD backend rather than emitting a fixture that silently lacks the
# account-context families. A fixture that merely looks thin is the exact
# failure lane F was created to stop, so it must not be reachable from here.
_REQUIRED_FAMILIES = {
    "ACCOUNT_IN_ORGANIZATION",
    "ACCOUNT_IN_ORG_UNIT",
    "ACCOUNT_LIMITED_BY_SCP",
    "ACCOUNT_LIMITED_BY_RCP",
}
_missing = _REQUIRED_FAMILIES - set(g.EDGE_FAMILIES)
if _missing:  # pragma: no cover - operator guidance
    raise SystemExit(
        "backend predates CF01 lane F (6e08d6b2): EDGE_FAMILIES is missing "
        f"{sorted(_missing)}. Point PYTHONPATH at the assembled candidate."
    )
if not hasattr(emitter, "account_context_row"):  # pragma: no cover
    raise SystemExit(
        "backend emitter has no account_context_row(); this recipe imports the "
        "producer's own row rather than retyping it, and will not guess at it."
    )

def _backend_provenance() -> dict[str, Any]:
    """Identify the bytes' actual producer, in a form another machine can check.

    Three things this must NOT do, each of which it did before:

    * name a commit that is not the one the bytes came from -- resolving the
      value at emit time fixed HOW it is obtained without establishing that
      what it obtains is right;
    * carry a filesystem path -- that says where someone's working copy
      happened to sit, not what produced the output, and resolves differently
      or not at all on any other machine;
    * omit whether the source tree was CLEAN -- with uncommitted changes the
      commit id does not describe the bytes at all, it names a commit the
      output may not correspond to. A provenance record that can be wrong
      without being detectably wrong is worse than none.

    So: commit, subject, and an explicit ``dirty`` flag listing what was
    modified. An unreadable source resolves to ``UNKNOWN`` rather than to
    anything plausible-looking.
    """
    import subprocess
    from pathlib import Path

    root = Path(g.__file__).resolve().parent.parent

    def _git(*args: str) -> str:
        return subprocess.run(
            ["git", "-C", str(root), *args],
            capture_output=True, text=True, check=True,
        ).stdout.strip()

    try:
        status = _git("status", "--porcelain")
        dirty = [line[3:] for line in status.splitlines() if line.strip()]
        return {
            "repo": "saferemediate-backend",
            "commit": _git("rev-parse", "HEAD"),
            "subject": _git("log", "-1", "--format=%s"),
            # Explicit, and a list rather than a boolean: a reader can see
            # WHICH files were uncommitted and judge whether they could have
            # affected these bytes.
            "dirty": bool(dirty),
            "uncommitted_paths": sorted(dirty)[:20],
        }
    except Exception:  # noqa: BLE001 - provenance we cannot read is unknown
        return {
            "repo": "saferemediate-backend",
            "commit": "UNKNOWN",
            "subject": "UNKNOWN",
            "dirty": None,
            "uncommitted_paths": [],
        }


#: Every `_READ_*` Cypher constant the graph producer defines, by value, so an
#: executed query can be resolved back to the name the capability matrix cites.
_STATEMENT_NAMES = {
    getattr(g, _name): f"scripts.estate_identity_graph.{_name}"
    for _name in dir(g)
    if _name.startswith("_READ_") and isinstance(getattr(g, _name), str)
}

ACCOUNT = "416651950952"
TENANT = "testbed-webshop"
GENERATION = 31

# The two roles the emitter's own v1 payloads bind (ready: web; partial: api +
# web). Taken from the emitter at import time so the graph's iam_role nodes
# join the v1 roles by role_id / ARN instead of standing beside them as a
# second set of principals.
_V1 = emitter.fixtures()
_V1_ROLES = {role["name"]: role for role in _V1["partial"]["roles"]}
_WEB = _V1_ROLES["web"]
_API = _V1_ROLES["api"]
ROLE_ARN = _WEB["role_arn"]
ROLE_ID = _WEB["role_id"]
ROLE_NAME = _WEB["name"]
ROLE_UID = f"aws:iam:role:{ACCOUNT}:{ROLE_NAME}"
API_ROLE_ARN = _API["role_arn"]
API_ROLE_ID = _API["role_id"]
API_ROLE_NAME = _API["name"]
API_ROLE_UID = f"aws:iam:role:{ACCOUNT}:{API_ROLE_NAME}"
ALICE_ARN = f"arn:aws:iam::{ACCOUNT}:user/alice"
ALICE_UID = f"aws:iam:user:{ACCOUNT}:alice"
BOB_ARN = f"arn:aws:iam::{ACCOUNT}:user/bob"
BOB_UID = f"aws:iam:user:{ACCOUNT}:bob"
APP_POLICY_ARN = f"arn:aws:iam::{ACCOUNT}:policy/webshop-app"
APP_POLICY_UID = f"aws:iam:policy:{ACCOUNT}:webshop-app"
BOUNDARY_ARN = f"arn:aws:iam::{ACCOUNT}:policy/webshop-boundary"
AWS_MANAGED_ARN = "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"
BUCKET_ARN = "arn:aws:s3:::cyntro-testbed-webshop-assets"
KEY_ARN = f"arn:aws:kms:eu-west-1:{ACCOUNT}:key/1111-2222"


def role_row(**overrides: Any) -> dict[str, Any]:
    row = {
        # NO principals_total. Under CF01-F `read_paged` REFUSES a statement
        # whose rows carry a populated total field: a value there means a
        # collect()/size() census was put back in front of the LIMIT, which is
        # the shape the paged read exists to retire. The population is counted
        # by exhausting it, or not counted at all.
        "resource_uid": ROLE_UID,
        "resource_type": "iam:role",
        "arn": ROLE_ARN,
        "name": ROLE_NAME,
        "native_id": ROLE_NAME,
        "region": "global",
        "lifecycle_state": "ACTIVE",
        "iam_path": "/",
        "role_id": ROLE_ID,
        "user_id": None,
        "create_date": "2026-01-01T00:00:00Z",
        "permissions_boundary": BOUNDARY_ARN,
        "attached_managed_policy_arns_json": json.dumps([APP_POLICY_ARN, AWS_MANAGED_ARN]),
        "inline_policies_json": json.dumps([{"policy_name": "webshop-inline-s3"}]),
        "group_names_json": None,
        "assume_role_policy": json.dumps(
            {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"Service": "ec2.amazonaws.com"},
                        "Action": "sts:AssumeRole",
                    },
                    {
                        "Effect": "Allow",
                        "Principal": {"AWS": f"arn:aws:iam::{ACCOUNT}:root"},
                        "Action": "sts:AssumeRole",
                        "Condition": {"Bool": {"aws:MultiFactorAuthPresent": "true"}},
                    },
                    {
                        "Effect": "Allow",
                        "Principal": {
                            "Federated": f"arn:aws:iam::{ACCOUNT}:oidc-provider/token.actions.githubusercontent.com"
                        },
                        "Action": "sts:AssumeRoleWithWebIdentity",
                    },
                ],
            }
        ),
        "instance_profile_arns_json": json.dumps(
            [f"arn:aws:iam::{ACCOUNT}:instance-profile/{ROLE_NAME}"]
        ),
        "managed_policy_documents_available": True,
        "credential_state_available": None,
    }
    row.update(overrides)
    return row


def user_row(**overrides: Any) -> dict[str, Any]:
    row = role_row(
        resource_uid=ALICE_UID,
        resource_type="iam:user",
        arn=ALICE_ARN,
        name="alice",
        native_id="alice",
        role_id=None,
        user_id="AIDAEXAMPLEALICE",
        permissions_boundary=None,
        attached_managed_policy_arns_json=json.dumps([AWS_MANAGED_ARN]),
        inline_policies_json=None,
        group_names_json=json.dumps(["webshop-admins"]),
        assume_role_policy=None,
        instance_profile_arns_json=None,
        credential_state_available=True,
    )
    row.update(overrides)
    return row


ROLES = [
    role_row(),
    role_row(
        resource_uid=API_ROLE_UID,
        arn=API_ROLE_ARN,
        name=API_ROLE_NAME,
        native_id=API_ROLE_NAME,
        role_id=API_ROLE_ID,
        permissions_boundary=None,
        attached_managed_policy_arns_json=json.dumps([APP_POLICY_ARN]),
        inline_policies_json=None,
        assume_role_policy=json.dumps(
            {"Statement": [{"Effect": "Allow", "Principal": "*", "Action": "sts:AssumeRole"}]}
        ),
        managed_policy_documents_available=False,
    ),
]

# A wildcard principal CONSTRAINED BY A CONDITION -- the shape real trust
# policies actually use, and the one the lens must not fold into "anyone may
# assume". The producer reports is_wildcard_principal=true AND
# has_conditions=true; the PrincipalOrgID is what bounds who may assume, so a
# badge that drops the condition states the opposite of the document.
CONDITIONAL_WILDCARD_ROLE_UID = "aws:iam:role:416651950952:partner"
CONDITIONAL_WILDCARD_ROLE_ARN = f"arn:aws:iam::{ACCOUNT}:role/partner"
CONDITIONAL_WILDCARD_ROLE = role_row(
    resource_uid=CONDITIONAL_WILDCARD_ROLE_UID,
    arn=CONDITIONAL_WILDCARD_ROLE_ARN,
    name="partner",
    native_id="partner",
    role_id="AROAEXAMPLEPARTNER",
    permissions_boundary=None,
    attached_managed_policy_arns_json=None,
    inline_policies_json=None,
    assume_role_policy=json.dumps(
        {
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": "sts:AssumeRole",
                    "Condition": {"StringEquals": {"aws:PrincipalOrgID": "o-fixtureorg1"}},
                }
            ]
        }
    ),
)
USERS = [
    user_row(),
    user_row(
        resource_uid=BOB_UID,
        arn=BOB_ARN,
        name="bob",
        native_id="bob",
        user_id="AIDAEXAMPLEBOB",
        attached_managed_policy_arns_json=None,
        group_names_json=None,
    ),
]
POLICIES = [
    {
        "arn": APP_POLICY_ARN,
        "resource_uid": APP_POLICY_UID,
        "name": "webshop-app",
        "policy_id": "ANPAEXAMPLEAPP",
        "aws_managed": False,
        "attachment_count": 2,
        "default_version_id": "v3",
        "update_date": "2026-08-01T00:00:00Z",
    }
]
CREDENTIALS = [
    {
        "target_arn": ALICE_ARN,
        "resource_uid": f"aws:iam:user-credential-state:{ACCOUNT}:alice",
        "has_console_access": True,
        "console_access_acquired": True,
        "password_last_used": "2026-09-10T08:00:00Z",
        "has_mfa": True,
        "mfa_device_count": 1,
        "mfa_acquired": True,
        "access_key_count": 2,
        "active_access_key_count": 2,
        "access_keys_json": json.dumps(
            [
                {
                    "access_key_id": "AKIAEXAMPLEUSED",
                    "status": "Active",
                    "create_date": "2026-03-01T00:00:00Z",
                    "last_used_date": "2026-09-14T06:00:00Z",
                    "last_used_service": "s3",
                    "last_used_region": "eu-west-1",
                },
                {"access_key_id": "AKIAEXAMPLENEVER", "status": "Active", "create_date": "2026-06-01T00:00:00Z"},
            ]
        ),
        "access_keys_acquired": True,
    },
    {
        "target_arn": BOB_ARN,
        "resource_uid": f"aws:iam:user-credential-state:{ACCOUNT}:bob",
        "has_console_access": None,
        "console_access_acquired": False,
        "password_last_used": None,
        "has_mfa": None,
        "mfa_device_count": None,
        "mfa_acquired": False,
        "access_key_count": None,
        "active_access_key_count": None,
        "access_keys_json": None,
        "access_keys_acquired": False,
    },
]
RESOURCE_GRANTS = [
    {
        "resource_uid": f"aws:s3:bucket-authorization:{ACCOUNT}:cyntro-testbed-webshop-assets",
        "resource_type": "s3:bucket-authorization",
        "target_arn": BUCKET_ARN,
        "arn": BUCKET_ARN,
        "name": "cyntro-testbed-webshop-assets",
        "region": "eu-west-1",
    },
    {
        "resource_uid": f"aws:kms:key-authorization:{ACCOUNT}:1111-2222",
        "resource_type": "kms:key-authorization",
        "target_arn": KEY_ARN,
        "arn": KEY_ARN,
        "name": "webshop-data-key",
        "region": "eu-west-1",
    },
]


# ── the account's Organizations context (CF01 lane F) ─────────────────────
#
# `_READ_PRINCIPALS` is issued once per resource_type in
# `PRINCIPAL_TYPES + ACCOUNT_CONTEXT_TYPES`, so the account-policy-context row
# arrives through the SAME statement as the principals and must be dispatched
# on `$resource_type`, not on call order.
#
# The rows come from the backend emitter's own `account_context_row()`; only
# the fields each state is ABOUT are overridden, so a state is reached by
# changing an input, never by editing an output.
ACCOUNT_CONTEXT_TYPE = g.ACCOUNT_CONTEXT_TYPES[0]

# In an organisation: account -> OU -> root, with an OU-level SCP, a root-level
# AWS-managed SCP and a root-level RCP. Every one of them is INHERITED.
ACCOUNT_CONTEXT_IN_ORG = [emitter.account_context_row()]

# Positively standalone, and backed: the normalizer refuses a standalone
# account that carries any hierarchy or layer at all, so these must be null.
ACCOUNT_CONTEXT_STANDALONE = [
    emitter.account_context_row(
        organization_present=False,
        organization_id=None,
        management_account_id=None,
        organization_policy_type_statuses_json=None,
        organization_hierarchy_json=None,
        organization_policy_layers_json=None,
    )
]

# A row that names a DIFFERENT account. The read is already pinned to this
# account, so this means the generation is not what it claims; the producer
# refuses it instead of attributing another account's SCPs to this one.
ACCOUNT_CONTEXT_FOREIGN = [
    emitter.account_context_row(native_id="222233334444", name="222233334444")
]

# Two rows for one account in one generation: neither is used.
ACCOUNT_CONTEXT_AMBIGUOUS = [
    emitter.account_context_row(),
    emitter.account_context_row(
        resource_uid=f"aws:organizations:global:{ACCOUNT}:account-policy-context/duplicate",
    ),
]

# organization_present is not an explicit boolean: neither membership nor
# standalone may be claimed, and defaulting it either way invents the answer
# this whole family exists to report.
ACCOUNT_CONTEXT_INCOMPLETE = [
    emitter.account_context_row(organization_present=None)
]


class FakeSession:
    """Answers exactly the reads scripts.estate_identity_graph issues."""

    def __init__(
        self,
        *,
        roles: list[dict[str, Any]],
        users: list[dict[str, Any]],
        policies: list[dict[str, Any]],
        credentials: list[dict[str, Any]],
        grants: list[dict[str, Any]],
        account_context: list[dict[str, Any]] | None = None,
    ) -> None:
        self.roles, self.users, self.policies = roles, users, policies
        self.credentials, self.grants = credentials, grants
        # Default EMPTY, not "in an organisation": a caller that says nothing
        # about the account context gets the honest absent state and its named
        # gap, which is what the generation would really hold.
        self.account_context = list(account_context or [])
        self.queries: list[tuple[str, dict[str, Any]]] = []

    @staticmethod
    def _page(rows: list[dict[str, Any]], params: dict[str, Any]) -> list[dict[str, Any]]:
        """One keyset page, the way the real statement pages.

        ``read_paged`` walks with a cursor: it asks for rows ordered by
        ``resource_uid`` strictly AFTER ``$after``, at most ``$limit`` of them,
        and treats a short page as proof the population is exhausted. Returning
        a whole list sliced to ``limit`` would answer every page with the same
        first rows, so the walk would never advance and a "total" would only
        ever describe page one.

        `''` sorts below every real resource_uid, which is how the first page
        needs no special case.
        """
        limit = params.get("limit")
        if "after" not in params:
            # A pre-CF01-F-P1 reader issues this statement ONCE with no cursor.
            # Answering it with a keyset page would hand it an empty list for
            # every read, so the old fixture would regenerate as an estate with
            # no identities -- the precise failure this recipe exists to stop.
            return list(rows if limit is None else rows[:limit])
        ordered = sorted(rows, key=lambda row: row["resource_uid"])
        after = params["after"]
        later = [row for row in ordered if row["resource_uid"] > after]
        return later if limit is None else later[:limit]

    def run(self, query: str, **params: Any) -> list[dict[str, Any]]:
        self.queries.append((query, params))
        if query == g._READ_PRINCIPALS:
            resource_type = params["resource_type"]
            if resource_type == "iam:role":
                rows = self.roles
            elif resource_type == "iam:user":
                rows = self.users
            elif resource_type == ACCOUNT_CONTEXT_TYPE:
                rows = self.account_context
            else:
                raise AssertionError(
                    f"unmodelled principal resource_type: {resource_type!r}"
                )
            return self._page(rows, params)
        if query == g._READ_POLICY_RESOURCES:
            wanted = set(params["policy_arns"])
            return [row for row in self.policies if row["arn"] in wanted]
        if query == g._READ_USER_CREDENTIALS:
            wanted = set(params["user_arns"])
            return [row for row in self.credentials if row["target_arn"] in wanted]
        if query == g._READ_RESOURCE_GRANTS:
            return self._page(self.grants, params)
        raise AssertionError(f"unmodelled query: {query[:60]!r}")


REGION = "eu-west-1"
#: A region the fixture estate did NOT certify. Used to produce the
#: "certified elsewhere" state, where the family IS committed but for the wrong
#: region, which is materially different from a family that is missing.
FOREIGN_REGION = "us-east-1"


def _coverage(mode: str) -> dict[str, Any] | None:
    """The coverage receipt to read this generation under.

    CF01-F a361c126 scopes family coverage to a REGION, so the same rows answer
    differently depending on what the activation pointer certified. Four modes,
    each a real producer state rather than a hand-written block:

      committed          - certified REGION, asked REGION. Every family
                           COMMITTED; a single-region generation asked about
                           its own region is complete, not partial.
      certified_elsewhere - certified FOREIGN_REGION, asked REGION. The seven
                           regional families are NOT_COMMITTED because their
                           scope hashes differ; the six global ones are
                           unaffected, being region-invariant.
      region_unproven    - a name receipt but no source vector. Global families
                           settle on the name; regional ones are
                           REGION_UNPROVEN -- present in the generation, region
                           not established. Not COMMITTED (the original defect)
                           and not NOT_COMMITTED (which would invent a missing
                           family).
      unknown            - no receipt at all.

    Scopes come from the projector's own catalogue via the producer's
    ``_expected_family_scopes``, never re-derived here: a second spelling of a
    committed identifier would report a region as uncovered the moment the two
    disagreed.
    """
    if mode == "unknown":
        return g.family_coverage(None, requested_region=REGION)
    expected = identity._expected_family_scopes(
        tenant_id=TENANT, account_id=ACCOUNT, region=REGION
    )
    names = list(g.REQUIRED_FAMILIES)
    if mode == "region_unproven":
        # A name receipt, no vector: the strong per-region answer is absent.
        return g.family_coverage(
            names, expected_scopes=expected, requested_region=REGION
        )
    if mode == "certified_elsewhere":
        elsewhere = identity._expected_family_scopes(
            tenant_id=TENANT, account_id=ACCOUNT, region=FOREIGN_REGION
        )
        hashes = [entry["scope_hash"] for entry in (elsewhere or {}).values()]
    else:
        hashes = [entry["scope_hash"] for entry in (expected or {}).values()]
    return g.family_coverage(
        names,
        expected_scopes=expected,
        committed_scope_hashes=hashes,
        requested_region=REGION,
    )


def read(session: FakeSession, *, committed: bool = True, mode: str | None = None) -> dict[str, Any]:
    """Drive the producer's own bounded reader.

    ``mode`` selects the coverage receipt (see ``_coverage``). ``committed`` is
    the older two-state switch, kept so existing call sites read unchanged:
    True means fully committed for this region, False means no receipt at all.
    """
    # Backwards compatible on purpose: a backend that predates CF01-F-P1 has
    # no REQUIRED_FAMILIES and no coverage parameter, and the committed
    # estate-identity-graph-6e08d6b2.json fixture must stay regenerable from
    # the commit it is named after. A recipe that can only run against the
    # newest producer silently strands the provenance of everything it emitted
    # before.
    if not hasattr(g, "REQUIRED_FAMILIES"):
        return identity._read_identity_graph(
            session, tenant_id=TENANT, account_id=ACCOUNT, generation=GENERATION
        )
    resolved = mode or ("committed" if committed else "unknown")
    return identity._read_identity_graph(
        session,
        tenant_id=TENANT,
        account_id=ACCOUNT,
        generation=GENERATION,
        coverage=_coverage(resolved),
    )


def _principals(**overrides: Any) -> dict[str, Any]:
    """The full principal estate, so only the account context varies."""
    base: dict[str, Any] = dict(
        roles=ROLES, users=USERS, policies=POLICIES,
        credentials=CREDENTIALS, grants=RESOURCE_GRANTS,
    )
    base.update(overrides)
    return base


def main() -> int:
    # NAMED FOR THE STATE THE BYTES CARRY.
    #
    # This estate deliberately includes principals whose source calls were NOT
    # proven acquired -- an api role with no managed-policy documents, a user
    # with unacquired key/console/MFA state -- because the lens has to render
    # that honestly. Under CF01-F those fail closed, so the block is `partial`
    # with four SOURCE_CALL_NOT_ACQUIRED gaps. Calling it `ready` asserted a
    # state its own bytes contradict, and a scenario name is exactly what a
    # reader trusts when scanning rather than re-deriving.
    ready_session = FakeSession(
        **_principals(account_context=ACCOUNT_CONTEXT_IN_ORG)
    )
    partial_unacquired = read(ready_session)

    # A genuinely READY block: same shape, every source call proven acquired,
    # certified for the region being asked about. F's row 1 -- a single-region
    # generation asked about its own region is complete, not partial.
    ready = read(
        FakeSession(
            roles=[role_row(), role_row(
                resource_uid=API_ROLE_UID, arn=API_ROLE_ARN, name=API_ROLE_NAME,
                native_id=API_ROLE_NAME, role_id=API_ROLE_ID,
                permissions_boundary=None,
                attached_managed_policy_arns_json=json.dumps([APP_POLICY_ARN]),
                inline_policies_json=None,
                managed_policy_documents_available=True,
            )],
            users=USERS,
            policies=POLICIES,
            credentials=[
                dict(row, access_keys_acquired=True, console_access_acquired=True,
                     mfa_acquired=True)
                for row in CREDENTIALS
            ],
            grants=RESOURCE_GRANTS,
            account_context=ACCOUNT_CONTEXT_IN_ORG,
        )
    )

    # The THREE account-context states that must never collapse into one
    # another. Only `account_context` differs between them; every principal,
    # policy, credential and grant row is identical, so any difference in the
    # rendered lens is attributable to the account context alone.
    standalone = read(FakeSession(**_principals(account_context=ACCOUNT_CONTEXT_STANDALONE)))
    absent_context = read(FakeSession(**_principals(account_context=[])))

    # The three refusals. Each is a NAMED gap and no account node at all; a
    # screen that rendered any of them as "not in an organisation" would be
    # making a claim the producer explicitly declined to make.
    foreign_context = read(FakeSession(**_principals(account_context=ACCOUNT_CONTEXT_FOREIGN)))
    ambiguous_context = read(FakeSession(**_principals(account_context=ACCOUNT_CONTEXT_AMBIGUOUS)))
    incomplete_context = read(FakeSession(**_principals(account_context=ACCOUNT_CONTEXT_INCOMPLETE)))

    # 1 of 2 roles returned: the reader reports PRINCIPALS_TRUNCATED and status partial.
    # Truncation is PRODUCED, not asserted. Under F a read is truncated by
    # paging past MAX_PRINCIPALS (200) at PRINCIPAL_PAGE_SIZE (50) -- so this
    # builds 201 real roles rather than declaring a total of 2 and hoping the
    # reader believes it. Substituting a number for the thing it describes is
    # the defect this programme keeps finding.
    truncated_roles = [
        role_row(
            resource_uid=f"aws:iam:role:{ACCOUNT}:bulk{index:04d}",
            arn=f"arn:aws:iam::{ACCOUNT}:role/bulk{index:04d}",
            name=f"bulk{index:04d}",
            native_id=f"bulk{index:04d}",
            role_id=f"AROABULK{index:04d}",
            attached_managed_policy_arns_json=None,
            inline_policies_json=None,
            permissions_boundary=None,
        )
        for index in range(g.MAX_PRINCIPALS + 1)
    ]
    truncated = read(
        FakeSession(
            roles=truncated_roles, users=[], policies=POLICIES, credentials=[], grants=[],
            account_context=ACCOUNT_CONTEXT_IN_ORG,
        )
    )

    class RaisingSession(FakeSession):
        def run(self, query: str, **params: Any) -> list[dict[str, Any]]:
            raise RuntimeError("graph unreachable")

    read_failed = read(RaisingSession(roles=[], users=[], policies=[], credentials=[], grants=[]))

    undecodable = read(
        FakeSession(
            roles=[role_row(attached_managed_policy_arns_json="{not json")],
            users=[], policies=[], credentials=[], grants=[],
            account_context=ACCOUNT_CONTEXT_IN_ORG,
        )
    )

    # ── the empty that IS an answer ────────────────────────────────────────
    # The producer's own discriminator is the TOTALS, not the lists:
    # `unavailable_identity_graph` hardcodes nodes_total/edges_total to null,
    # while a real read of an empty scope returns integers. Both carry
    # `nodes: []` / `edges: []`, so a consumer that keys off list length alone
    # renders a failed read as "there is nothing here".
    #
    # These three blocks are the real reader driven over a scope with NO
    # principals, so the difference between them is the account context alone:
    #   standalone   -> status ready, an aws_account node, 0 edges, NO gap.
    #                   A backed claim: this account is standalone and nothing
    #                   is bound. The one empty canvas that is an answer.
    #   in an org    -> status ready, account + org/control-policy edges. Empty
    #                   of principals is not empty of account context.
    #   no context   -> status partial + ACCOUNT_POLICY_CONTEXT_ABSENT. Zero
    #                   nodes, zero edges, but nothing is claimed.
    empty_standalone = read(
        FakeSession(
            roles=[], users=[], policies=[], credentials=[], grants=[],
            account_context=ACCOUNT_CONTEXT_STANDALONE,
        )
    )
    empty_in_org = read(
        FakeSession(
            roles=[], users=[], policies=[], credentials=[], grants=[],
            account_context=ACCOUNT_CONTEXT_IN_ORG,
        )
    )
    # Complete rows, NO committed coverage: partial, because quiet is not
    # evidence that a family was collected.
    coverage_unknown = read(
        FakeSession(**_principals(account_context=ACCOUNT_CONTEXT_IN_ORG)),
        committed=False,
    )

    # CF01-F a361c126. Identical rows, three different regional receipts, so
    # any difference the lens renders is attributable to the receipt alone.
    coverage_certified_elsewhere = read(
        FakeSession(**_principals(account_context=ACCOUNT_CONTEXT_IN_ORG)),
        mode="certified_elsewhere",
    )
    coverage_region_unproven = read(
        FakeSession(**_principals(account_context=ACCOUNT_CONTEXT_IN_ORG)),
        mode="region_unproven",
    )

    empty_no_context = read(
        FakeSession(
            roles=[], users=[], policies=[], credentials=[], grants=[],
            account_context=[],
        )
    )

    # ── Root review, finding 2: a conditional wildcard trust ───────────────
    conditional_wildcard_trust = read(
        FakeSession(
            roles=[CONDITIONAL_WILDCARD_ROLE], users=[], policies=[], credentials=[], grants=[],
            account_context=ACCOUNT_CONTEXT_STANDALONE,
        )
    )

    # ── Root review, finding 1: users present, credential rows absent ──────
    # Two users, zero credential rows. The producer returns status "ready"
    # with NO gap: nothing in estate_identity_access.py checks that a
    # per-user credential row was acquired, and estate_identity_graph.py's
    # status line is readiness only. So "this user has no access key" and
    # "nobody ever read this user's access keys" are the SAME bytes.
    #
    # This block exists to keep the consumer honest about that: the absence of
    # a USER_AUTHENTICATES_WITH edge here is UNKNOWN, not zero, and no
    # frontend query succeeding can establish otherwise.
    users_without_credential_rows = read(
        FakeSession(
            roles=[], users=USERS, policies=POLICIES, credentials=[], grants=[],
            account_context=ACCOUNT_CONTEXT_STANDALONE,
        )
    )

    # THE UNNAMED REFUSAL — produced by the producer, not written here.
    #
    # `INVENTORY_AUTHORITY_INVALID` is the code the projection publishes when a
    # refusal happened that its own contract CANNOT NAME. In
    # `_read_inventory_authority` a malformed receipt raises a ValueError whose
    # message is not a refusal code, and rather than promote an exception
    # message into the payload's vocabulary the builder emits this catch-all
    # with a detail that names only the exception TYPE
    # (`estate_identity_access.py`, the `except ValueError` at the inventory
    # read). So the code is real, the refusal is real, and the DIAGNOSIS behind
    # it does not exist.
    #
    # Reached through the producer's OWN harness by malforming exactly one
    # receipt field: `workload_binding_count` is the census of role bindings
    # the generation certified, and a NEGATIVE census cannot be one, so
    # `_strict_nonnegative_int` refuses it. No backend file is edited and no
    # gap is written by hand — the payload below is the real builder's return
    # value, which is the difference between a fixture and a stand-in.
    #
    # This is the state 996366e9 reported and declined to fabricate: the lens
    # printed any gap code verbatim, so it would have rendered this token as
    # though it were a named finding.
    inventory_authority_invalid = emitter.build(
        emitter.TOPOLOGY,
        emitter.Graph(bindings=[emitter.binding()], binding_count=-1),
        decision_pointer=emitter.pointer(12),
        records_by_role={"AROAEXAMPLE": (emitter.decision(),)},
    )
    # FAIL CLOSED. The malformed field must produce THIS refusal. If a future
    # backend names the failure, validates the census earlier, or stops
    # refusing altogether, this recipe must stop rather than write a fixture
    # that no longer carries the state it is named for.
    _refusal_codes = [
        gap.get("code") for gap in (inventory_authority_invalid.get("gaps") or [])
    ]
    if "INVENTORY_AUTHORITY_INVALID" not in _refusal_codes:
        raise SystemExit(
            "recipe expected INVENTORY_AUTHORITY_INVALID from a negative "
            f"workload_binding_count; the producer emitted {_refusal_codes!r}. "
            "Re-derive the malformed input against the current backend rather "
            "than committing a fixture that does not carry this refusal."
        )
    if inventory_authority_invalid.get("status") != "unavailable":
        raise SystemExit(
            "recipe expected an unavailable projection; got "
            f"{inventory_authority_invalid.get('status')!r}"
        )

    v1 = _V1
    composed_ready = json.loads(json.dumps(v1["ready"]))
    composed_ready["identity_graph"] = partial_unacquired
    composed_partial = json.loads(json.dumps(v1["partial"]))
    composed_partial["identity_graph"] = truncated
    # The lane-F serving path: an inventory-visible lifecycle refusal now
    # CARRIES identity_graph verbatim instead of deleting the key. The v1
    # status is unavailable while the graph it rides on was really read, and a
    # consumer must be able to tell those two apart on one payload.
    composed_refusal = json.loads(json.dumps(v1["unavailable"]))
    composed_refusal["identity_graph"] = partial_unacquired

    # The two payloads that must NEVER render identically. Both have an
    # authoritatively-empty v1 roles projection (roles_total 0, status ready,
    # no gaps) and both draw zero relationships. They differ only in whether
    # the identity graph behind that empty canvas was read at all.
    composed_empty_answer = json.loads(json.dumps(v1["empty_authoritative"]))
    composed_empty_answer["identity_graph"] = empty_standalone
    composed_empty_unread = json.loads(json.dumps(v1["empty_authoritative"]))
    composed_empty_unread["identity_graph"] = read_failed

    # The RECIPROCAL direction: the v1 roles projection is readable and
    # supplies real WORKLOAD_USES_ROLE / ROLE_ACTION_DECISION relationships
    # while the nested graph is absent or was never read. The producer isolates
    # _read_identity_graph failures precisely so this payload stays useful, so
    # a consumer that gates the canvas on the nested graph alone discards data
    # the producer deliberately preserved.
    #   absent  -> a pre-lane-F payload that carries no identity_graph key.
    #   unread  -> the key is carried, and it is a refusal.
    composed_roles_absent_graph = json.loads(json.dumps(v1["ready"]))
    composed_roles_absent_graph.pop("identity_graph", None)
    composed_roles_unread_graph = json.loads(json.dumps(v1["ready"]))
    composed_roles_unread_graph["identity_graph"] = read_failed

    # A POSITIVE assertion, not a list of failure codes to watch for.
    #
    # The previous guard named IDENTITY_GRAPH_READ_FAILED specifically, so when
    # CF01-F added IDENTITY_GRAPH_READ_NOT_BOUNDED it sailed straight through
    # and every principal-bearing block was written as `unavailable` with exit
    # 0 -- the same fail-open shape as a check that only fires on an explicit
    # False. Asserting what a read must ACHIEVE cannot be outrun by a new
    # refusal code.
    for name, block in (
        ("ready", ready), ("partial_unacquired", partial_unacquired), ("standalone", standalone),
        ("absent_context", absent_context), ("truncated", truncated),
        ("empty_standalone", empty_standalone), ("empty_in_org", empty_in_org),
        ("empty_no_context", empty_no_context),
        ("coverage_unknown", coverage_unknown),
        ("coverage_certified_elsewhere", coverage_certified_elsewhere),
        ("coverage_region_unproven", coverage_region_unproven),
    ):  # pragma: no cover - guard
        if block.get("status") == "unavailable":
            raise SystemExit(
                f"graph block {name!r} should have been READ but came back "
                f"unavailable: {block.get('gaps')}. The fake session did not "
                "answer a read the producer issues. Refusing to write a hollow "
                "fixture."
            )

    payload = {
        "_generated_by": "saferemediate-frontend __tests__/fixtures/cf01-d1/emit_identity_graph_fixture.py",
        # PROVENANCE IS RESOLVED FROM THE BACKEND ON PYTHONPATH, NOT PINNED
        # IN A STRING. The previous literal said 6e08d6b2 while the bytes came
        # from a later lane-F commit, which is worse than carrying nothing: a
        # reader diffing against the named commit concludes the bytes are
        # corrupt, or trusts them as reproducible from a commit that cannot
        # produce them.
        "_backend": _backend_provenance(),
        # The recipe's own narrative. It deliberately no longer names a
        # backend commit: the docstring is prose maintained by hand and drifted
        # out of step with the bytes, which is precisely the failure "_backend"
        # exists to prevent. The commit lives in "_backend" alone, resolved at
        # emit time from the source that produced these bytes.
        "_provenance": __doc__.strip(),
        "_inputs": {
            "roles": ROLES,
            "users": USERS,
            "policies": POLICIES,
            "credentials": CREDENTIALS,
            "resource_grants": RESOURCE_GRANTS,
            "account_context_in_org": ACCOUNT_CONTEXT_IN_ORG,
            "account_context_standalone": ACCOUNT_CONTEXT_STANDALONE,
            "account_context_foreign": ACCOUNT_CONTEXT_FOREIGN,
            "account_context_ambiguous": ACCOUNT_CONTEXT_AMBIGUOUS,
            "account_context_incomplete": ACCOUNT_CONTEXT_INCOMPLETE,
            "queries_issued_for_ready": [q[:40] for q, _ in ready_session.queries],
            # The STATEMENT NAMES a real read actually issued, resolved by
            # matching each executed query back to the producer's own
            # constants. This is the consumer-side mirror of F's AST test: the
            # published capability matrix may only name a statement that
            # appears here, so a matrix row citing a bounded read no code path
            # issues cannot pass unnoticed. Recorded as data rather than
            # asserted in the recipe, so the frontend test does the comparing.
            "statements_issued_for_ready": sorted(
                {
                    _STATEMENT_NAMES.get(query, f"UNRESOLVED:{query[:40]}")
                    for query, _ in ready_session.queries
                }
            ),
            "principal_resource_types_read": [
                params["resource_type"]
                for query, params in ready_session.queries
                if query == g._READ_PRINCIPALS
            ],
        },
        "contract_version": g.IDENTITY_GRAPH_CONTRACT_VERSION,
        "edge_families": list(g.EDGE_FAMILIES),
        "node_kinds": list(g.NODE_KINDS),
        "account_context_gap_codes": [
            "ACCOUNT_POLICY_CONTEXT_ABSENT",
            "ACCOUNT_POLICY_CONTEXT_AMBIGUOUS",
            "ACCOUNT_POLICY_CONTEXT_FOREIGN",
            "ACCOUNT_POLICY_CONTEXT_INCOMPLETE",
        ],
        "graph": {
            "ready": ready,
            "partial_source_calls_unacquired": partial_unacquired,
            "standalone_account": standalone,
            "absent_account_policy_context": absent_context,
            "foreign_account_policy_context": foreign_context,
            "ambiguous_account_policy_context": ambiguous_context,
            "incomplete_account_policy_context": incomplete_context,
            "partial_principals_truncated": truncated,
            "unavailable_read_failed": read_failed,
            "unavailable_undecodable": undecodable,
            "empty_authoritative_standalone": empty_standalone,
            "empty_authoritative_in_org": empty_in_org,
            "empty_no_account_policy_context": empty_no_context,
            "coverage_unknown": coverage_unknown,
            "coverage_certified_elsewhere": coverage_certified_elsewhere,
            "coverage_region_unproven": coverage_region_unproven,
            "conditional_wildcard_trust": conditional_wildcard_trust,
            "users_without_credential_rows": users_without_credential_rows,
        },
        # Builder output carrying a refusal the producer cannot name. NOT under
        # `composed`: nothing here was assembled by this recipe.
        "producer_refusal": {
            "inventory_authority_invalid": inventory_authority_invalid,
        },
        "composed": {
            "ready_with_graph": composed_ready,
            "partial_with_truncated_graph": composed_partial,
            "refusal_carrying_graph": composed_refusal,
            "empty_authoritative_with_empty_graph": composed_empty_answer,
            "empty_authoritative_with_unread_graph": composed_empty_unread,
            "valid_role_bindings_absent_graph": composed_roles_absent_graph,
            "valid_role_bindings_unread_graph": composed_roles_unread_graph,
        },
    }
    emitter._check_serialization(payload)
    sys.stdout.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
