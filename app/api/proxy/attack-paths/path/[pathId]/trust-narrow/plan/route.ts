import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

// =============================================================================
// TRUST_NARROW plan proxy —
//   POST /api/proxy/attack-paths/path/<pathId>/trust-narrow/plan
// (static "path" segment avoids the [pathId] vs [systemName] slug clash, same
// as the closure-preview proxy next door)
//
// DELIBERATELY UNCACHED, unlike closure-preview. The backend authors this plan
// against a live iam:GetRole and binds it to that document's hash; a cached
// plan would hand the operator a token bound to a policy that has since
// changed. Apply would then DRIFT_ABORT — the safe outcome, but the operator
// would have been shown a plan that was never applicable. Freshness here is
// part of the safety contract, not a performance knob.
//
// A refused plan (`allowed: false` with a populated `guards[]`) is a normal 200
// carrying the refusal set. It is the useful answer, not an error.
// =============================================================================

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

interface ProxyError {
  error: string
  detail?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pathId: string }> },
) {
  const { pathId } = await params
  if (!pathId) {
    return NextResponse.json<ProxyError>(
      { error: "missing_path_id", detail: "pathId path segment is required" },
      { status: 400 },
    )
  }

  const body = await req.json().catch(() => ({}))

  try {
    const t0 = Date.now()
    const res = await fetch(
      `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(pathId)}/trust-narrow/plan`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body ?? {}),
        cache: "no-store",
        signal: AbortSignal.timeout(55_000),
      },
    )
    console.log(
      `[trust-narrow/plan proxy] status=${res.status} latency_ms=${Date.now() - t0} path=${pathId.slice(0, 32)}`,
    )
    // Read as TEXT first, then try to parse. An unhandled backend exception
    // comes back as FastAPI's plain "Internal Server Error", which `res.json()`
    // rejects on — leaving nothing to show. Going text-first means the operator
    // always gets the body that actually came back rather than an empty string
    // in exactly the case where they most need to know what happened.
    const raw = await res.text()
    let data: unknown = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }
    if (!res.ok) {
      const d = (data as { detail?: unknown } | null)?.detail
      return NextResponse.json<ProxyError>(
        {
          error: "trust_narrow_plan_unavailable",
          detail:
            typeof d === "string" && d
              ? d
              : d
                ? JSON.stringify(d).slice(0, 400)
                : `backend ${res.status}: ${raw.slice(0, 300) || "(empty body)"}`,
        },
        { status: res.status === 404 ? 404 : res.status === 503 ? 503 : 502 },
      )
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError"
    return NextResponse.json<ProxyError>(
      {
        error: isTimeout ? "trust_narrow_plan_timeout" : "trust_narrow_plan_proxy_error",
        detail: e?.message ?? String(err),
      },
      { status: 502 },
    )
  }
}
