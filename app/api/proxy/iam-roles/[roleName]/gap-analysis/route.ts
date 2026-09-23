import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { fromCaughtError } from "@/lib/server/proxy-error"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const SERVICE_TOKEN_HEADER = "X-Cyntro-Service-Token"
const OIDC_DATA_HEADER = "X-Amzn-Oidc-Data"
const NOT_CONFIGURED = "DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED"

function proofFor(request: NextRequest):
  | { kind: "ready"; headers: Record<string, string> }
  | { kind: "not_configured" } {
  const oidc = request.headers.get("x-amzn-oidc-data")?.trim()
  if (oidc) return { kind: "ready", headers: { [OIDC_DATA_HEADER]: oidc } }
  const token = process.env.CYNTRO_SERVICE_TOKEN?.trim()
  if (token) return { kind: "ready", headers: { [SERVICE_TOKEN_HEADER]: token } }
  return { kind: "not_configured" }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  const proof = proofFor(req)
  if (proof.kind === "not_configured") {
    return NextResponse.json(
      {
        error_code: NOT_CONFIGURED,
        code: NOT_CONFIGURED,
        error: "This request carries no verified identity and this deployment has no service token configured (CYNTRO_SERVICE_TOKEN), so the read cannot be authorized. Installing the token is a release prerequisite.",
        detail: "This request carries no verified identity and this deployment has no service token configured (CYNTRO_SERVICE_TOKEN), so the read cannot be authorized. Installing the token is a release prerequisite.",
        origin: "proxy",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  const { roleName } = await params
  const url = new URL(req.url)
  const days = url.searchParams.get("days") ?? "90"
  const envelope = url.searchParams.get("envelope") === "true"

  console.log(`[IAM Proxy] Fetching ${roleName} from backend...`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 55000) // 55s timeout

  try {
    const backendUrl = `${getBackendBaseUrl()}/api/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=${days}${envelope ? "&envelope=true" : ""}`
    console.log(`[IAM Proxy] Calling: ${backendUrl}`)

    const res = await fetch(backendUrl, {
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...proof.headers },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text().catch(() => "")
      console.error(`[IAM Proxy] Backend error ${res.status}: ${errorText.slice(0, 200)}`)
      let parsed: unknown = null
      try {
        parsed = errorText ? JSON.parse(errorText) : null
      } catch {
        parsed = null
      }
      if (parsed !== null && typeof parsed === "object") {
        return NextResponse.json(parsed, {
          status: res.status,
          headers: { "Cache-Control": "no-store" },
        })
      }
      return NextResponse.json(
        {
          error: `IAM gap-analysis backend returned ${res.status}`,
          detail: errorText.slice(0, 500),
          backendStatus: res.status,
          origin: "proxy",
        },
        { status: res.status, headers: { "Cache-Control": "no-store" } },
      )
    }

    const data = await res.json()
    console.log(`[IAM Proxy] Success: LP score ${data.summary?.lp_score}, used=${data.summary?.used_count}, unused=${data.summary?.unused_count}`)

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const e = error as Error
    console.error(`[IAM Proxy] Error for ${roleName}:`, e?.name, e?.message)
    // Fail closed on timeout/unreachable too: AbortError -> 504, else -> 503.
    // Never a 200-with-zeros (see the !res.ok branch above).
    return fromCaughtError(error)
  }
}
