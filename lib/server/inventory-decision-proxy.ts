import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
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

/**
 * The copilot's `envelope=true` inventory calls are answered by the Decision runtime, which
 * requires the verified ALB OIDC identity. They get the Analyst proxy's containment:
 * customer-resident mode, both ALB headers, and an allowlisted system. Only the signed
 * `x-amzn-oidc-data` header is forwarded as identity. A refusal keeps its registered code,
 * and nothing here turns a refusal into a number or falls back to a raw read.
 *
 * The raw `envelope=false` path (All Services) does not come through here.
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

  let response: Response
  try {
    response = await fetch(`${getBackendBaseUrl()}/api/resource-inventory/${operation}?${forwarded.toString()}`, {
      cache: "no-store",
      headers: { Accept: "application/json", "X-Amzn-Oidc-Data": req.headers.get("x-amzn-oidc-data")!.trim() },
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
    return refusal(response.status, typedCode(body) ?? "ANALYST_BACKEND_UNAVAILABLE")
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return refusal(502, "ANALYST_INVALID_RESPONSE")
  }
  return NextResponse.json(body, { status: 200, headers: NO_STORE_HEADERS })
}
