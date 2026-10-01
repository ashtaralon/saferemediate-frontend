import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { serverDerivedOperatorHeaders } from "@/lib/server/operator-session"

export async function proxyAccountAdmin(
  request: NextRequest,
  segments: string[] = [],
): Promise<NextResponse> {
  const suffix = segments.length ? `/${segments.map(encodeURIComponent).join("/")}` : ""
  const target = new URL(`${getBackendBaseUrl()}/api/admin/accounts${suffix}`)
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value))
  try {
    const hasBody = !["GET", "HEAD"].includes(request.method)
    const headers: Record<string, string> = { Accept: "application/json" }
    if (hasBody) headers["Content-Type"] = request.headers.get("content-type") || "application/json"
    const authorization = request.headers.get("authorization")
    if (authorization) headers.Authorization = authorization
    // Customer-resident: the private ALB authenticated the operator and signed
    // x-amzn-oidc-data. The backend verifies it and records who asked
    // (api/_operator_attribution.py); it is attribution, never a grant. The one
    // definition of "the ALB's header" is serverDerivedOperatorHeaders, which
    // forwards nothing else in this mode.
    if (process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT") {
      Object.assign(headers, await serverDerivedOperatorHeaders(request))
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
