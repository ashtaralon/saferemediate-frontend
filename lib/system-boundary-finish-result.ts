/**
 * (S1a R7) THIS Finish's applied result, per account: the Applied answer (declarations_applied/v1) and the result answer
 * (system_boundary_result_read/v1) of the same account, paired. Pure: no React, no fetch.
 *
 * A result is shown as this Finish's applied result ONLY when all of these hold (contract Revision 3, item 4):
 *  1. the System and the account are the ones the setup's receipt associated (``systemKey``, the result's account);
 *  2. Applied is ``applied_known`` with ``applied_revision >= completed_revision``;
 *  3. the result is ``served``;
 *  4. the result's generation IS the Applied answer's generation.
 * Anything else is "updating, as of generation G" -- a result built before this Finish, or one Applied does not speak for,
 * is never labelled applied. The proposal pinned at Finish (receipt.preview) stays apart, historical.
 */
import type { ParsedApplied } from "@/lib/system-boundary-applied"
import type { ParsedResult } from "@/lib/system-boundary-result"

export type Pairing =
  | { kind: "applied_result"; generation: number }
  | { kind: "updating"; asOf: number | null; why: string }

export function pairing(applied: ParsedApplied, result: ParsedResult,
                        { accountId, systemKey, completedRevision }: { accountId: string; systemKey: string; completedRevision: number }): Pairing {
  const asOf = result.kind === "served" ? result.generation : applied.kind === "applied" ? applied.generation : null
  const updating = (why: string): Pairing => ({ kind: "updating", asOf, why })
  if (applied.kind !== "applied" || applied.accountId !== accountId) return updating("NOT_APPLIED")
  if (applied.appliedRevision === null || applied.appliedRevision < completedRevision) return updating("APPLIED_BEFORE_THIS_FINISH")
  if (result.kind !== "served" || result.accountId !== accountId || result.systemKey !== systemKey) return updating("RESULT_NOT_SERVED")
  if (result.generation !== applied.generation) return updating("GENERATION_MISMATCH")
  return { kind: "applied_result", generation: result.generation }
}

export function pairingSentence(p: Pairing): string {
  if (p.kind === "applied_result") return `This Finish's applied result -- membership generation ${p.generation}.`
  const asOf = p.asOf === null ? "" : ` The result shown is as of generation ${p.asOf}.`
  const why: Record<string, string> = {
    NOT_APPLIED: "this Finish is not applied in this account yet",
    APPLIED_BEFORE_THIS_FINISH: "the served membership was built before this Finish",
    RESULT_NOT_SERVED: "the result for this system is not served in this account",
    GENERATION_MISMATCH: "the result and the applied status are of different generations",
  }
  return `Updating -- ${why[p.why] ?? p.why}; it is not shown as this Finish's applied result.${asOf}`
}
