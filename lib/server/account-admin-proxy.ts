import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { isSameOriginMutation, serverDerivedOperatorHeaders } from "@/lib/server/operator-session"

export async function proxyAccountAdmin(
  request: NextRequest,
  segments: string[] = [],
): Promise<NextResponse> {
  const suffix = segments.length ? `/${segments.map(encodeURIComponent).join("/")}` : ""
  const target = new URL(`${getBackendBaseUrl()}/api/admin/accounts${suffix}`)
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value))
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "CROSS_SITE_REQUEST_REFUSED", message: "Account administration changes must come from this console." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    )
  }
  try {
    const hasBody = !["GET", "HEAD"].includes(request.method)
    const headers: Record<string, string> = { Accept: "application/json" }
    if (hasBody) headers["Content-Type"] = request.headers.get("content-type") || "application/json"
    // Operator identity is derived on this server only: the ALB-signed header
    // in customer-resident installs, or the sealed operator session on the
    // hosted console. A browser-supplied Authorization or x-amzn-oidc-data
    // header is never forwarded.
    Object.assign(headers, await serverDerivedOperatorHeaders(request))
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: "no-store",
    })
    const body = await response.text()
    // Account administration responses can carry a display-once ExternalId;
    // no browser or intermediary cache may keep them.
    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json", "Cache-Control": "no-store" },
    })
  } catch (reason) {
    return NextResponse.json(
      {
        error: "account_admin_proxy_unavailable",
        detail: reason instanceof Error ? reason.message : String(reason),
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    )
  }
}
