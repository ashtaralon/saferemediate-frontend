/**
 * What the orphan page can actually do, family by family — with READ support
 * and ACTION support kept deliberately apart.
 *
 * P0.3 (14 September 2026). The panel used to fetch all four detection
 * families and keep its initial empty state for any that failed, so a refused
 * request rendered "No orphan or stale IAM roles to surface." — an orphan
 * CONCLUSION drawn from a request that never returned a population. It also
 * offered Quarantine and Delete on every row, including rows it had never
 * read.
 *
 * The first fix was to stop asking questions whose answer is a known refusal.
 * The second, and the reason this file has two matrices instead of one: **a
 * read being available says nothing about an action being available.** They
 * are different routes with different failure modes, and conflating them put a
 * Delete button on the one family whose findings we can actually serve.
 *
 * ## Read support
 *
 *   - `api/serving_boundary.py::live_aws_forbidden()` is true whenever
 *     `in_http_request()` is true. Every request-path call is therefore
 *     forbidden from reaching live AWS, in every process, by design —
 *     collection and mutation are the only two boundaries that may call it.
 *   - `GET /api/iam-roles/orphan-detection`, `GET /api/iam-policies/orphan-detection`
 *     and `GET /api/s3-buckets/orphan-detection` each enumerate the account
 *     (`iam:ListRoles`, `iam:ListPolicies`, `s3:ListBuckets`) to build their
 *     population, so each consults that boundary and raises
 *     `503 live_aws_disabled_on_neptune_serve: …`.
 *   - `GET /api/security-groups/orphan-detection` looked like the exception:
 *     it has a graph-backed reader (`_detect_orphan_security_groups_from_graph`)
 *     and never calls live AWS. But graph-backed INPUTS do not make the
 *     OUTPUT factual. That function hands its rows to the legacy
 *     `determine_status_and_severity` calculator, counts `orphan_count` and
 *     `unused_count` from the status it returns, DROPS every row the
 *     calculator calls active unless `include_active` is set, and ships
 *     `status`, `severity`, `recommendation`, `safe_to_delete` and
 *     `confidence` in the payload. The population itself is selected by that
 *     judgement, so there is no subset of the response a consumer can quote
 *     without quoting it. Hiding `recommendation` did not fix that; only
 *     migrating the judgement does, and P4D.4 owns it.
 *
 * ## Action support
 *
 * **No HTTP action is available from this page today — for any family,
 * security groups included.** Two independent reasons, both read off the
 * routes rather than assumed:
 *
 *   - **Delete.** `api/orphan_sg_detection.py::delete_orphan_sg` consults
 *     `live_aws_forbidden()` before anything else, exactly as the other three
 *     DELETEs do. Since that predicate is true for every inbound HTTP request,
 *     the direct delete is guaranteed to answer `503`. A working read does not
 *     make its sibling DELETE work; they are separate routes.
 *   - **Quarantine.** `api/quarantine.py::PreCheckRequest` declares
 *     `systemName: str` with no default, and **this view does not carry a
 *     `systemName`**: it has nothing to send, `JSON.stringify` drops the
 *     undefined field, and the call is guaranteed to answer `422`. (Note what
 *     this page's scope actually is, because "account-wide" was the wrong
 *     word for it: the SG read is **deployment-scoped**. Its graph calculator
 *     calls `resolve_system_name(None)`, which resolves ONE system from the
 *     deployment's own tenant pin, answers `422` naming the systems when the
 *     tenant has several, and `503` when it can resolve none. So the page
 *     shows the current deployment scope, not an account.) Beyond that,
 *     `pre_check`
 *     runs `CREATE (q:QuarantineRecord …)` against the graph straight from the
 *     web request — it is not the controlled Decision executor, it never
 *     consults the serving boundary, and it has not been shown to work from
 *     the read-only serving identity at all.
 *
 * So the page is **informational**: it shows the findings it can honestly
 * serve and renders no control it cannot honour. Quarantine and delete return
 * when they have a controlled execution route — `api.quarantine` is `P8 /
 * MIGRATE / receipt.verify` under the Decision Layer Core Owner, and P4D.4
 * owns separating analytical claims from control commands on exactly these
 * orphan/quarantine surfaces. Flip the entry here when that route exists; do
 * not flip it because a read started working.
 */

export type OrphanFamily = "iam_role" | "s3_bucket" | "iam_policy" | "security_group"

/** Resource-type labels the quarantine and delete routes use. */
export type OrphanResourceType = "IAMRole" | "S3Bucket" | "IAMPolicy" | "SecurityGroup"

/** Why a family has no answer. `boundary` distinguishes "the serving tier is
 *  not allowed to look" from "the request failed". */
export type Unavailable = { reason: string; boundary: boolean }

export const FAMILY_BY_RESOURCE_TYPE: Record<OrphanResourceType, OrphanFamily> = {
  IAMRole: "iam_role",
  S3Bucket: "s3_bucket",
  IAMPolicy: "iam_policy",
  SecurityGroup: "security_group",
}

// ---------------------------------------------------------------------------
// Read support
// ---------------------------------------------------------------------------

export type ReadSupport = {
  /** Backend path, for the record — an unsupported family is never fetched. */
  endpoint: string
  /**
   * The Next.js proxy path the UI would use. Recorded rather than derived:
   * the proxy tree drops the backend path's leading segment, so gluing the
   * proxy prefix onto the backend path doubles that segment and produces a
   * path that matches no call site. A test that built the path that way
   * passed while the forbidden request was sitting right there.
   */
  proxyPath: string
  supported: boolean
  unavailable?: Unavailable
}

function boundaryRefusal(population: string): Unavailable {
  return {
    boundary: true,
    reason:
      `Not available on this deployment. The orphan population for this family ` +
      `can only come from ${population}, and the serving tier is not permitted ` +
      `to call live AWS. Nothing was enumerated, so no orphan conclusion can be ` +
      `drawn — this is "not looked at", not "none found".`,
  }
}

export const ORPHAN_READ_SUPPORT: Record<OrphanFamily, ReadSupport> = {
  iam_role: {
    endpoint: "/api/iam-roles/orphan-detection",
    proxyPath: "/api/proxy/iam-roles/orphan-detection",
    supported: false,
    unavailable: boundaryRefusal("an `iam:ListRoles` enumeration of the account"),
  },
  s3_bucket: {
    endpoint: "/api/s3-buckets/orphan-detection",
    proxyPath: "/api/proxy/s3-buckets/orphan-detection",
    supported: false,
    unavailable: boundaryRefusal("an `s3:ListBuckets` enumeration of the account"),
  },
  iam_policy: {
    endpoint: "/api/iam-policies/orphan-detection",
    proxyPath: "/api/proxy/iam-policies/orphan-detection",
    supported: false,
    unavailable: boundaryRefusal("an `iam:ListPolicies` enumeration of the account"),
  },
  security_group: {
    endpoint: "/api/security-groups/orphan-detection",
    proxyPath: "/api/proxy/security-groups/orphan-detection",
    supported: false,
    unavailable: {
      // Not a boundary refusal: this one would answer. The reason it must not
      // be shown is that what it answers is a judgement, not a fact.
      boundary: false,
      reason:
        "Not available pending decision migration. The collected graph facts " +
        "for security groups exist, but this endpoint does not return them " +
        "unclassified: it selects and grades its findings through the legacy " +
        "determine_status_and_severity calculator, which decides the orphan " +
        "and unused counts, drops the rows it calls active, and supplies " +
        "status, severity, recommendation, safe_to_delete and confidence. " +
        "P4D.4 must migrate that judgement into the Decision Layer before " +
        "this orphan surface can present it. A factual source does not make " +
        "a classifier's output authoritative.",
    },
  },
}

export function readSupported(family: OrphanFamily): boolean {
  return ORPHAN_READ_SUPPORT[family].supported
}

/** The declared refusal for a family's read, or undefined when it can be served. */
export function declaredUnavailable(family: OrphanFamily): Unavailable | undefined {
  const entry = ORPHAN_READ_SUPPORT[family]
  return entry.supported ? undefined : entry.unavailable
}

export function readSupportedFamilies(): OrphanFamily[] {
  return (Object.keys(ORPHAN_READ_SUPPORT) as OrphanFamily[]).filter(readSupported)
}

export function readUnsupportedFamilies(): OrphanFamily[] {
  return (Object.keys(ORPHAN_READ_SUPPORT) as OrphanFamily[]).filter((f) => !readSupported(f))
}

// ---------------------------------------------------------------------------
// Action support — separate on purpose. See the header.
// ---------------------------------------------------------------------------

export type ActionSupport = {
  supported: boolean
  /** The route an action would use, named so the claim can be checked. */
  routes: string[]
  /** Why it is not available, in the UI's own words. */
  reason: string
  /** Who owns providing the controlled route. A phase, not a person. */
  owner: string
}

const QUARANTINE_BLOCKED =
  "Quarantine posts to /api/quarantine/pre-check, which requires a systemName " +
  "this view does not carry (guaranteed 422) and which writes a " +
  "QuarantineRecord to the graph straight from the web request rather than " +
  "through a controlled execution route."

const DELETE_BLOCKED_BY_BOUNDARY =
  "The DELETE consults the serving boundary before anything else, and that " +
  "predicate is true for every inbound HTTP request, so it is guaranteed to " +
  "refuse with 503."

const ACTION_OWNER =
  "P8 (api.quarantine — receipt-verified execution, Decision Layer Core Owner); " +
  "P4D.4 separates analytical claims from control commands on this surface"

function blocked(routes: string[], extra: string): ActionSupport {
  return {
    supported: false,
    routes,
    reason: `${extra} ${QUARANTINE_BLOCKED}`,
    owner: ACTION_OWNER,
  }
}

export const ORPHAN_ACTION_SUPPORT: Record<OrphanResourceType, ActionSupport> = {
  IAMRole: blocked(
    ["DELETE /api/iam-roles/{role_name}", "POST /api/quarantine/pre-check"],
    DELETE_BLOCKED_BY_BOUNDARY,
  ),
  S3Bucket: blocked(
    ["DELETE /api/s3-buckets/{bucket_name}", "POST /api/quarantine/pre-check"],
    DELETE_BLOCKED_BY_BOUNDARY,
  ),
  IAMPolicy: blocked(
    ["DELETE /api/iam-policies/by-arn", "POST /api/quarantine/pre-check"],
    DELETE_BLOCKED_BY_BOUNDARY,
  ),
  // The read works. The actions do not, for exactly the same reasons as the
  // other three — this is the entry a "reads work, so actions work" shortcut
  // gets wrong.
  SecurityGroup: blocked(
    ["DELETE /api/security-groups/{sg_id}", "POST /api/quarantine/pre-check"],
    DELETE_BLOCKED_BY_BOUNDARY,
  ),
}

export function actionsSupported(type: OrphanResourceType): boolean {
  return ORPHAN_ACTION_SUPPORT[type].supported
}

/** True only if SOME family can act. While false, the page renders no control. */
export function anyActionSupported(): boolean {
  return (Object.keys(ORPHAN_ACTION_SUPPORT) as OrphanResourceType[]).some(actionsSupported)
}

/** The one-line banner the page shows while no action is available. */
export const ACTION_UNAVAILABLE_NOTE =
  "Read-only. Quarantine and delete are not available from this page: the " +
  "delete routes refuse every request-path call at the serving boundary, and " +
  "the quarantine route needs a systemName this view does not carry. They " +
  "return with a controlled execution route (P8 / P4D.4)."

/** How the page describes its own scope. The SG read is resolved from the
 *  deployment's tenant pin, not enumerated across an account. */
export const SCOPE_NOTE =
  "Findings are scoped to the current deployment scope, which the server " +
  "resolves from its own tenant pin — not an enumeration of the AWS account."
