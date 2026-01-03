import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 30

export async function GET(
  req: NextRequest, 
  context: { params: Promise<{ sgId: string }> }
) {
  // In Next.js 15, params is a Promise
  const { sgId } = await context.params
  
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
  
  const backendUrl = `${BACKEND_URL}/api/security-groups/${sgId}/gap-analysis`
  console.log(`[SG Gap Analysis] Fetching: ${backendUrl}`)
  
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 25000)
  
  try {
    const res = await fetch(backendUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[SG Gap Analysis] Backend error ${res.status}: ${errorText}`)
      // Return empty fallback on backend error
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
    console.log(`[SG Gap Analysis] Success: ${data.sg_name}, ${data.rules_analysis?.length || 0} rules`)
    return NextResponse.json(data)
  } catch (error: any) {
    clearTimeout(timeoutId)
    console.error("[SG Gap Analysis] Error:", error.message)
    
    // Return empty fallback on timeout or error
    return NextResponse.json({ 
      sg_id: sgId,
      sg_name: sgId,
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
