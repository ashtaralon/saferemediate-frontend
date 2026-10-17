/**
 * (AP201 Rev 6 Day 4 §4.4) One operator line for a failed attack-path read, from the server's own body.
 *
 * On a resident install (`CYNTRO_SERVING_READ_GUARD=enforce`) closure-preview, damage-scope, business-impact and
 * permission-cut are held: the server answers 503 `{"detail": {"code": "SERVING_ROUTE_HELD", "reason": ...}}`. Readers
 * used to build their error from `detail` as if it were a string, which renders an object; a held route must instead
 * say the capability is NOT AVAILABLE ON THIS INSTALL, with the server's coded reason, and never read as "no damage",
 * "no excess" or "no exposure".
 */
import { appendScopeClaims, type ScopeClaims } from "@/lib/attack-paths/scope-claims"
import {
  accountScopeRequiredMessage,
  semanticHoldMessage,
  typedReaderUnavailable,
  typedServingRefusal,
} from "@/lib/semantic-hold"

/** (Review S10) The account the failed read named (null: none), so an ACCOUNT_SCOPE_REQUIRED line is true for the page
 *  it is shown on. A caller that does not know omits it and gets the default line. */
export interface HeldRouteAccountSelection {
  selectedAccount: string | null
}

/** The account a read carrying these claims names: read back from `appendScopeClaims`, so it is the same rule that put
 *  `account_id` on the query (a system key's own account wins over the selected one). */
export function heldRouteAccountSelection(claims: ScopeClaims | null | undefined): HeldRouteAccountSelection {
  return { selectedAccount: appendScopeClaims(new URLSearchParams(), claims).get("account_id") }
}

export function heldRouteMessage(
  body: unknown,
  status: number,
  capability: string,
  selection?: HeldRouteAccountSelection,
): string {
  const typed = typedServingRefusal(body) ?? typedReaderUnavailable(body)
  if (typed?.kind === "route_held") {
    return `${capability} is not available on this install (${typed.reason ?? "SERVING_ROUTE_HELD"}). This is not a result.`
  }
  if (typed?.kind === "scope_required" && selection) {
    return `${capability}: ${accountScopeRequiredMessage(selection.selectedAccount)}`
  }
  if (typed) return `${capability}: ${semanticHoldMessage(typed)}`
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null
  if (typeof b?.detail === "string" && b.detail) return b.detail
  if (typeof b?.error === "string" && b.error) return b.error
  return `${capability} could not be read (HTTP ${status}).`
}
