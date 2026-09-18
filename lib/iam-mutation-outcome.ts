/**
 * What the operator is told after an IAM change is submitted, or when a
 * supporting read fails -- derived from what the backend SAID, never inferred
 * from an HTTP status or an error code.
 *
 * Codex Chrome QA of the 3425 planner fixture: a submit refused by the
 * deployment-authority gate, before any AWS client was used, was shown as
 * "Remediation failed" with none of its blockers. The backend now states
 * `aws_writes: 0` on those refusals; only then may the UI say nothing changed.
 */

import type { SimulateFixSafety } from "./types"

/** Labels for the break-glass operational blockers the remediate route returns. */
export const OPERATIONAL_BLOCKER_LABELS: Record<string, string> = {
  IAM_MUTATION_NOT_DECLARED: "IAM changes are not enabled for this deployment",
  RELEASE_TIER_REFUSES_MUTATION: "this deployment's release tier does not allow changes",
  TENANT_LIFECYCLE_STATE_NOT_READY: "snapshot and lock storage has not passed its readiness check",
  WEB_GRAPH_READ_ONLY_BOUNDARY_UNPROVEN: "the read-only graph boundary is not proven",
  SIGNED_PLAN_REQUIRED: "a signed plan is required",
  REMEDIATION_ASSUME_ROLE_DISABLED: "the remediation role is not assumed",
  CUSTOMER_REMEDIATOR_NOT_CONFIGURED: "the customer remediation role is not configured",
}

export interface RefusedBeforeWrite {
  error: string
  message: string
  blockers: string[]
}

/**
 * A refusal the backend states wrote nothing. Returns null for anything else --
 * including a failure with no `aws_writes` field, where a write may have happened.
 */
export function refusedBeforeWrite(result: unknown): RefusedBeforeWrite | null {
  const body = result && typeof result === "object" ? (result as Record<string, unknown>) : null
  const detail = body?.detail
  if (!detail || typeof detail !== "object") return null
  const d = detail as Record<string, unknown>
  if (d.aws_writes !== 0) return null
  return {
    error: typeof d.error === "string" ? d.error : "",
    message: typeof d.message === "string" ? d.message : "",
    blockers: Array.isArray(d.blockers) ? d.blockers.map((b) => String(b)) : [],
  }
}

export function refusedBeforeWriteText(refusal: RefusedBeforeWrite): string {
  const lines = ["No AWS change was made: the request was refused before any write."]
  if (refusal.message) lines.push(refusal.message)
  if (refusal.blockers.length > 0) {
    lines.push(
      "Blocked by: " +
        refusal.blockers
          .map((code) => (OPERATIONAL_BLOCKER_LABELS[code] ? `${OPERATIONAL_BLOCKER_LABELS[code]} (${code})` : code))
          .join("; "),
    )
  }
  if (refusal.error) lines.push(`(${refusal.error})`)
  return lines.join("\n")
}

export class MutationRefusedBeforeWrite extends Error {
  readonly refusal: RefusedBeforeWrite
  constructor(refusal: RefusedBeforeWrite) {
    super(refusedBeforeWriteText(refusal))
    this.name = "MutationRefusedBeforeWrite"
    this.refusal = refusal
  }
}

/**
 * The dependent-systems sentence, stated only as strongly as the consumer read
 * supports. `shared_confidence` (api/least_privilege.py simulate-fix):
 *   high     -- consumers were found
 *   medium   -- the query ran and found none: the graph holds no consumer
 *               edges, which is not proof that nothing depends on the role
 *   unknown  -- the consumer query failed or was unavailable
 */
export function dependentSystemsSentence(safety: SimulateFixSafety | null | undefined): string {
  const count = typeof safety?.consumer_count === "number" ? safety.consumer_count : null
  if (safety?.shared_confidence === "high" && count !== null && count > 0) {
    return `${count} system${count === 1 ? " is" : "s are"} recorded as depending on this role`
  }
  if (safety?.shared_confidence === "medium") {
    return "no dependent systems are recorded for this role, which is not proof that none exist"
  }
  return "Cyntro could not determine which systems depend on this role"
}

export interface ApprovalListFailure {
  status: number | null
  code: string | null
  message: string
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null

/**
 * The typed refusal inside a failed response, in either shape it reaches the browser:
 * FastAPI's `{detail: {code, message}}`, or a proxy that rewrites errors to
 * `{error: <detail>, success: false}` (app/api/proxy/iam-snapshots/[snapshotId]/rollback).
 * Reading only `detail` lost every typed code the second shape carried.
 */
function typedFailureDetail(body: unknown): { record: Record<string, unknown>; detail: Record<string, unknown> | null } {
  const record = asObject(body) ?? {}
  return { record, detail: asObject(record.detail) ?? asObject(record.error) }
}

/** A failed approval-list read, typed. Never an empty list. */
export function approvalListFailure(status: number | null, body: unknown): ApprovalListFailure {
  const { record: b, detail } = typedFailureDetail(body)
  const code =
    (detail && typeof detail.code === "string" && detail.code) ||
    (detail && typeof detail.error === "string" && detail.error) ||
    (typeof b.code === "string" && b.code) ||
    null
  const message =
    (detail && typeof detail.message === "string" && detail.message) ||
    (typeof b.detail === "string" && b.detail) ||
    (typeof b.error === "string" && b.error) ||
    (status !== null ? `Approval requests could not be read (HTTP ${status})` : "Approval requests could not be read")
  return { status, code, message }
}

export interface MutationFailure {
  status: number
  code: string | null
  message: string
  awsWrites: number | null
}

/** A failed apply or restore response, typed whichever shape the proxy forwarded. */
export function mutationFailure(status: number, body: unknown): MutationFailure {
  const { record, detail } = typedFailureDetail(body)
  const code =
    (detail && typeof detail.code === "string" && detail.code) ||
    (typeof record.code === "string" && record.code) ||
    null
  const message =
    (detail && typeof detail.message === "string" && detail.message) ||
    (typeof record.detail === "string" && record.detail) ||
    (typeof record.error === "string" && record.error) ||
    (typeof record.message === "string" && record.message) ||
    `Request failed with HTTP ${status}`
  const writes = detail?.aws_writes
  return { status, code, message, awsWrites: typeof writes === "number" ? writes : null }
}

/** One line an operator can act on: the typed code, then what the backend said. */
export function mutationFailureText(failure: MutationFailure): string {
  return failure.code ? `${failure.code}: ${failure.message}` : failure.message
}
