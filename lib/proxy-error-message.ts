/**
 * Coerce proxy/backend error JSON into a human-readable string.
 * FastAPI often returns `detail` as an object or validation array.
 *
 * A structured refusal (e.g. the sync-all serving-tier 503) arrives as
 * `{detail: {error, reason, what_to_do, ...}}`. Dumping that object at the
 * user — as `[object Object]` via a bare `||` chain, or as raw JSON via
 * stringify — throws away the sentence the backend wrote for exactly this
 * moment. So prefer a human field, and append the actionable half when the
 * payload carries one.
 *
 * `what_to_do` and `hint` are both already in use by backend refusals
 * (api/collectors.py and api/v2_sync.py respectively); this reads the two
 * that exist rather than inventing a third.
 */
const HUMAN_KEYS = ["reason", "message", "detail", "error"] as const
const GUIDANCE_KEYS = ["what_to_do", "hint"] as const

function firstString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

export function coerceProxyErrorMessage(body: unknown, fallback: string): string {
  const b = body as { detail?: unknown; error?: unknown; code?: unknown } | null
  const d = b?.detail ?? b?.error
  if (typeof d === "string" && d.trim()) return d
  if (Array.isArray(d)) {
    return d
      .map((item) => {
        if (typeof item === "string") return item
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg?: unknown }).msg ?? JSON.stringify(item))
        }
        return JSON.stringify(item)
      })
      .join("; ")
  }
  if (d && typeof d === "object") {
    const obj = d as Record<string, unknown>
    const primary = firstString(obj, HUMAN_KEYS)
    const guidance = firstString(obj, GUIDANCE_KEYS)
    // `error` is often a machine slug ("sync_dispatch_not_configured"), which
    // is an identifier and not something to show a human. When the payload
    // also carries guidance, lead with the guidance instead of the slug.
    const primaryIsSlug = primary !== null && !/\s/.test(primary)
    if (primary && !(primaryIsSlug && guidance)) {
      return guidance ? `${primary} ${guidance}` : primary
    }
    if (guidance) return guidance
  }
  if (d != null) {
    try {
      return typeof d === "object" ? JSON.stringify(d) : String(d)
    } catch {
      return fallback
    }
  }
  if (typeof b?.code === "string" && b.code.trim()) return b.code
  return fallback
}
