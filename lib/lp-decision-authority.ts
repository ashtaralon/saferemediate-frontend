/**
 * The Review/Preview `decision_authority` block (backend `unified/lp/decision_authority.py`,
 * contract `lp-decision-authority/v1`): what the activated RoleActionDecision generation says
 * about this role, read from its receipted publication.
 *
 * This module only normalises what the backend said. It never infers a state: an unknown or
 * missing state is "unavailable" or "not reported", coverage that is complete is never shown as
 * a removal verdict, and nothing is ever shown as cleared unless the backend listed it as CLEARED.
 */

export type DecisionAuthorityKind = "populated" | "empty" | "unavailable" | "not_reported"

export type DecisionAuthorityReceipt = {
  tenantId: string
  accountId: string
  projectionGeneration: number
  projectionReceiptHash: string
  stagingRunId: string
  projectedThrough: string | null
}

export type DecisionAuthorityView = {
  kind: DecisionAuthorityKind
  /** Coverage grade of the generation for this role -- NOT a removal verdict. */
  coverageComplete: boolean
  title: string
  detail: string
  reason: string | null
  receipt: DecisionAuthorityReceipt | null
  publishedAt: string | null
  configuredSetClosed: boolean | null
  counts: Record<string, number>
  cleared: string[]
  inUse: string[]
  indeterminate: Array<{ action: string; reason: string }>
}

export type PreviewDecisionGrade = {
  kind: "graded" | "not_graded" | "not_reported"
  title: string
  reasons: string[]
  candidates: number | null
  cleared: string[]
  inUse: string[]
  indeterminate: Array<{ candidate: string; reason: string }>
}

const REASON_COPY: Record<string, string> = {
  NOT_PUBLISHED: "No decision generation has been published for this organization and account yet.",
  RECEIPT_INVALID: "The latest publication's receipt is missing, expired or not bound to this scope.",
  ROLE_NOT_PUBLISHED: "The published generation holds no record for this role.",
  INCOMPLETE: "The publication for this role is incomplete, so it is not shown.",
  FOREIGN: "The publication names another organization, account or role, so it is not shown.",
  INVALID: "The publication could not be read under this contract.",
  UNAVAILABLE: "The decision store could not be read right now.",
  ROLE_ID_MISMATCH: "The published decisions belong to an earlier role with this name (it was recreated).",
  PUBLISHED_RECEIPT_UNVERIFIED: "The publication carries no verified, receipted generation.",
  READ_MODEL_STORE_UNAVAILABLE: "This deployment has no decision store configured.",
  DEPLOYMENT_NOT_CUSTOMER_RESIDENT: "This deployment does not publish LP decision coverage.",
  REVIEW_SCOPE_INCOMPLETE: "The review carried no complete organization, account and role scope.",
  DECISION_AUTHORITY_READ_FAILED: "The decision authority could not be read.",
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
}

function pairs<K extends string>(value: unknown, key: K): Array<Record<K, string> & { reason: string }> {
  if (!Array.isArray(value)) return []
  const out: Array<Record<K, string> & { reason: string }> = []
  for (const item of value) {
    const row = asRecord(item)
    if (row && typeof row[key] === "string" && typeof row.reason === "string") {
      out.push({ [key]: row[key], reason: row.reason } as Record<K, string> & { reason: string })
    }
  }
  return out
}

export function reasonCopy(reason: string | null | undefined): string {
  if (!reason) return "The decision authority is unavailable."
  return REASON_COPY[reason] ?? `The decision authority is unavailable (${reason}).`
}

function receiptOf(value: unknown): DecisionAuthorityReceipt | null {
  const r = asRecord(value)
  if (!r) return null
  const generation = r.projection_generation
  if (
    typeof r.tenant_id !== "string" || typeof r.account_id !== "string" ||
    typeof generation !== "number" || typeof r.projection_receipt_hash !== "string" ||
    !r.projection_receipt_hash || typeof r.staging_run_id !== "string"
  ) {
    return null
  }
  return {
    tenantId: r.tenant_id,
    accountId: r.account_id,
    projectionGeneration: generation,
    projectionReceiptHash: r.projection_receipt_hash,
    stagingRunId: r.staging_run_id,
    projectedThrough: typeof r.projected_through === "string" ? r.projected_through : null,
  }
}

const EMPTY: Omit<DecisionAuthorityView, "kind" | "title" | "detail" | "reason"> = {
  coverageComplete: false,
  receipt: null,
  publishedAt: null,
  configuredSetClosed: null,
  counts: {},
  cleared: [],
  inUse: [],
  indeterminate: [],
}

export function decisionAuthorityView(raw: unknown): DecisionAuthorityView {
  const block = asRecord(raw)
  if (!block || block.contract !== "lp-decision-authority/v1") {
    return {
      ...EMPTY,
      kind: "not_reported",
      title: "Decision authority not reported",
      detail: "This backend did not report the activated decision generation for this role.",
      reason: null,
    }
  }
  const state = block.state
  const receipt = receiptOf(block.receipt)
  const publication = asRecord(block.publication)
  const publishedAt = typeof publication?.published_at === "string" ? publication.published_at : null
  if ((state !== "ACTIVE_POPULATED" && state !== "ACTIVE_EMPTY") || receipt === null) {
    const reason = typeof block.reason === "string" ? block.reason : null
    return {
      ...EMPTY,
      kind: "unavailable",
      title: "Decision authority unavailable",
      detail: reasonCopy(state === "ACTIVE_POPULATED" || state === "ACTIVE_EMPTY" ? "PUBLISHED_RECEIPT_UNVERIFIED" : reason),
      reason: state === "ACTIVE_POPULATED" || state === "ACTIVE_EMPTY" ? "PUBLISHED_RECEIPT_UNVERIFIED" : reason,
      publishedAt,
    }
  }
  const removal = asRecord(block.removal)
  const counts: Record<string, number> = {}
  for (const [key, value] of Object.entries(asRecord(block.counts) ?? {})) {
    if (typeof value === "number") counts[key] = value
  }
  const configured = asRecord(block.configured_set)
  const empty = state === "ACTIVE_EMPTY"
  return {
    kind: empty ? "empty" : "populated",
    coverageComplete: block.authority === "DECISION_GRADE",
    title: empty ? "No configured permissions in the decision generation" : "Decision generation",
    detail: empty
      ? "The verified generation covers this role and it has no configured permissions."
      : "Per-permission decisions from the activated, verified generation.",
    reason: null,
    receipt,
    publishedAt,
    configuredSetClosed: typeof configured?.closed === "boolean" ? configured.closed : null,
    counts,
    cleared: strings(removal?.cleared),
    inUse: strings(removal?.in_use),
    indeterminate: pairs(removal?.indeterminate, "action"),
  }
}

export function previewDecisionGrade(raw: unknown): PreviewDecisionGrade {
  const block = asRecord(raw)
  if (!block || block.contract !== "lp-decision-authority/v1" || typeof block.decision_grade !== "boolean") {
    return {
      kind: "not_reported", title: "Decision grade not reported", reasons: [], candidates: null,
      cleared: [], inUse: [], indeterminate: [],
    }
  }
  const graded = block.decision_grade === true
  return {
    kind: graded ? "graded" : "not_graded",
    title: graded
      ? "Every removal candidate is cleared by the decision generation"
      : "Not decision grade: the decision generation does not clear every candidate",
    reasons: strings(block.decision_grade_reasons),
    candidates: typeof block.candidates === "number" ? block.candidates : null,
    cleared: strings(block.cleared),
    inUse: strings(block.in_use),
    indeterminate: pairs(block.indeterminate, "candidate"),
  }
}

/** The LP Apply's `decision_binding`: which receipted activation the operator planned against. */
export type LpDecisionBinding = {
  projection_generation: number
  projection_receipt_hash: string
  publication_attempt: string
}

/**
 * The Apply's `decision_binding` (backend `unified/lp/decision_authority.py::apply_decision_admission`, step 2): the
 * generation, receipt hash and publication attempt of the Review's ACTIVE, receipted decision authority for exactly
 * this role (ARN and RoleId), copied verbatim. Null when the block is anything else -- the Apply then carries no
 * binding and the backend refuses it by name (DECISION_BINDING_REQUIRED / DECISION_AUTHORITY_UNAVAILABLE). Nothing
 * is derived, defaulted or borrowed from another role's block. Sending a binding grants nothing: Apply stays held
 * (`LP_MUTATION_APPLY_ENABLED`), and the backend re-reads and compares every field.
 */
export function decisionBindingOf(
  raw: unknown,
  role: { roleArn: string | null | undefined; roleId: string | null | undefined },
): LpDecisionBinding | null {
  const block = asRecord(raw)
  if (!block || (block.state !== "ACTIVE_POPULATED" && block.state !== "ACTIVE_EMPTY")) return null
  const owner = asRecord(block.role)
  if (!owner || !role.roleArn || !role.roleId || owner.role_arn !== role.roleArn || owner.role_id !== role.roleId) {
    return null
  }
  const generation = asRecord(block.receipt)?.projection_generation
  const hash = asRecord(block.receipt)?.projection_receipt_hash
  const attempt = asRecord(block.publication)?.attempt
  if (typeof generation !== "number" || !Number.isInteger(generation)) return null
  if (typeof hash !== "string" || !hash || typeof attempt !== "string" || !attempt) return null
  return { projection_generation: generation, projection_receipt_hash: hash, publication_attempt: attempt }
}
