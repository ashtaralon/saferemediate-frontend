import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

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
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: "no-store",
    })
    const body = await response.text()
    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
    })
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
