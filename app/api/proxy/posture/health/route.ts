import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 30

/**
 * Posture Health Check Proxy
 * 
 * Checks which engines and data sources are connected:
 * - neo4j: Graph database
 * - lp_engine: StatefulLeastPrivilegeEngine
 * - sg_engine: SGGapEngine
 */
export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/posture/health`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
    
    if (!res.ok) {
      return NextResponse.json(
        { error: "Backend error", status: res.status }, 
        { status: res.status }
      )
    }
    
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[posture-health] Error:", error)
    return NextResponse.json(
      { error: "Failed to check posture health", details: String(error) },
      { status: 500 }
    )
  }
}
