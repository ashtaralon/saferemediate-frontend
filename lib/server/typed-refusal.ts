/**
 * Bound what an upstream error body may become in a proxy response.
 *
 * Forwarding a parsed upstream object WHOLE fixed one bug and opened another:
 * a refusal's `code` survived, but so did anything else the backend happened
 * to attach, at whatever size it happened to be. A proxy that relays an
 * arbitrarily large upstream object is an amplification surface, and the UI
 * needs none of it -- it renders the code, and shows the message and request
 * id to an operator reporting the problem.
 *
 * So: an allowlist, not a size cap on a free-form blob. Unknown keys are
 * dropped rather than truncated, because a truncated unknown key is still
 * unbounded in shape. `diagnostics` is the one nested object kept, flattened
 * to scalars and capped, since it is what a support conversation asks for.
 */

/** Longest string any single preserved field may carry. */
export const MAX_FIELD_CHARS = 512
/** Longest non-JSON body text kept, to keep an HTML error page out of a payload. */
export const MAX_TEXT_CHARS = 500
/** Most keys kept from `diagnostics`. */
export const MAX_DIAGNOSTIC_KEYS = 12
/** Ceiling on the serialized refusal, enforced after shaping. */
export const MAX_REFUSAL_BYTES = 4096

/** Fields a refusal may carry through. Anything else is dropped. */
const ALLOWED_SCALARS = [
  "code",
  "upstream_code",
  "message",
  "request_id",
] as const

export type TypedRefusal = {
  code?: string
  upstream_code?: string
  message?: string
  request_id?: string
  diagnostics?: Record<string, string | number | boolean>
}

function clip(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  return value.length > MAX_FIELD_CHARS ? value.slice(0, MAX_FIELD_CHARS) : value
}

function shapeDiagnostics(raw: unknown): Record<string, string | number | boolean> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_DIAGNOSTIC_KEYS) break
    // Scalars only: a nested object is unbounded in shape, not just size.
    if (typeof value === "number" || typeof value === "boolean") out[key] = value
    else if (typeof value === "string") out[key] = clip(value) as string
  }
  return Object.keys(out).length ? out : undefined
}

/** The allowlisted refusal inside one upstream body, or undefined if it carries none. */
export function extractTypedRefusal(body: unknown): TypedRefusal | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined
  const record = body as Record<string, unknown>
  // FastAPI raises `{detail: {...}}`; some refusals arrive already unwrapped.
  const inner = record.detail
  const source =
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? (inner as Record<string, unknown>)
      : record

  const shaped: TypedRefusal = {}
  for (const key of ALLOWED_SCALARS) {
    const clipped = clip(source[key])
    if (clipped !== undefined) shaped[key] = clipped
  }
  const diagnostics = shapeDiagnostics(source.diagnostics)
  if (diagnostics) shaped.diagnostics = diagnostics

  // A body with no code is not a typed refusal; do not manufacture one from
  // whatever else happened to be present.
  if (!shaped.code) return undefined

  // Belt and braces: if the allowlisted shape is still somehow oversized, keep
  // the identity and drop the commentary rather than relay it.
  if (JSON.stringify(shaped).length > MAX_REFUSAL_BYTES) {
    return {
      code: shaped.code,
      ...(shaped.upstream_code ? { upstream_code: shaped.upstream_code } : {}),
    }
  }
  return shaped
}
