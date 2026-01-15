import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 30
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest, 
  context: { params: Promise<{ sgId: string }> | { sgId: string } }
) {
  try {
    // Handle both Next.js 14 (sync) and Next.js 15 (async) params
    let sgId: string
    if (context.params instanceof Promise) {
      const resolvedParams = await context.params
      sgId = resolvedParams.sgId
    } else {
      sgId = (context.params as { sgId: string }).sgId
    }
    
    if (!sgId) {
      return NextResponse.json({ 
        sg_id: "",
        sg_name: "Unknown",
        rules_analysis: [],
        used_rules: 0,
        unused_rules: 0,
        total_rules: 0,
        error: true,
        message: "Missing sgId parameter" 
      }, { status: 200 })
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
      const errorText = await res.text()
      console.error(`[SG Gap Analysis] Backend error ${res.status}: ${errorText}`)
      return NextResponse.json({
        sg_id: sgId,
        sg_name: sgId,
        rules_analysis: [],
        used_rules: 0,
        unused_rules: 0,
        total_rules: 0,
        error: true,
        message: `Backend error: ${res.status}`
      }, { status: 200 })
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
  } catch (error: any) {
    console.error("[SG Gap Analysis] Error:", error.message)
    
    return NextResponse.json({ 
      sg_id: "unknown",
      sg_name: "Unknown",
      rules_analysis: [],
      used_rules: 0,
      unused_rules: 0,
      total_rules: 0,
      timeout: error.name === 'AbortError',
      error: true,
      message: error.name === 'AbortError' ? 'Request timed out' : error.message
    }, { status: 200 })
  }
}
