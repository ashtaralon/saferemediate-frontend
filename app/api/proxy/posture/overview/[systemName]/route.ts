import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

// Increase timeout for Render cold starts
export const maxDuration = 60

/**
 * Unified Posture Overview Proxy
 * 
 * This endpoint returns ALL correlated security posture data in ONE call.
 * Replaces multiple API calls with a single unified response.
 * 
 * Data Sources (when all engines are connected):
 * - Neo4j: Resources, relationships, topology
 * - CloudTrail: IAM actual usage
 * - VPC Flow Logs: SG traffic analysis  
 * - IAM Access Advisor: Service last accessed
 * - Resource Policies: Cross-account access
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ systemName: string }> }
) {
  const { systemName } = await context.params
  const { searchParams } = new URL(req.url)
  const includeDetails = searchParams.get("include_details") === "true"
  
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/posture/overview/${systemName}?include_details=${includeDetails}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }
    )
    
    if (!res.ok) {
      return NextResponse.json(
        { error: "Backend error", status: res.status }, 
        { status: res.status }
      )
    }
    
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[posture-overview] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch posture overview", details: String(error) },
      { status: 500 }
    )
  }
}
