/**
 * The reason an operator reads for a confidence group must agree with the
 * group's decision (F17).
 *
 * The backend derives `explanation` from per-permission evidence
 * ("Zero usage in 18 days — safe to remove.") and `block_reason_code` /
 * `auto_remediable` afterwards. Current backends reconcile the two before the
 * response leaves the handler; this helper keeps the invariant on the client
 * for payloads served by an older backend or a stale cache: an approving
 * sentence is never rendered beside a blocked decision.
 */

export interface IamGroupReasonSource {
  explanation?: string | null
  block_reason_code?: string | null
  block_reason_human?: string | null
  auto_remediable?: boolean | null
  /** Facts-only sentence from a reconciling backend, when present. */
  evidence_summary?: string | null
}

const APPROVING_VERDICTS = [" — safe to remove.", " — can remove."]
const APPROVING_PHRASES = [/safe to remove/i, /can remove/i]

/** True when the text authorises removal. */
export function isApprovingReason(text: string | null | undefined): boolean {
  if (!text) return false
  return APPROVING_PHRASES.some(pattern => pattern.test(text))
}

/** Drop the approving verdict clause and keep the observed facts. */
export function stripRemovalVerdict(text: string | null | undefined): string {
  const out = (text ?? "").trim()
  for (const verdict of APPROVING_VERDICTS) {
    if (out.endsWith(verdict)) {
      return `${out.slice(0, -verdict.length).trimEnd()}.`
    }
  }
  return out
}

/** True when the group's decision blocks automatic removal. */
export function isBlockedGroup(group: IamGroupReasonSource): boolean {
  const code = group.block_reason_code ?? "ok"
  return code !== "ok" || group.auto_remediable === false
}

/**
 * The sentence to render for a group. For a blocked group the facts are kept,
 * the verdict is dropped, and the block reason follows; an auto-remediable
 * group keeps its explanation as served.
 */
export function iamGroupReasonCopy(group: IamGroupReasonSource): string | null {
  const explanation = (group.explanation ?? "").trim()
  if (!isBlockedGroup(group)) return explanation || null

  const facts = (group.evidence_summary ?? "").trim() || stripRemovalVerdict(explanation)
  const human = (group.block_reason_human ?? "").trim()
  if (!human) return facts || null
  if (!facts) return human
  if (facts.includes(human)) return facts
  return `${facts} ${human}`
}
