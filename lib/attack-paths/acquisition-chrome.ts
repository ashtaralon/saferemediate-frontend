/**
 * Operator-facing phrasing for ACQUISITION.
 *
 * Acquisition answers "who can take THIS principal once already inside the
 * account". Initial Access answers "how did the attacker get inside". They are
 * different questions, and conflating them is the exact failure this module
 * exists to prevent: a path can have fully-explained acquisition and completely
 * unknown entry, which is precisely the case that used to render as a bare
 * "FROM UNKNOWN ENTRY" with nothing else said.
 *
 * Real case this was built for: cyntro-demo-treasury-role — the highest-scoring
 * path on its jewel — is trusted only by cyntro-demo-pivot-role, which is in
 * turn trusted by account `:root` with NO conditions. Any principal in the
 * account can walk that chain to a CRITICAL crown jewel. The product showed
 * "FROM UNKNOWN ENTRY", the most reassuring possible framing of the least
 * reassuring fact on the jewel.
 *
 * Pure + server-fed: every value comes from the backend DTO. Nothing is
 * derived, inferred, or defaulted here — when the server has nothing provable
 * it sends null and we render nothing.
 */

import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

export type AcquisitionLike = NonNullable<ConvergencePath["acquisition"]>

export interface AcquisitionChrome {
  /** Short chip text, e.g. "Assumable by anyone in the account". */
  label: string
  /** True when trust is account-`:root` — anyone in the account qualifies. */
  accountWide: boolean
  /** True when we know there are NO trust conditions narrowing it. */
  unconditioned: boolean
  /** Long-form tooltip that keeps acquisition and entry visibly separate. */
  detail: string
}

/**
 * Null when there is nothing provable — callers render nothing rather than an
 * "unknown" chip, because an absent acquisition claim is not itself a finding.
 */
export function acquisitionChrome(
  acquisition: AcquisitionLike | null | undefined,
): AcquisitionChrome | null {
  if (!acquisition?.acquisition) return null

  const accountWide = acquisition.account_wide_trust === true
  const unconditioned = acquisition.trust_has_conditions === false
  const principals = acquisition.assumable_by ?? []

  const who = accountWide
    ? "anyone in the account"
    : principals.length === 1
      ? shortPrincipal(principals[0])
      : `${principals.length} principals`

  const label = `Assumable by ${who}`

  // The tooltip states BOTH halves on purpose. Saying only "assumable by
  // anyone" invites the opposite error — reading acquisition as entry.
  const conditionClause = unconditioned
    ? " with no trust conditions"
    : acquisition.trust_has_conditions === true
      ? " (trust conditions apply — not evaluated)"
      : ""

  const detail =
    `Acquisition: this principal is assumable by ${who}${conditionClause}. ` +
    `That explains how an attacker takes this identity once they are already ` +
    `inside the account — it does NOT explain how they got into the account, ` +
    `which is still unknown.`

  return { label, accountWide, unconditioned, detail }
}

/** `AWS:arn:aws:iam::123:role/pivot` → `pivot`; falls back to the raw value. */
export function shortPrincipal(principal: string): string {
  if (!principal) return principal
  const slash = principal.lastIndexOf("/")
  if (slash >= 0 && slash < principal.length - 1) {
    return principal.slice(slash + 1)
  }
  if (principal.endsWith(":root")) return "account root"
  return principal
}

/**
 * Severity hint for the chip. Account-wide AND unconditioned is the case worth
 * colouring — it means no principal boundary at all. Anything narrower is
 * context, not a finding, and must not borrow finding colour (yellow is
 * reserved for server-authored findings).
 */
export function isAcquisitionNoteworthy(
  chrome: AcquisitionChrome | null,
): boolean {
  return Boolean(chrome && chrome.accountWide && chrome.unconditioned)
}
