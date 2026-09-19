import { type NextRequest, NextResponse } from "next/server"
import { selectBackendProof } from "@/lib/server/backend-proof"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

/**
 * Customer-resident: the request's own signed operator proof is selected BEFORE any backend call (the shared
 * selection, unchanged), refused by name with no call at all, and only the selected proof header is forwarded.
 * Hosted: unchanged -- the sealed-session gate and the process-wide token writer, and no client identity header.
 */
async function residentRollbackProof(req: NextRequest): Promise<
  { refusal: { status: number; code: string }; headers?: never } | { refusal?: never; headers: Record<string, string> }
> {
  if (process.env.CYNTRO_DEPLOYMENT_MODE !== "CUSTOMER_RESIDENT") return { headers: {} }
  const proof = await selectBackendProof(req)
  if (!proof.ok) return { refusal: { status: proof.status, code: proof.code } }
  return { headers: proof.headers }
}

const ROLLBACK_PROOF_MESSAGES: Record<string, string> = {
  ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE: "The load balancer attached no verified operator identity. Nothing was restored.",
  SITE_SESSION_INVALID: "The site session is missing or invalid. Nothing was restored.",
  DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE: "This deployment's server-to-server credential is not installed. Nothing was restored.",
}

// Root191 F4: a canonical typed refusal detail is a NON-ARRAY OBJECT with a NONEMPTY STRING ``code``. Anything else
// (null, string, array, missing/empty code) is not a typed refusal; the upstream body may still be readable JSON, but
// it does not carry a backend refusal code and the proxy must not invent one. Returning null asks the caller to fall
// back to a named proxy-unavailability detail that preserves the original upstream status.
type CanonicalRefusalDetail = { code: string; [key: string]: unknown }
function typedRefusalDetail(candidate: unknown): CanonicalRefusalDetail | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null
  const code = (candidate as Record<string, unknown>).code
  if (typeof code !== "string" || code.length === 0) return null
  return candidate as CanonicalRefusalDetail
}

// Named shape summary carried by the named fallback so an operator can tell a JSON parse failure apart from an object
// that just did not carry a typed code. Never asserts what the upstream meant to say.
function upstreamBodyShape(readable: boolean, body: unknown): string {
  if (!readable) return "unreadable"
  if (body === null) return "readable_null"
  if (Array.isArray(body)) return "readable_array"
  if (typeof body === "string") return "readable_string"
  if (typeof body === "object") {
    const detail = (body as Record<string, unknown>).detail
    if (detail === undefined) return "readable_object_no_detail"
    if (typeof detail === "string") return "readable_string_detail"
    if (detail === null) return "readable_null_detail"
    if (Array.isArray(detail)) return "readable_array_detail"
    if (typeof detail === "object") {
      const code = (detail as Record<string, unknown>).code
      if (typeof code === "string" && code.length > 0) return "readable_typed_refusal"
      return "readable_object_detail_missing_code"
    }
    return "readable_other_detail"
  }
  return "readable_other"
}

// Legacy message selection preserved from the previous route, which was literally
// ``errorData.detail || errorData.message || `Backend returned ${status}` ``. That is plain JS TRUTHINESS, so it
// skips `false`, `0`, `NaN`, `""`, `null` and `undefined` alike and falls through to the next candidate. An earlier
// version of this helper tested only `undefined`/`null`/`""` and therefore RETURNED `false` and `0` where the
// original fell through -- a behaviour change in the legacy field this function exists to preserve. Truthiness is
// restored here. Never derived from the new canonical ``detail`` field, so a caller still consuming ``message``
// receives exactly the value it did before F4.
function legacyMessage(errorData: unknown, status: number): unknown {
  if (errorData && typeof errorData === "object" && !Array.isArray(errorData)) {
    const record = errorData as Record<string, unknown>
    if (record.detail) return record.detail
    if (record.message) return record.message
  }
  return `Backend returned ${status}`
}

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  getBackendBaseUrl()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  // In Next.js 14+, params is a Promise that must be awaited
  const { snapshotId } = await params

  const proof = await residentRollbackProof(request)
  if (proof.refusal) {
    // Root191 F4: local proof refusal now also carries a canonical typed ``detail`` alongside the legacy
    // ``message`` object. Legacy fields, upstream status (the proof gate's own), the no-store header and the
    // origin marker are byte-preserved.
    const proofMessage = ROLLBACK_PROOF_MESSAGES[proof.refusal.code] ?? "Rollback request refused."
    return NextResponse.json(
      { error: "Failed to rollback snapshot",
        message: { code: proof.refusal.code, message: proofMessage },
        detail: { code: proof.refusal.code, message: proofMessage, origin: "proxy_local_proof_refusal" },
        origin: "proxy" },
      { status: proof.refusal.status, headers: { "Cache-Control": "no-store" } },
    )
  }

  // Whether the upstream produced a response at all. The catch below covers BOTH a transport failure (no response)
  // and a 2xx response whose body could not be parsed, and those are different facts: the second one means the
  // backend WAS reached and answered success. Neither is a verified restoration, so the refusal text must not claim
  // the backend was unreachable when it was.
  let upstreamResponded = false
  try {
    console.log(`[SNAPSHOTS-ROLLBACK] Rolling back snapshot: ${snapshotId}`)

    const response = await fetch(`${BACKEND_URL}/api/snapshots/${encodeURIComponent(snapshotId)}/rollback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...proof.headers,
      },
      cache: "no-store",
    })
    upstreamResponded = true

    if (!response.ok) {
      // Root191 F4-Ref1: read the upstream body ONCE. On JSON parse failure carry the unreadable named shape without
      // asserting an outcome. Ref2: keep the previous ``message`` selection (``detail`` -> ``message`` -> fallback
      // string) exactly as it was, and add a canonical typed ``detail`` field separately. When the upstream ``detail``
      // is a non-array object with a nonempty string ``code`` it becomes the typed refusal verbatim; every other body
      // shape (null / string / array / missing-code / unreadable) becomes a named PROXY_UPSTREAM_REFUSAL_UNREADABLE
      // detail that preserves the ORIGINAL upstream status and states plainly that the upstream did not provide a
      // readable typed refusal. No invented backend code, no implied restore outcome.
      let errorData: unknown = undefined
      let readable = true
      try {
        errorData = await response.json()
      } catch {
        readable = false
      }
      const message = legacyMessage(errorData, response.status)
      const upstreamDetail = errorData && typeof errorData === "object" && !Array.isArray(errorData)
        ? (errorData as Record<string, unknown>).detail
        : undefined
      const typed = typedRefusalDetail(upstreamDetail)
      const detail: CanonicalRefusalDetail = typed ?? {
        code: "PROXY_UPSTREAM_REFUSAL_UNREADABLE",
        message: "The upstream did not provide a readable typed refusal. This is not a claim that no AWS state changed; the restoration result is not verified by the proxy.",
        upstream_status: response.status,
        upstream_body_shape: upstreamBodyShape(readable, errorData),
      }
      console.error(`[SNAPSHOTS-ROLLBACK] Backend returned ${response.status}: shape=${detail.upstream_body_shape ?? "typed"}`)
      return NextResponse.json(
        { error: "Failed to rollback snapshot", message, detail },
        { status: response.status, headers: { "Cache-Control": "no-store" } },
      )
    }

    const data = await response.json()
    console.log(`[SNAPSHOTS-ROLLBACK] ✅ Success:`, data)

    // Success body is unchanged (Root191 F4 preserves the existing success shape byte-for-byte).
    return NextResponse.json(data)
  } catch (error) {
    // Root191 F4: neither branch here verified anything about the restoration, and the canonical ``detail`` never
    // claims that no AWS state changed. This block is reached in TWO ways and must not describe them identically:
    //   * no response at all (transport failure) -- the backend may not have been reached;
    //   * a 2xx response whose body could not be parsed -- the backend WAS reached and answered success, so
    //     asserting it was unreachable would be false, and a restore may well have been performed.
    // In both cases the honest statement is that the restoration result could not be verified and the outcome is
    // uncertain. The existing code, 500 status and legacy ``error``/``message`` fields are unchanged.
    console.error("[SNAPSHOTS-ROLLBACK] Error:", error)
    const errorName = error instanceof Error ? error.name : "UnknownError"
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Failed to rollback snapshot",
        message: errorMessage,
        detail: {
          code: "PROXY_FETCH_FAILED",
          message: upstreamResponded
            ? "The backend answered but the rollback proxy could not read its response body, so the restoration result could not be verified and the outcome is uncertain. This is not a claim that no AWS state changed."
            : "The rollback proxy did not obtain a response from the backend, so the restoration result could not be verified and the outcome is uncertain. This is not a claim that no AWS state changed.",
          error_name: errorName,
          upstream_responded: upstreamResponded,
          origin: "proxy_fetch_failure",
        } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
