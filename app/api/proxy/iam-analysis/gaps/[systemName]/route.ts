import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 60

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ systemName: string }> }
) {
  const { systemName } = await context.params
  
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/iam-analysis/gaps/${systemName}`,
      {
        headers: { 
          Accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        cache: "no-store",
      }
    )
    
    if (!res.ok) {
      console.error(`IAM gaps backend error: ${res.status}`)
      return NextResponse.json({ 
        gaps: [], 
        error: "Backend error",
        total_roles: 0,
        overall_usage_percent: 0
      })
    }
    
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("IAM gaps proxy error:", error.message)
    return NextResponse.json({ 
      gaps: [], 
      error: error.message,
      total_roles: 0,
      overall_usage_percent: 0
    })
  }
}
