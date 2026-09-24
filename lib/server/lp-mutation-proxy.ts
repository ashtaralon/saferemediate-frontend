import { NextResponse } from "next/server"

import { getBackendBaseUrl } from "@/lib/server/backend-url"

const SERVICE_TOKEN_HEADER = "X-Cyntro-Service-Token"
const NOT_CONFIGURED = "DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED"
const LIFECYCLE_REQUIRED = "LIFECYCLE_PROCESS_NOT_DEPLOYED"
const DESTINATION_ENV = "CYNTRO_LP_LIFECYCLE_URL"

function lifecycleOrigin(): string | null {
  const raw = process.env[DESTINATION_ENV]?.trim()
  if (!raw) return null
  let destination: URL
  try {
    destination = new URL(raw)
  } catch {
    return null
  }
  if (destination.protocol !== "https:" || destination.username || destination.password || destination.search || destination.hash) {
    return null
  }
  const servingHost = new URL(getBackendBaseUrl()).hostname
  if (destination.hostname === servingHost || destination.hostname === "cyntro-c1.onrender.com") return null
  return destination.origin
}

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
        attempted_writes: 0,
        confirmed_writes: 0,
        unknown_writes: 0,
        origin: "proxy",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
  const origin = lifecycleOrigin()
  if (!origin) {
    return NextResponse.json(
      {
        code: LIFECYCLE_REQUIRED,
        cloud_writes: 0,
        attempted_writes: 0,
        confirmed_writes: 0,
        unknown_writes: 0,
        origin: "proxy",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { code: "PLAN_EMPTY", cloud_writes: 0, attempted_writes: 0, confirmed_writes: 0, unknown_writes: 0, origin: "proxy" },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    )
  }
  const forwarded = { ...(body as Record<string, unknown>) }
  delete forwarded.lifecycle_url
  delete forwarded.lifecycleUrl
  const response = await fetch(origin + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", [SERVICE_TOKEN_HEADER]: token },
    cache: "no-store",
    body: JSON.stringify(forwarded),
  })
  const text = await response.text().catch(() => "")
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  const payload = parsed && typeof parsed === "object" ? parsed : {
    code: "UNREADABLE", cloud_writes: null, attempted_writes: null, confirmed_writes: null, unknown_writes: null,
  }
  return NextResponse.json(payload, { status: response.status, headers: { "Cache-Control": "no-store" } })
}
