import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { selectBackendProof } from "@/lib/server/backend-proof"
import { authorizeCopilotSystem } from "@/lib/server/copilot-scope"

const NO_STORE_HEADERS = { "Cache-Control": "no-store" }
// Registered reason codes are upper-case identifiers. Anything else from upstream is not
// displayed or passed on as a code.
const TYPED_CODE = /^[A-Z][A-Z0-9_]{2,127}$/

function refusal(status: number, reasonCode: string) {
  return NextResponse.json({ status: "unavailable", reason_code: reasonCode }, { status, headers: NO_STORE_HEADERS })
}

function typedCode(body: unknown): string | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null
  const record = body as Record<string, any>
  const detail = record.detail !== null && typeof record.detail === "object" ? record.detail : null
  const candidate = record.error_code ?? record.reason_code ?? detail?.error_code ?? detail?.reason_code
  return typeof candidate === "string" && TYPED_CODE.test(candidate) ? candidate : null
}

/** One call to the backend's `envelope=true` route. A refusal keeps its code; nothing becomes a number. */
async function forwardDecisionInventory(
  operation: "count" | "list",
  forwarded: URLSearchParams,
  headers: Record<string, string>,
  untypedUnauthorizedCode = "ANALYST_BACKEND_UNAVAILABLE",
): Promise<NextResponse> {
  let response: Response
  try {
    response = await fetch(`${getBackendBaseUrl()}/api/resource-inventory/${operation}?${forwarded.toString()}`, {
      cache: "no-store",
      headers,
    })
  } catch {
    return refusal(502, "ANALYST_BACKEND_UNAVAILABLE")
  }

  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!response.ok) {
    const fallback = response.status === 401 ? untypedUnauthorizedCode : "ANALYST_BACKEND_UNAVAILABLE"
    return refusal(response.status, typedCode(body) ?? fallback)
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return refusal(502, "ANALYST_INVALID_RESPONSE")
  }
  return NextResponse.json(body, { status: 200, headers: NO_STORE_HEADERS })
}

/**
 * The copilot's `envelope=true` inventory calls are answered by the Decision runtime, which
 * requires the verified ALB OIDC identity. They get the Analyst proxy's containment:
 * customer-resident mode, both ALB headers, and an allowlisted system. Only the signed
 * `x-amzn-oidc-data` header is forwarded as identity. A refusal keeps its registered code,
 * and nothing here turns a refusal into a number or falls back to a raw read.
 *
 * The raw `envelope=false` path does not come through here, and neither do product surfaces
 * (see `proxyProductDecisionInventory`).
 */
export async function proxyDecisionInventory(
  req: NextRequest,
  operation: "count" | "list",
  params: URLSearchParams,
): Promise<NextResponse> {
  const scope = authorizeCopilotSystem(req, params.get("system"))
  if (!scope.enabled) {
    return refusal(scope.status, scope.code.replace(/^COPILOT_/, "ANALYST_"))
  }
  const forwarded = new URLSearchParams(params)
  forwarded.set("system", scope.systemName)
  forwarded.set("envelope", "true")
  return forwardDecisionInventory(operation, forwarded, {
    Accept: "application/json",
    "X-Amzn-Oidc-Data": req.headers.get("x-amzn-oidc-data")!.trim(),
  })
}

/**
 * Product surfaces (All Services) read the Decision list in both deployment shapes. The
 * backend decides identity, tenant and scope; this proxy only chooses which proof to present,
 * through the one shared selection (`selectBackendProof`), and choosing grants nothing:
 * customer-resident forwards only the signed ALB OIDC data, hosted re-verifies the sealed
 * session and presents only the installed service token.
 *
 * The requested system is a narrowing request only; the backend refuses a system outside the
 * principal's scope. Unlike the copilot there is no frontend allowlist: that allowlist is the
 * copilot's free-form-question containment, not a product scope.
 */
export async function proxyProductDecisionInventory(
  req: NextRequest,
  operation: "list",
  params: URLSearchParams,
): Promise<NextResponse> {
  const system = params.get("system")?.trim()
  if (!system) return refusal(400, "ANALYST_SYSTEM_SCOPE_REQUIRED")
  const forwarded = new URLSearchParams(params)
  forwarded.set("system", system)
  forwarded.set("envelope", "true")

  const proof = await selectBackendProof(req)
  if (!proof.ok) return refusal(proof.status, proof.code)
  return forwardDecisionInventory(
    operation, forwarded, { Accept: "application/json", ...proof.headers }, proof.untypedUnauthorizedCode,
  )
}
