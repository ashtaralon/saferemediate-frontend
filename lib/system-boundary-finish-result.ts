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
 *
 * (S1A-APPLIED-UNKNOWN-01) "Not applied" is said only from an Applied answer that IS this account's and says not_applied_yet.
 * An Applied that could not be read, was refused, answered another account, or reports saving not initialized leaves
 * whether this Finish is applied UNKNOWN: the result is withheld all the same, under that name, never "not applied". Likewise
 * a result read that failed or was refused is RESULT_UNREADABLE / RESULT_REFUSED, never "not served".
 *
 * (S1b, N4a) Which Deployment each member of that applied result belongs to (``finishExplanation``) is shown only on top of
 * the same rule, and only when the result was read at level 2 with a SERVED decoration whose every context names a Deployment
 * of THIS receipt at the version THIS receipt pinned. Anything else is withheld whole, by name -- never a partial or guessed
 * attribution, and never instead of the unknown / updating wording above.
 */
import { appliedSentence, type ParsedApplied } from "@/lib/system-boundary-applied"
import {
  decorationSentence, explain, type Explanation, type PairedDeployment,
} from "@/lib/system-boundary-deployment-context"
import { RESULT_CONTRACT_V2, type ParsedResult } from "@/lib/system-boundary-result"

export type Pairing =
  | { kind: "applied_result"; generation: number }
  | { kind: "updating"; asOf: number | null; why: string }
  | { kind: "unknown"; asOf: number | null; why: string }

export function pairing(applied: ParsedApplied, result: ParsedResult,
                        { accountId, systemKey, completedRevision }: { accountId: string; systemKey: string; completedRevision: number }): Pairing {
  // (S1A-R7-CORR-PAIR-01) The "as of" fallback uses Applied's generation only when that answer is THIS account's.
  const asOf = result.kind === "served" ? result.generation
    : applied.kind === "applied" && applied.accountId === accountId ? applied.generation : null
  const updating = (why: string): Pairing => ({ kind: "updating", asOf, why })
  const unknown = (why: string): Pairing => ({ kind: "unknown", asOf, why })
  // (S1A-APPLIED-UNKNOWN-01) Only an answer naming an account can speak for one; "accountId" in narrows to AppliedAnswer.
  if (!("accountId" in applied)) return unknown(applied.kind === "refused" ? "APPLIED_REFUSED" : "APPLIED_UNREADABLE")
  if (applied.accountId !== accountId) return unknown("APPLIED_IDENTITY_MISMATCH")
  if (applied.kind === "not_initialized") return unknown("APPLIED_NOT_INITIALIZED")
  if (applied.kind !== "applied") return updating("NOT_APPLIED")
  if (applied.appliedRevision === null || applied.appliedRevision < completedRevision) return updating("APPLIED_BEFORE_THIS_FINISH")
  // The result side of the same rule: a result read that failed or was refused says nothing about what is served.
  if (result.kind === "unavailable" || result.kind === "refused") {
    return unknown(result.kind === "refused" ? "RESULT_REFUSED" : "RESULT_UNREADABLE")
  }
  if (result.kind !== "served" || result.accountId !== accountId || result.systemKey !== systemKey) return updating("RESULT_NOT_SERVED")
  if (result.generation !== applied.generation) return updating("GENERATION_MISMATCH")
  return { kind: "applied_result", generation: result.generation }
}

export function pairingSentence(p: Pairing): string {
  if (p.kind === "applied_result") return `This Finish's applied result -- membership generation ${p.generation}.`
  const asOf = p.asOf === null ? "" : ` The result shown is as of generation ${p.asOf}.`
  if (p.kind === "unknown") {
    const unknown: Record<string, string> = {
      APPLIED_UNREADABLE: "whether this Finish is applied in this account could not be read",
      APPLIED_REFUSED: "the applied status was refused, so whether this Finish is applied in this account is not known",
      APPLIED_IDENTITY_MISMATCH: "the applied status answered another account, so whether this Finish is applied in this "
        + "account is not known",
      APPLIED_NOT_INITIALIZED: "the applied status says saving is not initialized on this install, so whether this Finish "
        + "is applied in this account is not known",
      RESULT_UNREADABLE: "the result for this system could not be read in this account",
      RESULT_REFUSED: "the result read was refused, so what is served for this system in this account is not known",
    }
    return `Unknown -- ${unknown[p.why] ?? p.why}; it is not shown as this Finish's applied result.${asOf}`
  }
  const why: Record<string, string> = {
    NOT_APPLIED: "this Finish is not applied in this account yet",
    APPLIED_BEFORE_THIS_FINISH: "the served membership was built before this Finish",
    RESULT_NOT_SERVED: "the result for this system is not served in this account",
    GENERATION_MISMATCH: "the result and the applied status are of different generations",
  }
  return `Updating -- ${why[p.why] ?? p.why}; it is not shown as this Finish's applied result.${asOf}`
}

/** (S1A-R7-PAIR-02) Whether a result answer is of THIS account and System at all; an answer naming another is never shown as
 *  this Finish's (not even as "updating"). Answers that name nothing (unavailable, refused) carry no rows. */
export function resultIsOurs(result: ParsedResult, accountId: string, systemKey: string): boolean {
  if (result.kind === "served" || result.kind === "held" || result.kind === "not_recorded") {
    return result.accountId === accountId && result.systemKey === systemKey
  }
  return true
}

/** (S1A-R7-PAIR-01) Applied in words, beside a result: "includes this save" about the membership SHOWN only when the pairing
 *  proves the result shown IS that membership; otherwise Applied's own generation, said apart from the result. */
export function appliedLine(applied: ParsedApplied, completedRevision: number, p: Pairing, accountId: string): string {
  // (S1A-R7-CORR-PAIR-01) An Applied answer naming another account says nothing about this one: none of its revision or
  // generation is used. Answers that name no account (unavailable, refused) carry neither.
  if ("accountId" in applied && applied.accountId !== accountId) {
    return "The applied status answered another account (APPLIED_IDENTITY_MISMATCH); nothing of it is used here."
  }
  if (p.kind === "applied_result" || applied.kind !== "applied") return appliedSentence(applied, completedRevision)
  const generation = `membership generation ${applied.generation ?? "?"} (published ${applied.publishedAt ?? "?"})`
  return (applied.appliedRevision !== null && applied.appliedRevision >= completedRevision
    ? `Applied status, on its own: this save is applied in ${generation}`
    : `Applied status, on its own: ${generation} was built before this save`)
    + (p.why === "GENERATION_MISMATCH" ? " -- the result read beside it is of another generation"
      : " -- no served result of this system is read beside it") + ", so nothing is called this Finish's applied result."
}

/** (S1b) THIS Finish's applied result explained per Deployment, or why it is not. */
export type FinishExplanation =
  | { kind: "explained"; explanation: Explanation }
  | { kind: "withheld"; why: string }

/** (S1b, N4a) The applied result's members per Deployment of THIS Finish -- only when ALL hold:
 *  1. ``p`` is ``applied_result`` (this account, this System, Applied of this Finish, the same generation);
 *  2. the result was read at level 2 and its decoration is SERVED;
 *  3. the setup's Deployments pair exactly with its RECEIPT's (``pinned``: lib/system-boundary-setup ``pinnedDeployments``);
 *  4. every listed member's context names only those Deployments, each at the version the receipt pinned (a later version
 *     of one -- a later save -- is not this Finish's, and withholds the whole explanation).
 *  Otherwise withheld by name. Members a capped list leaves out are counted apart, never attributed. */
export function finishExplanation(p: Pairing, result: ParsedResult, pinned: readonly PairedDeployment[] | null): FinishExplanation {
  if (p.kind !== "applied_result" || result.kind !== "served") return { kind: "withheld", why: "NOT_THIS_FINISH_RESULT" }
  if (result.contract !== RESULT_CONTRACT_V2 || result.deploymentContext === null) return { kind: "withheld", why: "RESULT_WITHOUT_CONTEXT" }
  if (result.deploymentContext.state !== "SERVED") return { kind: "withheld", why: result.deploymentContext.reason }
  if (pinned === null) return { kind: "withheld", why: "RECEIPT_DEPLOYMENTS_NOT_PAIRED" }
  const explanation = explain(result.deploymentContext, result.lists.members, result.omitted.members ?? 0, pinned)
  if (explanation === null) return { kind: "withheld", why: "RESULT_WITHOUT_CONTEXT" }
  if (explanation.foreign.length > 0) return { kind: "withheld", why: "CONTEXT_NOT_THIS_RECEIPT" }
  return { kind: "explained", explanation }
}

/** A withheld explanation in words; the code stays visible. The decoration's own reasons read as lib/system-boundary-deployment-
 *  context says them. */
export function finishExplanationWithheldSentence(why: string): string {
  const words: Record<string, string> = {
    NOT_THIS_FINISH_RESULT: "the result shown is not this Finish's applied result",
    RESULT_WITHOUT_CONTEXT: "this installation's result read does not say which Deployment each member belongs to",
    RECEIPT_DEPLOYMENTS_NOT_PAIRED: "this setup's Deployments do not match the ones its Finish recorded",
    CONTEXT_NOT_THIS_RECEIPT: "the served membership names a Deployment, or a version of one, other than this Finish recorded "
      + "(a later save may have changed it)",
  }
  if (!Object.prototype.hasOwnProperty.call(words, why)) return decorationSentence({ state: "UNAVAILABLE", reason: why })
  return `Which Deployment each member belongs to is not shown: ${words[why]} (${why}). Every member is still listed.`
}
