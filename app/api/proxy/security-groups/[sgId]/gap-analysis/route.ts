import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest, { params }: { params: { sgId: string } }) {
  const sgId = params.sgId
  
  try {
    const res = await fetch(`${BACKEND_URL}/api/security-groups/${sgId}/gap-analysis`, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    })
    
    if (!res.ok) {
      return NextResponse.json({ error: "Backend error" }, { status: res.status })
    }
    
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("SG gap-analysis error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
