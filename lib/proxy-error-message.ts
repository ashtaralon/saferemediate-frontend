/**
 * Coerce proxy/backend error JSON into a human-readable string.
 * FastAPI often returns `detail` as an object or validation array.
 */
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
