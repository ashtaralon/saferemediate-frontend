import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { serverDerivedOperatorHeaders } from "@/lib/server/operator-session"

/**
 * Pending-tag approve / reject, and the decision request's status.
 *
 * On a customer-resident install the backend RECORDS a decision (202) and the projector worker applies
 * it; the decision is attributed to the operator the private ALB authenticated, so the ALB-signed
 * x-amzn-oidc-data is forwarded -- through serverDerivedOperatorHeaders, the one definition of "the ALB's
 * header", which forwards nothing else in that mode. The backend's status code and body are relayed as
 * they are: 202 accepted, 401 / 403 / 409 / 422 / 503 refusals each carry a named `code` the UI shows.
 */
export async function proxyPendingTagDecision(
  request: NextRequest,
  action: "approve" | "reject",
): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, code: "PENDING_TAG_DECISION_INVALID", error: "A decision needs a JSON body" },
      { status: 400 },
    )
  }
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" }
  if (process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT") {
    Object.assign(headers, await serverDerivedOperatorHeaders(request))
  }
  try {
    const response = await fetch(`${getBackendBaseUrl()}/api/auto-tagger/pending/${action}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    })
    return relay(response)
  } catch (reason) {
    return NextResponse.json(
      {
        success: false,
        code: "PENDING_TAG_DECISION_PROXY_UNAVAILABLE",
        error: reason instanceof Error ? reason.message : String(reason),
      },
      { status: 502 },
    )
  }
}

/** GET a decision read (the capability, or one pending tag's request) and relay it as it is. */
export async function proxyPendingTagDecisionRead(path: string): Promise<NextResponse> {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/api/auto-tagger/pending/decisions/${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    })
    return relay(response)
  } catch (reason) {
    return NextResponse.json(
      {
        success: false,
        code: "PENDING_TAG_DECISION_PROXY_UNAVAILABLE",
        error: reason instanceof Error ? reason.message : String(reason),
      },
      { status: 502 },
    )
  }
}

async function relay(response: Response): Promise<NextResponse> {
  const text = await response.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { success: false, error: `The backend answered HTTP ${response.status} without JSON` }
  }
  return NextResponse.json(data, { status: response.status, headers: { "Cache-Control": "no-store" } })
}
