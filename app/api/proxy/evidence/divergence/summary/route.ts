import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL = getBackendBaseUrl()

/**
 * GET /api/proxy/evidence/divergence/summary
 *
 * Org-wide CT-vs-AA conflict histogram. Backend already returns this
 * aggregated, no fan-out needed. Pure passthrough.
 *
 * Honest: when there are no SignalSource pairs to compare against,
 * total_conflicts is 0. The card will render an empty/quiet state in
 * that case rather than a false-positive banner.
 */
export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/evidence/divergence/summary`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: "divergence_endpoint_unavailable", backend_status: res.status },
        { status: 502 },
      )
    }
    return NextResponse.json(await res.json())
  } catch (e) {
    return NextResponse.json(
      { error: "divergence_proxy_error", message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }
}
