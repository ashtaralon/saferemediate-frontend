import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"
  const resourceType = url.searchParams.get("resourceType")
  
  try {
    let backendUrl = `${BACKEND_URL}/api/impact-analysis/resources?systemName=${systemName}`
    if (resourceType) {
      backendUrl += `&resource_type=${encodeURIComponent(resourceType)}`
    }
    
    const res = await fetch(backendUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    })
    
    if (!res.ok) {
      return NextResponse.json({ error: "Backend error", status: res.status }, { status: res.status })
    }
    
    return NextResponse.json(await res.json())
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

