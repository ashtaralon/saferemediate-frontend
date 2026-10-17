import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"
import { coerceProxyErrorMessage } from "@/lib/proxy-error-message"
import { forwardScopeClaims } from "@/lib/server/scope-claims"
import { isSemanticHoldPayload, isTypedSemanticRefusal } from "@/lib/server/proxy-cache-hygiene"

// =============================================================================
// AttackPathReport proxy — GET /api/proxy/attack-paths/path/<pathId>/report
// Forwards to the backend Attack-Path Compiler's canonical report:
//   GET <backend>/api/attack-paths/<pathId>/report
// =============================================================================

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

type ProxyErrorBody = {
  error: string
  code: string
  detail: string
  path_id: string
  backendStatus?: number
  origin: "proxy"
}

function reportError(
  pathId: string,
  code: string,
  detail: string,
  status: number,
  backendStatus?: number,
): NextResponse {
  const body: ProxyErrorBody = {
    error: "attack_path_report_unavailable",
    code,
    detail,
    path_id: pathId,
    backendStatus,
    origin: "proxy",
  }
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function parseBackendErrorBody(text: string, status: number): { code: string; detail: string } {
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown }
    const detail = coerceProxyErrorMessage(parsed, text.slice(0, 400) || `backend ${status}`)
    const code =
      typeof parsed.detail === "string" && parsed.detail.includes("not found")
        ? "ATTACK_PATH_NOT_FOUND"
        : status === 404
          ? "ATTACK_PATH_NOT_FOUND"
          : "REPORT_UNAVAILABLE"
    return { code, detail }
  } catch {
    return {
      code: status === 404 ? "ATTACK_PATH_NOT_FOUND" : "REPORT_UNAVAILABLE",
      detail: text.slice(0, 400) || `backend ${status}`,
    }
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pathId: string }> },
) {
  const { pathId } = await params
  if (!pathId) {
    return backendError({
      status: 400,
      message: "missing_path_id",
      detail: "pathId path segment is required",
    })
  }

  // AP201 Rev 6 Day 4.3: the tenant / account claims travel with the read (an install with several workload
  // accounts needs the account named) and the cache is keyed by them.
  const upstream = new URLSearchParams()
  const claimsKey = forwardScopeClaims(req.nextUrl.searchParams, upstream)
  const query = upstream.toString()
  const cacheKey = `attack-path-report:${pathId}:${claimsKey}`
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    })
  }

  try {
    const t0 = Date.now()
    const res = await fetch(
      `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(pathId)}/report${query ? `?${query}` : ""}`,
      { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(55_000) },
    )
    console.log(
      `[attack-path-report proxy] status=${res.status} latency_ms=${Date.now() - t0} path=${pathId.slice(0, 32)}`,
    )
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      // A typed answer from the server (a held route, a refused or unavailable read, a scope refusal) is passed
      // through with its own status and body, never cached and never relabelled as an outage.
      let typed: unknown = null
      try { typed = JSON.parse(text) } catch { typed = null }
      const typedCode = (typed as { detail?: { code?: unknown } } | null)?.detail?.code
      if (isTypedSemanticRefusal(typed) || (res.status < 500 && typeof typedCode === "string")) {
        return NextResponse.json(typed, { status: res.status, headers: { "Cache-Control": "no-store", "X-Cache": "BYPASS-TYPED" } })
      }
      const { code, detail } = parseBackendErrorBody(text, res.status)
      return reportError(
        pathId,
        code,
        detail,
        res.status === 404 ? 404 : 502,
        res.status,
      )
    }
    const data = await res.json()
    // A 200 hold (semantic_status not_recorded / unavailable) and a report served marked stale are status answers
    // about right now: passed through no-store, never cached or shared.
    if (isSemanticHoldPayload(data) || (data && typeof data === "object" && (data as { fromStaleCache?: unknown }).fromStaleCache === true)) {
      return NextResponse.json(data, { headers: { "Cache-Control": "no-store", "X-Cache": "BYPASS-HOLD" } })
    }
    setCached(cacheKey, data, TTL_STD)
    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    })
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError"
    if (isTimeout) {
      return reportError(pathId, "REPORT_TIMEOUT", e?.message ?? "Backend request timed out", 504)
    }
    return fromCaughtError(err)
  }
}
