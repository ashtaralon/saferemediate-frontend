import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 30

export async function GET(
  req: NextRequest, 
  context: { params: Promise<{ resourceId: string }> }
) {
  const { resourceId } = await context.params
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"
  const depth = url.searchParams.get("depth") ?? "3"
  
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/impact-analysis/blast-radius/${encodeURIComponent(resourceId)}?systemName=${systemName}&depth=${depth}`,
      { headers: { Accept: "application/json" }, cache: "no-store" }
    )
    
    if (!res.ok) {
      return NextResponse.json({ error: "Backend error", status: res.status }, { status: res.status })
    }
    
    return NextResponse.json(await res.json())
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}


