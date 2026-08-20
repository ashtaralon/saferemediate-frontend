/**
 * One typed translation between the LP issues API and the finding cards.
 *
 * WHY THIS EXISTS
 *
 * The dashboard mapper emitted `unused_actions_count` / `allowed_actions_count`
 * and dropped `type` and `confidence` entirely. `FindingCard` read
 * `unusedCount` / `unusedActions` / `details.unusedCount` / `confidence`, so
 * none of the emitted fields matched. Every numeric fell through a chain of
 * `||` to `0`, and `(finding as any).type || "unused_permission"` typed every
 * finding — S3, SG, NACL alike — as an IAM unused-permission finding.
 *
 * Production rendered 16 rows of "0 unused permissions - 0% confidence" beside
 * a card header reading "36 unused permissions out of 4...". On a security
 * surface "0 unused permissions" is a claim that a resource is clean, and it
 * was being made about resources that were not.
 *
 * TWO RULES THIS FILE ENFORCES
 *
 * 1. `??`, never `||`, for anything numeric. A real 0 ("measured, nothing
 *    unused") and a missing value ("we never measured") are different claims,
 *    and `||` collapses the first into the second's fallback.
 *
 * 2. Absent evidence normalizes to `null`, never to 0 or to an empty array
 *    that a `.length` will later render as 0. Cards must render "unknown";
 *    they cannot do that if the absence was already destroyed here.
 */

import type { SecurityFinding } from "@/lib/types"

/** Card render branches. `unknown` is honest; it is not a synonym for IAM. */
export type FindingType =
  | "iam_unused_permissions"
  | "admin_user_no_mfa"
  | "nacl_overly_permissive"
  | "sg_exposure"
  | "s3_exposure"
  | "unknown"

// `confidence` is omitted from the base and re-declared: SecurityFinding types
// it `number | undefined`, and this file's whole point is that "absent" must be
// representable — `null` — rather than collapsing into a falsy default.
export interface NormalizedFinding extends Omit<SecurityFinding, "confidence"> {
  type: FindingType
  /** null = not measured. Never 0-as-unknown. */
  unusedCount: number | null
  allowedCount: number | null
  usedCount: number | null
  unusedActions: string[] | null
  confidence: number | null
  observationDays: number | null
  /** False when required evidence or a usable backend id is missing. */
  isRemediable: boolean
  /** Why remediation is withheld, for the disabled control's tooltip. */
  notRemediableReason: string | null
}

/** Finite numbers only. `null`/`undefined`/NaN/'' are absent, but 0 is real. */
export function asCount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.filter((v): v is string => typeof v === "string")
}

/**
 * Which card should render this finding.
 *
 * Derived from the backend's own `type`/`findingClass` when present, and from
 * `resourceType` otherwise — never defaulted to the IAM branch. A finding whose
 * shape we cannot establish renders as `unknown` and says so.
 */
export function deriveFindingType(raw: Record<string, any>): FindingType {
  const explicit = String(raw.type ?? raw.finding_type ?? "").trim().toLowerCase()
  if (explicit) {
    if (explicit === "unused_permission" || explicit === "iam_unused_permissions") {
      return "iam_unused_permissions"
    }
    if (
      explicit === "admin_user_no_mfa" ||
      explicit === "nacl_overly_permissive" ||
      explicit === "sg_exposure" ||
      explicit === "s3_exposure"
    ) {
      return explicit as FindingType
    }
    return "unknown"
  }

  switch (String(raw.resourceType ?? "").trim()) {
    case "IAMRole":
    case "IAMUser":
      // Only an IAM finding that actually carries permission-gap evidence is an
      // unused-permissions finding. An IAM row without it is not.
      return asCount(raw.gapCount) !== null || asCount(raw.unusedCount) !== null
        ? "iam_unused_permissions"
        : "unknown"
    case "NetworkACL":
      return "nacl_overly_permissive"
    case "SecurityGroup":
      return "sg_exposure"
    case "S3Bucket":
      return "s3_exposure"
    default:
      return "unknown"
  }
}

const SEVERITIES = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"])

function normalizeSeverity(value: unknown): SecurityFinding["severity"] {
  const raw = String(value ?? "").trim().toUpperCase()
  return (SEVERITIES.has(raw) ? raw : "MEDIUM") as SecurityFinding["severity"]
}

/**
 * Describe the finding without asserting a count we do not have.
 *
 * The old template read `${r.gapCount || r.exposedCount} unused permissions can
 * be removed`, which rendered "undefined unused permissions" — or worse, "0
 * unused permissions can be removed" — for every non-IAM finding.
 */
function describe(raw: Record<string, any>, type: FindingType, unused: number | null): string {
  if (typeof raw.description === "string" && raw.description.trim()) {
    return raw.description
  }
  if (type === "iam_unused_permissions" && unused !== null) {
    return `${unused} unused permission${unused === 1 ? "" : "s"} can be removed`
  }
  return "No description supplied by the analyzer."
}

export function normalizeSecurityFinding(raw: Record<string, any>): NormalizedFinding {
  const type = deriveFindingType(raw)

  // `??` throughout: gapCount === 0 is a measurement, not a miss.
  const unusedCount = asCount(raw.unusedCount ?? raw.unused_actions_count ?? raw.gapCount)
  const allowedCount = asCount(raw.allowedCount ?? raw.allowed_actions_count)
  const usedCount = asCount(raw.usedCount ?? raw.used_actions_count)
  const confidence = asCount(raw.confidence)
  const observationDays = asCount(raw.observationDays ?? raw.observation_days)
  const unusedActions =
    asStringArray(raw.unusedActions ?? raw.unused_actions ?? raw.unused_permissions)

  const findingId =
    (typeof raw.findingId === "string" && raw.findingId) ||
    (typeof raw.finding_id === "string" && raw.finding_id) ||
    undefined

  // Remediation needs a real backend id AND real evidence. Offering Simulate on
  // a row we could not measure invites an action against nothing.
  const missing: string[] = []
  if (!findingId) missing.push("no backend finding id")
  if (type === "iam_unused_permissions" && unusedCount === null) {
    missing.push("unused-permission count not measured")
  }
  if (type === "unknown") missing.push("finding type could not be established")

  const resourceName = raw.resourceName ?? raw.resource ?? raw.resourceId

  return {
    id: raw.resourceArn || raw.id || resourceName,
    finding_id: findingId,
    title: raw.title || `${raw.resourceType ?? "Resource"}: ${resourceName}`,
    severity: normalizeSeverity(raw.severity),
    description: describe(raw, type, unusedCount),
    resource: resourceName,
    // Not defaulted to IAMRole — mislabelling the resource mislabels the card.
    resourceType: raw.resourceType || "Unknown",
    resourceId: raw.resourceArn || raw.resourceId,
    category: raw.resourceType === "IAMRole" ? "IAM" : raw.resourceType || "Unknown",
    // Missing discovery time is unknown. Never make a finding look freshly
    // detected by manufacturing the browser's current timestamp.
    discoveredAt: raw.evidence?.lastUpdated || raw.discoveredAt || "",
    status: "open",
    remediation: raw.remediation,
    role_name: raw.resourceType === "IAMRole" ? resourceName : undefined,

    type,
    unusedCount,
    allowedCount,
    usedCount,
    unusedActions,
    confidence,
    observationDays,
    evidence: raw.evidence ?? null,
    isRemediable: missing.length === 0,
    notRemediableReason: missing.length ? missing.join("; ") : null,
  }
}

/**
 * Sort order for severity.
 *
 * Exported and `??`-based because the previous inline version was
 * `severityOrder[s] || 4` with `CRITICAL: 0` — and `0 || 4` is `4`, so CRITICAL
 * sorted BEHIND LOW on the one list where order carries the most meaning.
 */
export const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

export function severityRank(severity: unknown): number {
  return SEVERITY_RANK[String(severity ?? "").toUpperCase()] ?? 4
}
