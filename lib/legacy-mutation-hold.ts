/**
 * Fail-closed holds for the LEGACY mutation controls: the pre-boundary paths that change AWS through a direct backend
 * route rather than the LP lifecycle (lib/lp-held-mutation.ts, which re-exports this module -- one hold mechanism).
 *
 * Each family is a compiled constant. Nothing here reads the environment or a prop: a host can ADD a hold
 * (`applyDisabled`), never remove one, so a surface that forgets the prop -- or passes `false` -- stays held. A held
 * family is enforced three times, each on its own:
 *   1. the rendered control is disabled and shows the family's reason (legacyControlHeld / LegacyMutationHeldNotice);
 *   2. the click handler refuses before calling its request function;
 *   3. the request function (fetchLegacyMutation) returns a local 423 refusal without calling fetch, and the Next.js
 *      proxy route refuses with the same code before any backend request (lib/server/legacy-mutation-proxy-hold.ts).
 *
 * Not held, and still using fetch directly: read-only calls (simulations, previews, gap analysis), the quarantine
 * pre-check (records a safety score; no AWS write), and approval request / approve / reject (each records an approval
 * decision; no AWS write). A proxy that accepts a dry run forwards it only when the body is an object whose `dry_run`
 * is the boolean `true` (isExplicitDryRun); any other value, including an omitted one, is held.
 */

export type LegacyMutationFamily =
  | "finding_remediate"
  | "sg_remediate"
  | "s3_remediate"
  | "quarantine"
  | "iam_approval_execute"

/** Finding / role remediation. Proxies: /api/proxy/simulate/execute, /api/proxy/remediate,
 *  /api/proxy/safe-remediate/execute, /api/proxy/remediate/execute, and -- unless an explicit dry run --
 *  /api/proxy/iam-roles/remediate, /api/proxy/cyntro/remediate and /api/proxy/attack-path-remediate. Backends reached:
 *  /api/iam-roles/remediate, /api/iam-users/remediate, /api/safe-remediate/execute, /api/s3-remediation/remediate,
 *  /api/remediate/execute. */
export const LEGACY_FINDING_REMEDIATE_ENABLED = false
/** Security-group rule removal: /api/proxy/security-groups/{sg}/remediate, /api/proxy/sg-least-privilege/{sg}/remediate,
 *  /api/proxy/remediation/execute (LeastPrivilegeTab's SG execute; backend /api/remediation/execute). */
export const LEGACY_SG_REMEDIATE_ENABLED = false
/** S3 bucket-policy statement removal: /api/proxy/s3-buckets/remediate. */
export const LEGACY_S3_REMEDIATE_ENABLED = false
/** Quarantine state changes that touch AWS: start-monitor (tags), execute, restore, delete. Pre-check is not held. */
export const LEGACY_QUARANTINE_ENABLED = false
/** Executing an APPROVED IAM approval request: /api/proxy/iam-roles/approval-requests/{id}/execute. */
export const LEGACY_IAM_APPROVAL_EXECUTE_ENABLED = false

export type LegacyMutationHold = {
  family: LegacyMutationFamily
  code: string
  message: string
}

const HOLD_REASONS: Record<LegacyMutationFamily, { code: string; message: string }> = {
  finding_remediate: {
    code: "FINDING_REMEDIATE_HELD",
    message: "Held: backend safety/recovery contract not yet proven for finding remediation.",
  },
  sg_remediate: {
    code: "SG_REMEDIATE_HELD",
    message: "Held: backend safety/recovery contract not yet proven for security-group rule removal.",
  },
  s3_remediate: {
    code: "S3_REMEDIATE_HELD",
    message: "Held: backend safety/recovery contract not yet proven for S3 bucket-policy changes.",
  },
  quarantine: {
    code: "QUARANTINE_HELD",
    message: "Held: backend safety/recovery contract not yet proven for quarantine, restore or delete.",
  },
  iam_approval_execute: {
    code: "IAM_APPROVAL_EXECUTE_HELD",
    message: "Held: backend safety/recovery contract not yet proven for executing approved IAM changes.",
  },
}

export const LEGACY_MUTATION_FAMILIES = Object.keys(HOLD_REASONS) as LegacyMutationFamily[]

function familyEnabled(family: LegacyMutationFamily): boolean {
  switch (family) {
    case "finding_remediate":
      return LEGACY_FINDING_REMEDIATE_ENABLED
    case "sg_remediate":
      return LEGACY_SG_REMEDIATE_ENABLED
    case "s3_remediate":
      return LEGACY_S3_REMEDIATE_ENABLED
    case "quarantine":
      return LEGACY_QUARANTINE_ENABLED
    case "iam_approval_execute":
      return LEGACY_IAM_APPROVAL_EXECUTE_ENABLED
    default:
      return false
  }
}

/** The family's hold, or null only when its compiled constant releases it. */
export function legacyMutationHold(family: LegacyMutationFamily): LegacyMutationHold | null {
  if (familyEnabled(family)) return null
  return { family, ...HOLD_REASONS[family] }
}

/**
 * Whether a rendered control of this family must be disabled. The host's own flag can only add a hold: `false` or an
 * omitted prop never releases a held family.
 */
export function legacyControlHeld(family: LegacyMutationFamily, hostDisabled?: boolean): boolean {
  return legacyMutationHold(family) !== null || hostDisabled === true
}

/** The refusal body shared by the client guard and the proxy guard. */
export function legacyHeldBody(hold: LegacyMutationHold) {
  return {
    success: false,
    code: hold.code,
    family: hold.family,
    error: hold.message,
    message: hold.message,
    cloud_writes: 0,
    attempted_writes: 0,
    confirmed_writes: 0,
    unknown_writes: 0,
  }
}

export const LEGACY_HELD_STATUS = 423

/**
 * The ONLY request function for a legacy mutation. While the family is held it answers a local 423 carrying the
 * family's code and sends nothing; callers read it like any refused response.
 */
export async function fetchLegacyMutation(
  family: LegacyMutationFamily,
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const hold = legacyMutationHold(family)
  if (hold) {
    return new Response(JSON.stringify({ ...legacyHeldBody(hold), origin: "client" }), {
      status: LEGACY_HELD_STATUS,
      headers: { "Content-Type": "application/json" },
    })
  }
  return fetch(input, init)
}

/**
 * True only for an object body whose `dry_run` is the boolean `true`. A string "true", 1, an omitted field, an array
 * or a null body is not a dry run: the backends default an omitted dry_run to a live change or coerce strings.
 */
export function isExplicitDryRun(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false
  return (body as Record<string, unknown>).dry_run === true
}

/** Proxies that forward an explicit dry run and hold everything else. */
const DRY_RUN_AWARE_PROXIES = new Set([
  "/api/proxy/iam-roles/remediate",
  "/api/proxy/cyntro/remediate",
  "/api/proxy/attack-path-remediate",
])

const PROXY_FAMILIES: Array<[RegExp, LegacyMutationFamily]> = [
  [/^\/api\/proxy\/(simulate\/execute|remediate|safe-remediate\/execute|remediate\/execute)$/, "finding_remediate"],
  [/^\/api\/proxy\/remediation\/execute$/, "sg_remediate"],
  [/^\/api\/proxy\/(security-groups|sg-least-privilege)\/[^/]+\/remediate$/, "sg_remediate"],
  [/^\/api\/proxy\/s3-buckets\/remediate$/, "s3_remediate"],
  [/^\/api\/proxy\/quarantine\/(start-monitor|execute|restore|delete)$/, "quarantine"],
  [/^\/api\/proxy\/iam-roles\/approval-requests\/[^/]+\/execute$/, "iam_approval_execute"],
]

/**
 * The legacy family a proxy request belongs to, for callers whose endpoint is data (the data-leak mitigation executor
 * receives backend-authored paths). The dry-run-aware proxies are mutations unless isExplicitDryRun(body).
 */
export function legacyFamilyForProxyRequest(path: string, body?: unknown): LegacyMutationFamily | null {
  const bare = path.split("?")[0].replace(/\/+$/, "")
  if (DRY_RUN_AWARE_PROXIES.has(bare)) {
    return isExplicitDryRun(body) ? null : "finding_remediate"
  }
  for (const [pattern, family] of PROXY_FAMILIES) {
    if (pattern.test(bare)) return family
  }
  return null
}
