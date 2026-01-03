import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const systemName = searchParams.get("system_name") || "alon-prod"
  
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 28000)
  
  try {
    const res = await fetch(`${BACKEND_URL}/api/impact-analysis/resources?system_name=${systemName}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store"
    })
    
    clearTimeout(timeoutId)
    
    if (!res.ok) {
      // Return empty fallback on backend error
      return NextResponse.json({ 
        resources: [], 
        count: 0, 
        error: true,
        message: `Backend returned ${res.status}`
      }, { status: 200 })
    }
    
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    clearTimeout(timeoutId)
    console.error("Impact analysis resources error:", error.message)
    
    // Return empty fallback on timeout or error
    return NextResponse.json({ 
      resources: [], 
      count: 0, 
      timeout: error.name === 'AbortError',
      error: true,
      message: error.name === 'AbortError' ? 'Request timed out' : error.message
    }, { status: 200 })
  }
}
