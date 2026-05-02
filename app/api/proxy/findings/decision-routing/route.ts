import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()

// 60s budget — UnifiedScorer makes per-resource graph calls inside its
// component functions; cold-start scoring of 30 findings can take 25-30s.
// Backend has its own 5min process cache, so warm hits return instantly.
export const maxDuration = 60

/**
 * GET /api/proxy/findings/decision-routing?limit=30
 *
 * Decision-routing aggregator passthrough. Backend buckets findings by
 * (family × DecisionOutcome) using the canonical UnifiedConfidenceScorer
 * — same matrix that gates real AWS mutations. See backend
 * api/findings_decision_routing.py for design rationale.
 *
 * Replaced the home-dashboard NotWiredCard for "Decision routing per
 * family" (gap #1 from the dashboard audit).
 */
export async function GET(req: NextRequest) {
  const limit = req.nextUrl.searchParams.get("limit") || "30"
  // system_name (optional) — when present, scopes the verdict aggregation
  // to a single system. Used by the System Detail page; org-wide aggregate
  // (no system_name) is used by the home dashboard.
  const systemName = req.nextUrl.searchParams.get("system_name") || ""
  const cacheKey = systemName
    ? `decision-routing-${limit}-sys-${systemName}`
    : `decision-routing-${limit}`
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }
  const backendQs = systemName
    ? `limit=${encodeURIComponent(limit)}&system_name=${encodeURIComponent(systemName)}`
    : `limit=${encodeURIComponent(limit)}`
  try {
    const r = await fetch(
      `${BACKEND_URL}/api/findings/decision-routing?${backendQs}`,
      {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(55000),
      },
    )
    if (!r.ok) {
      return NextResponse.json(
        {
          error: "decision_routing_unavailable",
          backend_status: r.status,
          total_findings: 0,
          scored_count: 0,
          unscored_count: 0,
          unmapped_findings: 0,
          score_failures: 0,
          limit: Number(limit),
          by_family: {},
          by_decision_total: {},
          supported_families: ["permissions", "network", "data"],
        },
        { status: 502 },
      )
    }
    const data = await r.json()
    setCached(cacheKey, data, TTL_SLOW)
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
  } catch (e) {
    return NextResponse.json(
      {
        error: "decision_routing_proxy_error",
        message: e instanceof Error ? e.message : String(e),
        total_findings: 0,
        scored_count: 0,
        unscored_count: 0,
        unmapped_findings: 0,
        score_failures: 0,
        limit: Number(limit),
        by_family: {},
        by_decision_total: {},
        supported_families: ["permissions", "network", "data"],
      },
      { status: 502 },
    )
  }
}
