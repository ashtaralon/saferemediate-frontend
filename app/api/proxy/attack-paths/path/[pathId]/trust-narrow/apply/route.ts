import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

// =============================================================================
// TRUST_NARROW apply proxy —
//   POST /api/proxy/attack-paths/path/<pathId>/trust-narrow/apply
//
// Forwards the signed plan_token to the backend, which re-verifies it, re-runs
// guards G1–G7 against live evidence, and drives one RemediationChange through
// UnifiedPipeline (snapshot → preflight → apply → validate → auto-rollback).
// Nothing here decides anything: every refusal is the backend's.
//
// Apply is refused with 403 `trust_narrow_apply_disabled` unless the deploy
// sets CYNTRO_TRUST_NARROW_APPLY_ENABLED. That is the expected state today —
// the feature ships in SHADOW — and it is forwarded verbatim so the panel can
// explain it rather than showing a generic failure.
//
// FR8 — the post-apply refresh runs HERE, server-side, on success. Without it
// the acquisition chip keeps rendering from the cached IAP snapshot for up to
// 600s and the operator reasonably concludes the cut did not work. Doing it in
// the proxy rather than the browser keeps the admin endpoints behind the same
// server boundary as every other backend call in this app.
//
// A refresh failure NEVER fails the apply. The mutation already happened;
// reporting it accurately is what matters, so the outcome of each refresh call
// is attached to the response and the panel says so plainly.
// =============================================================================

export const runtime = "nodejs"
export const maxDuration = 120

const BACKEND_URL = getBackendBaseUrl()

interface ProxyError {
  error: string
  detail?: string
}

async function fireRefresh(system: string | null): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const calls: Array<[string, string]> = [
    [
      "classifier",
      `${BACKEND_URL}/api/admin/classifiers/initial-access?system=${encodeURIComponent(system ?? "")}&apply=true`,
    ],
    [
      "iap_cache",
      `${BACKEND_URL}/api/admin/iap-cache/invalidate?reason=trust_narrow`,
    ],
  ]
  for (const [name, url] of calls) {
    // The classifier is scoped by system; without one it would run fleet-wide,
    // which is the slow path and not what a single-role cut asked for.
    if (name === "classifier" && !system) {
      out[name] = "skipped: no system on the apply response"
      continue
    }
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(50_000),
      })
      out[name] = r.ok ? "ok" : `backend ${r.status}`
    } catch (err: unknown) {
      out[name] = `error: ${(err as Error)?.message ?? String(err)}`
    }
  }
  return out
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

  const body = await req.json().catch(() => null)
  if (!body?.plan_token) {
    return NextResponse.json<ProxyError>(
      { error: "missing_plan_token", detail: "plan_token is required to apply" },
      { status: 400 },
    )
  }

  try {
    const t0 = Date.now()
    const res = await fetch(
      `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(pathId)}/trust-narrow/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(110_000),
      },
    )
    console.log(
      `[trust-narrow/apply proxy] status=${res.status} latency_ms=${Date.now() - t0} path=${pathId.slice(0, 32)}`,
    )
    const data = await res.json().catch(() => null)

    if (!res.ok) {
      // Forward the backend's own refusal shape (403 tier gate, 400 token
      // problems, 409 drift / guards-refused-at-apply). The panel renders the
      // reason; flattening these into one error would throw away the only
      // information the operator can act on.
      return NextResponse.json(
        { error: "trust_narrow_apply_refused", status: res.status, detail: data?.detail ?? data },
        { status: res.status },
      )
    }

    const refresh = data?.applied === true
      ? await fireRefresh(typeof data?.system === "string" ? data.system : null)
      : { skipped: "apply did not report success" }

    return NextResponse.json({ ...data, refresh }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError"
    // A timeout here is genuinely ambiguous: the mutation may have landed.
    // Say so — telling the operator it failed would be a guess.
    return NextResponse.json<ProxyError>(
      {
        error: isTimeout ? "trust_narrow_apply_timeout" : "trust_narrow_apply_proxy_error",
        detail: isTimeout
          ? "the apply request timed out; the change may or may not have been " +
            "applied — re-run plan to see the role's current trust policy " +
            `before retrying (${e?.message ?? ""})`
          : (e?.message ?? String(err)),
      },
      { status: 502 },
    )
  }
}
