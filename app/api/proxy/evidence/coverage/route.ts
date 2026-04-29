import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()

/**
 * GET /api/proxy/evidence/coverage
 *
 * Two modes:
 *   1. ?account_id=X — proxy direct to backend /api/evidence/coverage
 *   2. (no query)    — fan out across /api/accounts, aggregate per-account
 *                      health into an org-wide rollup
 *
 * Honesty contract:
 *   - aggregate_confidence is min across accounts (weakest-link), matching
 *     the backend's per-account aggregation
 *   - If any account fan-out fails, surface it in `errors[]` rather than
 *     silently dropping
 *   - Empty accounts list → return zeros + an explicit "no accounts" flag
 *     so the UI can render an honest empty state, not a fake 100%
 */
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id")

  // Mode 1: direct passthrough for a specific account
  if (accountId) {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/evidence/coverage?account_id=${encodeURIComponent(accountId)}`,
        { headers: { "Content-Type": "application/json" }, cache: "no-store" },
      )
      if (!res.ok) {
        return NextResponse.json(
          { error: "coverage_endpoint_unavailable", backend_status: res.status },
          { status: 502 },
        )
      }
      return NextResponse.json(await res.json())
    } catch (e) {
      return NextResponse.json(
        { error: "coverage_proxy_error", message: e instanceof Error ? e.message : String(e) },
        { status: 502 },
      )
    }
  }

  // Mode 2: org-wide fan-out
  const cacheKey = "evidence-coverage-orgwide"
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }
  try {
    const acctsRes = await fetch(`${BACKEND_URL}/api/accounts`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })
    if (!acctsRes.ok) {
      return NextResponse.json(
        { error: "accounts_endpoint_unavailable", backend_status: acctsRes.status },
        { status: 502 },
      )
    }
    const acctsData = await acctsRes.json()
    const accounts: Array<{ cloud: string; account_id: string; source_count: number }> =
      Array.isArray(acctsData?.accounts) ? acctsData.accounts : []

    if (accounts.length === 0) {
      return NextResponse.json({
        no_accounts: true,
        message:
          "No SignalSource accounts in graph. Backend collectors / evidence-audit scheduler have not populated data yet.",
        accounts: [],
        aggregate_confidence: 0,
        health: { healthy: 0, degraded: 0, missing: 0, total: 0 },
      })
    }

    const perAccount = await Promise.allSettled(
      accounts.map(async (a) => {
        const r = await fetch(
          `${BACKEND_URL}/api/evidence/coverage?account_id=${encodeURIComponent(a.account_id)}&cloud=${encodeURIComponent(a.cloud)}`,
          { headers: { "Content-Type": "application/json" }, cache: "no-store" },
        )
        if (!r.ok) throw new Error(`backend ${r.status} for ${a.account_id}`)
        const data = await r.json()
        return { account_id: a.account_id, cloud: a.cloud, ...data }
      }),
    )

    const fulfilled = perAccount
      .filter((p): p is PromiseFulfilledResult<any> => p.status === "fulfilled")
      .map((p) => p.value)
    const errors = perAccount
      .filter((p): p is PromiseRejectedResult => p.status === "rejected")
      .map((p) => String(p.reason))

    const aggregate_confidence =
      fulfilled.length === 0
        ? 0
        : Math.min(...fulfilled.map((f) => Number(f.aggregate_confidence) || 0))

    const health = fulfilled.reduce(
      (acc, f) => ({
        healthy: acc.healthy + (f.health?.healthy || 0),
        degraded: acc.degraded + (f.health?.degraded || 0),
        missing: acc.missing + (f.health?.missing || 0),
        total: acc.total + (f.health?.total || 0),
      }),
      { healthy: 0, degraded: 0, missing: 0, total: 0 },
    )

    const payload = {
      accounts: fulfilled,
      aggregate_confidence,
      health,
      errors,
    }
    setCached(cacheKey, payload, TTL_STD)
    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } })
  } catch (e) {
    return NextResponse.json(
      { error: "coverage_fanout_error", message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }
}
