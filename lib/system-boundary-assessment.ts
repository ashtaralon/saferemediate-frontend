/**
 * (S1b, agreed A7 reading A) The consolidated account assessment of a PLURAL draft: what its preview says, per account, over
 * the union of its Deployments' cells -- the backend's own full counts (each member once, however many Deployments reach it),
 * the inventory the account was admitted on, each Deployment's members said apart from the ones it shares, and the explicit
 * remainder that was NOT assessed. Pure: no React, no fetch, nothing computed that the preview does not say.
 *
 * Never completeness or non-use from absence: a held account is unassessed whole (its reason shown), a computed account's
 * coverage limits stay listed, rows in no list are counted, a capped list's omitted members are counted and never attributed,
 * and a withheld decoration withholds every per-Deployment number (by name) -- it never reads as "no member is this
 * Deployment's". Shared members are counted under each Deployment that names them AND said to be shared; the account's member
 * count is the backend's unique count, never a sum of per-Deployment numbers.
 *
 * The draft's Deployment keys pair with the preview's ``draft_targets.deployment_ids`` position for position. CONTRACT
 * (confirmed SW-S1A-20261013-48): preview v2 lists ``draft_targets.deployment_ids`` in canonical ASCII ``deployment_key``
 * order -- as agreed A3 lists the receipt association -- whatever order the intent declares them in (the backend sorts the
 * entries, unified/system_boundary_plan.py:678, and appends each id in that order, :1599); no key travels beside the id.
 * Every draft Deployment is NEW (agreed A1), so the context it is named by is at version 1 (the draft writes each at version
 * 1, :1592); a context naming any other key or version is not this draft's and withholds the account's explanation.
 *
 * Per-Deployment numbers cover the members the account's summary LISTS; a capped list's omitted members are a counted
 * remainder, never attributed -- and loading further pages of the list does not add to these cards.
 */
import {
  explain, pairDeployments, type Explanation, type PairedDeployment,
} from "@/lib/system-boundary-deployment-context"
import { coverageLimits, type Preview, type PreviewAccount } from "@/lib/system-boundary-setup-preview"

/** A plural save creates every Deployment new, at version 1 (agreed A1; unified/system_boundary_plan.draft_records). */
export const DRAFT_DEPLOYMENT_VERSION = 1

export interface AccountAssessment {
  accountId: string
  /** COMPUTED: assessed; anything else: NOT assessed, whole (``heldReason`` says why) -- its numbers, if any, a diagnostic. */
  assessed: boolean
  heldReason: string | null
  inventory: PreviewAccount["inventory"]
  /** The backend's FULL counts for the account (each member once), or null when the account has none. */
  counts: PreviewAccount["counts"]
  /** The explicit remainder the plan did not reach (coverage limits, in words). Empty only when the backend names none. */
  limits: string[]
  /** Per-Deployment members over the LISTED members, or null with ``withheld`` naming why. */
  explanation: Explanation | null
  withheld: string | null
}

export interface Assessment {
  /** The draft's Deployments as named for the person, paired with the preview's ids; null when they do not pair. */
  deployments: PairedDeployment[] | null
  accounts: AccountAssessment[]
  /** Rows the preview placed in no list (the backend's count): part of the remainder, never dropped. */
  unlisted: number
  /** Whether a Finish may rest on this preview: the OUTER state alone (a held account's nested decoration never counts). */
  finishable: boolean
}

/** The assessment of ``preview`` for the draft whose Deployment keys are ``deploymentKeys`` (the intent the preview was
 *  computed for -- the caller fences the intent revision and state version, as for any preview). A v1 preview (one
 *  Deployment) is assessed too, with no per-Deployment explanation: it carries no context. */
export function assess(preview: Preview, deploymentKeys: readonly string[]): Assessment {
  const deployments = pairDeployments(deploymentKeys,
    preview.deploymentIds.map((id) => ({ key: `DEPLOYMENT#${id}`, version: DRAFT_DEPLOYMENT_VERSION })))
  const accounts = preview.accounts.map((account): AccountAssessment => {
    const assessed = account.state === "COMPUTED"
    const base = {
      accountId: account.accountId, assessed, heldReason: assessed ? null : (account.reason ?? account.state),
      inventory: account.inventory, counts: account.counts, limits: assessed ? coverageLimits(account) : [],
    }
    const withheld = (why: string): AccountAssessment => ({ ...base, explanation: null, withheld: why })
    if (!assessed) return withheld("ACCOUNT_NOT_ASSESSED")
    const state = account.deploymentContext
    if (state === null) return withheld("PREVIEW_WITHOUT_CONTEXT")
    if (state.state !== "SERVED") return withheld(state.reason)
    if (deployments === null) return withheld("DRAFT_DEPLOYMENTS_NOT_PAIRED")
    const members = account.display?.lists.members ?? []
    const explanation = explain(state, members, account.display?.omitted.members ?? 0, deployments)
    if (explanation === null) return withheld("PREVIEW_WITHOUT_CONTEXT")
    if (explanation.foreign.length > 0) return withheld("CONTEXT_NOT_THIS_DRAFT")
    return { ...base, explanation, withheld: null }
  })
  return { deployments, accounts, unlisted: preview.counts.unlisted, finishable: preview.state === "COMPUTED" }
}

/** A withheld per-Deployment explanation in words; the code stays visible. */
export function assessmentWithheldSentence(why: string): string {
  const words: Record<string, string> = {
    ACCOUNT_NOT_ASSESSED: "this account was not assessed, so nothing is said about its members per Deployment",
    PREVIEW_WITHOUT_CONTEXT: "this preview does not say which Deployment each member belongs to",
    DRAFT_DEPLOYMENTS_NOT_PAIRED: "the preview's Deployments do not match this setup's",
    CONTEXT_NOT_THIS_DRAFT: "the preview names a Deployment that is not one of this setup's",
  }
  const said = Object.prototype.hasOwnProperty.call(words, why) ? words[why] : "the Deployment context is withheld"
  return `Per-Deployment members are not shown: ${said} (${why}).`
}

/** One Deployment's line: its own members, and the members it shares -- with another Deployment (MULTIPLE) or with the
 *  System as a whole (MIXED) -- each said apart. */
export function deploymentLine(entry: Explanation["deployments"][number]): string {
  const multiple = entry.shared.filter((s) => s.resolution === "MULTIPLE").length
  const mixed = entry.shared.length - multiple
  return `${entry.deployment.deploymentKey}: ${entry.single.length} member(s) of its own`
    + (multiple ? `; ${multiple} shared with another Deployment` : "")
    + (mixed ? `; ${mixed} also reached from the System as a whole` : "") + "."
}

/** What an explanation does NOT attribute to one Deployment, in words: System-level members and a capped list's omitted ones. */
export function remainderLines(explanation: Explanation): string[] {
  const lines: string[] = []
  if (explanation.systemLevel.length) {
    lines.push(`${explanation.systemLevel.length} member(s) belong to the System as a whole, not to one Deployment.`)
  }
  if (explanation.omitted) {
    lines.push(`${explanation.omitted} member(s) are not listed here, so they are not attributed to a Deployment.`)
  }
  return lines
}
