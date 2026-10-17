/**
 * (AP201 Rev 6 Day 4 §4.4) One operator line for a failed attack-path read, from the server's own body.
 *
 * On a resident install (`CYNTRO_SERVING_READ_GUARD=enforce`) closure-preview, damage-scope, business-impact and
 * permission-cut are held: the server answers 503 `{"detail": {"code": "SERVING_ROUTE_HELD", "reason": ...}}`. Readers
 * used to build their error from `detail` as if it were a string, which renders an object; a held route must instead
 * say the capability is NOT AVAILABLE ON THIS INSTALL, with the server's coded reason, and never read as "no damage",
 * "no excess" or "no exposure".
 */
import { semanticHoldMessage, typedReaderUnavailable, typedServingRefusal } from "@/lib/semantic-hold"

export function heldRouteMessage(body: unknown, status: number, capability: string): string {
  const typed = typedServingRefusal(body) ?? typedReaderUnavailable(body)
  if (typed?.kind === "route_held") {
    return `${capability} is not available on this install (${typed.reason ?? "SERVING_ROUTE_HELD"}). This is not a result.`
  }
  if (typed) return `${capability}: ${semanticHoldMessage(typed)}`
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null
  if (typeof b?.detail === "string" && b.detail) return b.detail
  if (typeof b?.error === "string" && b.error) return b.error
  return `${capability} could not be read (HTTP ${status}).`
}
