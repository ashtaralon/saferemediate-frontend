import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

// =============================================================================
// Permission-cut plan proxy —
//   POST /api/proxy/attack-paths/<system>/permission-cut-plan
//        ?jewel_ref=&role_arn=&jewel_type=
//
// PLAN ONLY. The backend proposes and never mutates; `execute_available` is
// always false. This forwards one operator-initiated request for one (role,
// jewel) pair — it is NOT called while rendering a list. That distinction is
// load-bearing: the backend re-derives the band and resolves carrier policies
// per call, so firing it per row on a browse surface would be the same mistake
// api/trust_narrow_routes.py records having made and reverted.
//
// DELIBERATELY UNCACHED. Every other proxy here caches, and this one must not:
// the plan re-derives the CUTTABLE band at request time precisely because a
// panel can sit open while a role starts using the jewel. Serving a 60-second-
// old plan would hand an operator a cut that was already invalidated — the exact
// staleness the backend re-derivation exists to close.
//
// NO MOCK: a backend failure returns an honest error envelope. An empty or
// fabricated plan would read as "nothing to cut here", which is reassuring and
// wrong.
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
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const jewelRef = req.nextUrl.searchParams.get("jewel_ref")
  const roleArn = req.nextUrl.searchParams.get("role_arn")
  const jewelType = req.nextUrl.searchParams.get("jewel_type") ?? "S3Bucket"

  if (!systemName || !jewelRef || !roleArn) {
    return NextResponse.json<ProxyError>(
      {
        error: "missing_params",
        detail: "systemName, jewel_ref and role_arn are required",
      },
      { status: 400 },
    )
  }

  try {
    const t0 = Date.now()
    const url =
      `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}/permission-cut/plan` +
      `?jewel_ref=${encodeURIComponent(jewelRef)}` +
      `&role_arn=${encodeURIComponent(roleArn)}` +
      `&jewel_type=${encodeURIComponent(jewelType)}`

    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    })
    console.log(
      `[permission-cut-plan proxy] status=${res.status} latency_ms=${Date.now() - t0} ` +
        `system=${systemName} jewel=${jewelRef.slice(0, 40)} role=${roleArn.slice(-40)}`,
    )

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return NextResponse.json<ProxyError>(
        {
          error: "permission_cut_plan_unavailable",
          detail: `backend ${res.status} ${text.slice(0, 300)}`,
        },
        { status: res.status === 404 ? 404 : 502 },
      )
    }

    // Passed through verbatim, including `allowed: false` with a refusal set.
    // That is a NORMAL answer — the guards refusing is the product working, not
    // an error — so it must not be remapped to an error envelope on the way out.
    return NextResponse.json(await res.json(), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError"
    return NextResponse.json<ProxyError>(
      {
        error: isTimeout
          ? "permission_cut_plan_timeout"
          : "permission_cut_plan_proxy_error",
        detail: e?.message ?? String(err),
      },
      { status: 502 },
    )
  }
}
