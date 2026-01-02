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
    return NextResponse.json({ error: "Missing sgId parameter" }, { status: 400 })
  }
  
  const backendUrl = `${BACKEND_URL}/api/security-groups/${sgId}/gap-analysis`
  console.log(`[SG Gap Analysis] Fetching: ${backendUrl}`)
  
  try {
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
      return NextResponse.json({ error: "Backend error", status: res.status, details: errorText }, { status: res.status })
    }
    
    const data = await res.json()
    console.log(`[SG Gap Analysis] Success: ${data.sg_name}, ${data.rules_analysis?.length || 0} rules`)
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[SG Gap Analysis] Error:", error.message)
    return NextResponse.json({ error: error.message, backendUrl }, { status: 500 })
  }
}
