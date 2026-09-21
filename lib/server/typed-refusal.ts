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
 *
 * The field caps below count CHARACTERS, which is what they are named for.
 * The ceiling counts BYTES of the UTF-8 serialization, which is what a
 * response is actually measured in, and the two do not track each other: one
 * CJK code unit is three UTF-8 bytes, one emoji is four, and a surrogate half
 * that `JSON.stringify` escapes to `\udXXX` is six. Every path out of
 * `extractTypedRefusal` is therefore measured in bytes, including the degrade
 * paths -- a degrade path that is itself unbounded bounds nothing.
 *
 * The contract, in full, is a three-step ladder and never a partial body:
 *
 *   1. the clipped, capped allowlist, when it fits MAX_REFUSAL_BYTES;
 *   2. the identity -- `code` and `upstream_code` -- when it does not, with
 *      `message`, `request_id` and `diagnostics` DROPPED, not shortened;
 *   3. `code` alone, cut on a code-point boundary, when even that is over.
 *
 * Step 2 drops rather than shrinks on purpose: a body relayed at half its
 * size is still a body whose size the upstream chose. Callers should expect
 * `code` and nothing more; a test that asserts on `message` must first put
 * the refusal in step 1, or it is asserting on `undefined`.
 */

/** Longest string any single preserved field may carry. */
export const MAX_FIELD_CHARS = 512
/** Longest non-JSON body text kept, to keep an HTML error page out of a payload. */
export const MAX_TEXT_CHARS = 500
/** Most keys kept from `diagnostics`. */
export const MAX_DIAGNOSTIC_KEYS = 12
/** Ceiling on the refusal, as UTF-8 bytes of its JSON serialization. */
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

/**
 * UTF-8 bytes of the JSON this value serializes to. `String.length` counts
 * UTF-16 code units and would under-report every non-ASCII body by up to 6x.
 */
function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
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

/**
 * The longest whole-code-point prefix of `code` that still serializes inside
 * the ceiling. Cutting UTF-16 units instead would strand a surrogate half,
 * which `JSON.stringify` escapes to six bytes -- growing what we are shrinking.
 * `{"code":""}` is 11 bytes, so a fit always exists and the search terminates.
 *
 * At the constants above the search never actually cuts: the worst JSON
 * expansion is 6 bytes per UTF-16 code unit (an escaped surrogate half or
 * control character), so a MAX_FIELD_CHARS code serializes to at most
 * 512*6+11 = 3083 bytes. That is headroom, not a guarantee -- raising
 * MAX_FIELD_CHARS or lowering MAX_REFUSAL_BYTES consumes it silently, which
 * is exactly why the ceiling is enforced here rather than inferred from the
 * relationship between two constants.
 */
function fitCode(code: string): TypedRefusal {
  const points = Array.from(code)
  let lo = 0
  let hi = points.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (serializedBytes({ code: points.slice(0, mid).join("") }) <= MAX_REFUSAL_BYTES) lo = mid
    else hi = mid - 1
  }
  return { code: points.slice(0, lo).join("") }
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

  if (serializedBytes(shaped) <= MAX_REFUSAL_BYTES) return shaped

  // Oversized: keep the identity and drop the commentary rather than relay it.
  const identity: TypedRefusal = {
    code: shaped.code,
    ...(shaped.upstream_code ? { upstream_code: shaped.upstream_code } : {}),
  }
  if (serializedBytes(identity) <= MAX_REFUSAL_BYTES) return identity

  // Two 512-character multibyte codes can exceed the ceiling on their own.
  // Cut the upstream's own code down to fit; never substitute one of ours.
  return fitCode(shaped.code)
}
