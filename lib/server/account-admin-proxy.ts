import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { isSameOriginMutation, serverDerivedOperatorHeaders } from "@/lib/server/operator-session"

/**
 * Account administration's identity on a customer-resident install -- an opt-in
 * for this proxy alone.
 *
 * Registering or re-validating a workload account changes which accounts Cyntro
 * reads, so the backend requires BOTH proofs of one person and verifies each
 * (unified/identity/person_request.verify_person, require_alb): the ALB-signed
 * x-amzn-oidc-data against the pinned ALB signer, and the IdP access token the
 * ALB obtained for the same session (x-amzn-oidc-accesstoken) against the
 * pinned issuer's JWKS, with issuer, client and subject equal. Holding either
 * header proves nothing here: this server relays what the ALB sent, synthesizes
 * nothing when it sent none, and leaves every verdict to the backend.
 *
 * The access token travels as Authorization: Bearer, which an off-origin
 * redirect strips; the browser's own Authorization is never forwarded in this
 * mode, so the only bearer the backend can see is the ALB's.
 * serverDerivedOperatorHeaders also serves LP mutations, remediation and
 * rollback; it is reused for the signed header and stays unchanged.
 */
export async function accountAdminIdentityHeaders(
  request: Pick<NextRequest, "cookies" | "headers">,
): Promise<Record<string, string>> {
  const headers = await serverDerivedOperatorHeaders(request)
  const accessToken = request.headers.get("x-amzn-oidc-accesstoken")?.trim()
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  return headers
}

export async function proxyAccountAdmin(
  request: NextRequest,
  segments: string[] = [],
): Promise<NextResponse> {
  const resident = process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT"
  // The ALB session is a cookie, so a write must prove it came from this origin
  // before anything is forwarded.
  if (resident && !isSameOriginMutation(request)) {
    return NextResponse.json({ detail: { code: "ACCOUNT_ADMIN_ORIGIN_REFUSED" }, success: false }, { status: 403 })
  }
  const suffix = segments.length ? `/${segments.map(encodeURIComponent).join("/")}` : ""
  const target = new URL(`${getBackendBaseUrl()}/api/admin/accounts${suffix}`)
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value))
  try {
    const hasBody = !["GET", "HEAD"].includes(request.method)
    const headers: Record<string, string> = { Accept: "application/json" }
    if (hasBody) headers["Content-Type"] = request.headers.get("content-type") || "application/json"
    if (resident) {
      // Only the ALB's two headers; see accountAdminIdentityHeaders.
      Object.assign(headers, await accountAdminIdentityHeaders(request))
    } else {
      const authorization = request.headers.get("authorization")
      if (authorization) headers.Authorization = authorization
    }
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: "no-store",
    })
    // Bytes, not text: a non-JSON body (the stack template download) is relayed unchanged,
    // and so is its Content-Disposition, or the browser would not save it as a file.
    const body = await response.arrayBuffer()
    const relayed: Record<string, string> = {
      "Content-Type": response.headers.get("content-type") || "application/json",
    }
    const disposition = response.headers.get("content-disposition")
    if (disposition) relayed["Content-Disposition"] = disposition
    const nullBody = [204, 205, 304].includes(response.status)
    return new NextResponse(nullBody ? null : body, { status: response.status, headers: relayed })
  } catch (reason) {
    return NextResponse.json(
      {
        error: "account_admin_proxy_unavailable",
        detail: reason instanceof Error ? reason.message : String(reason),
      },
      { status: 502 },
    )
  }
}
