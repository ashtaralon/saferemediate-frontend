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
 * Read-only calls (simulations, previews, gap analysis, quarantine pre-check, approval request/approve/reject) are
 * not held and keep using fetch directly.
 */

export type LegacyMutationFamily =
  | "finding_remediate"
  | "sg_remediate"
  | "s3_remediate"
  | "quarantine"
  | "iam_approval_execute"

/** Finding / role remediation: /api/proxy/simulate/execute, /api/proxy/remediate, /api/proxy/safe-remediate/execute,
 *  and non-dry-run /api/proxy/iam-roles/remediate (backend /api/iam-roles/remediate, /api/safe-remediate/execute). */
export const LEGACY_FINDING_REMEDIATE_ENABLED = false
/** Security-group rule removal: /api/proxy/security-groups/{sg}/remediate, /api/proxy/sg-least-privilege/{sg}/remediate. */
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

const PROXY_FAMILIES: Array<[RegExp, LegacyMutationFamily]> = [
  [/^\/api\/proxy\/(simulate\/execute|remediate|safe-remediate\/execute)$/, "finding_remediate"],
  [/^\/api\/proxy\/(security-groups|sg-least-privilege)\/[^/]+\/remediate$/, "sg_remediate"],
  [/^\/api\/proxy\/s3-buckets\/remediate$/, "s3_remediate"],
  [/^\/api\/proxy\/quarantine\/(start-monitor|execute|restore|delete)$/, "quarantine"],
  [/^\/api\/proxy\/iam-roles\/approval-requests\/[^/]+\/execute$/, "iam_approval_execute"],
]

/**
 * The legacy family a proxy request belongs to, for callers whose endpoint is data (the data-leak mitigation executor
 * receives backend-authored paths). `/api/proxy/iam-roles/remediate` is a mutation unless the body is an explicit
 * `dry_run: true` preview -- the backend defaults an omitted dry_run to a live change.
 */
export function legacyFamilyForProxyRequest(path: string, body?: unknown): LegacyMutationFamily | null {
  const bare = path.split("?")[0].replace(/\/+$/, "")
  if (bare === "/api/proxy/iam-roles/remediate") {
    const dryRun = body && typeof body === "object" ? (body as Record<string, unknown>).dry_run : undefined
    return dryRun === true ? null : "finding_remediate"
  }
  for (const [pattern, family] of PROXY_FAMILIES) {
    if (pattern.test(bare)) return family
  }
  return null
}
