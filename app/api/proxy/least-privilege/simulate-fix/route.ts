import { NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 30

const SERVICE_TOKEN_HEADER = "X-Cyntro-Service-Token"
const OIDC_DATA_HEADER = "X-Amzn-Oidc-Data"
const NOT_CONFIGURED = "DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED"
const NOT_CONFIGURED_MESSAGE =
  "This request carries no verified identity and this deployment has no " +
  "service token configured (CYNTRO_SERVICE_TOKEN), so the read cannot be " +
  "authorized. Installing the token is a release prerequisite."

const UPSTREAM_TIMEOUT_MS = 25_000

type Proof =
  | { kind: "ready"; headers: Record<string, string> }
  | { kind: "not_configured" }

function proofFor(request: Request): Proof {
  const oidc = request.headers.get("x-amzn-oidc-data")?.trim()
  if (oidc) return { kind: "ready", headers: { [OIDC_DATA_HEADER]: oidc } }
  const token = process.env.CYNTRO_SERVICE_TOKEN?.trim()
  if (token) return { kind: "ready", headers: { [SERVICE_TOKEN_HEADER]: token } }
  return { kind: "not_configured" }
}

function localRefusal(): NextResponse {
  return NextResponse.json(
    {
      error_code: NOT_CONFIGURED,
      code: NOT_CONFIGURED,
      error: NOT_CONFIGURED_MESSAGE,
      detail: NOT_CONFIGURED_MESSAGE,
      origin: "proxy",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}

async function passthrough(response: Response): Promise<NextResponse> {
  const text = await response.text().catch(() => "")
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  const headers = { "Cache-Control": "no-store" }
  if (parsed !== null && typeof parsed === "object") {
    return NextResponse.json(parsed, { status: response.status, headers })
  }
  return NextResponse.json(
    {
      error: `Backend returned ${response.status}`,
      detail: text.trim().slice(0, 500) || `Backend returned ${response.status} with no readable body`,
      backendStatus: response.status,
      origin: "proxy",
    },
    { status: response.status, headers },
  )
}

export async function POST(request: Request) {
  const proof = proofFor(request)
  if (proof.kind === "not_configured") return localRefusal()

  const body = await request.json().catch(() => ({}))
  const { resource_type, resource_id, system_name } = body as {
    resource_type?: string
    resource_id?: string
    system_name?: string
  }
  if (!resource_type || !resource_id || !system_name) {
    return NextResponse.json(
      { success: false, error: "resource_type, resource_id, and system_name are required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }

  const backendUrl = getBackendBaseUrl().replace(/\/+$/, "").replace(/\/backend$/, "")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const res = await fetch(backendUrl + "/api/least-privilege/simulate-fix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...proof.headers,
      },
      cache: "no-store",
      body: JSON.stringify({ resource_type, resource_id, system_name }),
      signal: controller.signal,
    })
    if (!res.ok) return passthrough(res)
    const data = await res.json()
    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : ""
    const timedOut = name === "TimeoutError" || name === "AbortError"
    return NextResponse.json(
      {
        error: timedOut
          ? "simulate-fix timed out (backend > 25s). Retry; Render worker may be warming."
          : err instanceof Error ? err.message : "simulate-fix failed",
        origin: "proxy",
      },
      { status: timedOut ? 504 : 503, headers: { "Cache-Control": "no-store" } },
    )
  } finally {
    clearTimeout(timeout)
  }
}
