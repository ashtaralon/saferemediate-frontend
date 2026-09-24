import { NextResponse } from "next/server"

import { getBackendBaseUrl } from "@/lib/server/backend-url"

const SERVICE_TOKEN_HEADER = "X-Cyntro-Service-Token"
const NOT_CONFIGURED = "DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED"

function serverToken(): string | null {
  const token = process.env.CYNTRO_SERVICE_TOKEN?.trim()
  return token || null
}

export async function forwardLpMutation(request: Request, path: "/api/least-privilege/apply" | "/api/least-privilege/restore") {
  const token = serverToken()
  if (!token) {
    return NextResponse.json(
      {
        error_code: NOT_CONFIGURED,
        code: NOT_CONFIGURED,
        cloud_writes: 0,
        origin: "proxy",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { code: "PLAN_EMPTY", cloud_writes: 0, origin: "proxy" },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    )
  }
  const backendUrl = getBackendBaseUrl().replace(/\/+$/, "").replace(/\/backend$/, "")
  const response = await fetch(backendUrl + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [SERVICE_TOKEN_HEADER]: token,
    },
    cache: "no-store",
    body: JSON.stringify(body),
  })
  const text = await response.text().catch(() => "")
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  const payload = parsed && typeof parsed === "object" ? parsed : { code: "UNREADABLE", cloud_writes: null }
  return NextResponse.json(payload, {
    status: response.status,
    headers: { "Cache-Control": "no-store" },
  })
}
