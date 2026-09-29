import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  ERROR_ORIGIN_HEADER,
  allowlistedBackendDetail,
  fromCaughtError,
  reviewProxyStatus,
} from "@/lib/server/proxy-error"

const BACKEND_URL = getBackendBaseUrl()

export const maxDuration = 30
export const dynamic = "force-dynamic"

// Errors carry NO rule counts. Every failure used to be a 200 with
// used_rules / unused_rules / total_rules = 0 and an empty rules_analysis,
// which a caller that checks `res.ok` rendered as a Security Group with zero
// rules. A failure is now the house error shape (lib/server/proxy-error, as
// the LP issues and metrics proxies answer it): a non-2xx status and no
// analysis values.

export async function GET(
  req: NextRequest, 
  context: { params: Promise<{ sgId: string }> }
) {
  try {
    const { sgId } = await context.params
    
    if (!sgId) {
      return NextResponse.json(
        { error: "sgId path parameter is required", origin: "proxy" },
        { status: 400, headers: { "Cache-Control": "no-store", [ERROR_ORIGIN_HEADER]: "proxy" } },
      )
    }
    
    // Use the inspector endpoint which exists on the backend
    const backendUrl = `${BACKEND_URL}/api/security-groups/${sgId}/inspector`
    console.log(`[SG Gap Analysis] Fetching: ${backendUrl}`)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    const res = await fetch(backendUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const raw = await res.text().catch(() => "")
      const detail = allowlistedBackendDetail(raw)
      console.error(`[SG Gap Analysis] Backend ${res.status}: code=${detail?.code ?? "none"}`)
      return NextResponse.json(
        {
          error: `Security group analysis backend returned ${res.status}`,
          ...(detail ? { detail } : {}),
          backendStatus: res.status,
          origin: "backend",
        },
        {
          status: reviewProxyStatus(res.status),
          headers: { "Cache-Control": "no-store", [ERROR_ORIGIN_HEADER]: "backend" },
        },
      )
    }

    const data = await res.json()

    // Transform inspector response to gap-analysis format
    const rulesAnalysis = (data.configured_rules || []).map((r: any) => ({
      source: r.source_cidr || r.source_sg || 'unknown',
      port_range: r.port_display || `${r.from_port}-${r.to_port}`,
      protocol: r.protocol?.toUpperCase() || 'TCP',
      status: r.status?.toUpperCase() || 'UNKNOWN',
      hits: r.flow_count || 0,
      is_public: r.is_public || false,
      description: r.description || '',
    }))

    const result = {
      sg_id: data.sg_id || sgId,
      sg_name: data.sg_name || sgId,
      rules_analysis: rulesAnalysis,
      used_rules: data.summary?.used_rules || 0,
      unused_rules: data.summary?.unused_rules || 0,
      total_rules: data.summary?.total_rules || rulesAnalysis.length,
      eni_count: data.summary?.total_rules || 0,
    }

    console.log(`[SG Gap Analysis] Success: ${result.sg_name}, ${result.rules_analysis.length} rules`)
    return NextResponse.json(result)
  } catch (error: unknown) {
    console.error("[SG Gap Analysis] Error:", error instanceof Error ? error.message : error)
    // AbortError -> 504, anything else -> 503; no analysis values either way.
    const failed = fromCaughtError(error)
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy")
    return failed
  }
}
