import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const systemName = searchParams.get("system_name") || "alon-prod"
  
  try {
    const res = await fetch(`${BACKEND_URL}/api/impact-analysis/resources?system_name=${systemName}`, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    })
    
    if (!res.ok) {
      return NextResponse.json({ error: "Backend error", status: res.status }, { status: res.status })
    }
    
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("Impact analysis resources error:", error.message)
    return NextResponse.json({ error: error.message, resources: [], count: 0 }, { status: 500 })
  }
}
