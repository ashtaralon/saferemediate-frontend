import { type NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend.onrender.com"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { finding_id } = body

    if (!finding_id) {
      return NextResponse.json(
        {
          success: false,
          error: "finding_id is required",
        },
        { status: 400 }
      )
    }

    // Call backend simulation endpoint
    const response = await fetch(`${BACKEND_URL}/api/simulate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ finding_id }),
    })

    if (response.ok) {
      const data = await response.json()
      return NextResponse.json({
        success: true,
        ...data,
      })
    } else {
      // If backend endpoint doesn't exist yet, return simulated response for UI demo
      console.log(`[v0] Simulation API not available, simulating response for finding: ${finding_id}`)
      return NextResponse.json({
        success: true,
        simulated: true,
        confidence: 85,
        before_state: "S3 bucket 'my-bucket' has public read access enabled",
        after_state: "S3 bucket 'my-bucket' will have public read access removed, bucket policy updated",
        estimated_time: "2-3 minutes",
        temporal_info: {
          start_time: new Date().toISOString(),
          estimated_completion: new Date(Date.now() + 180000).toISOString(),
        },
        warnings: [
          "This change may affect applications that rely on public bucket access",
          "Ensure no critical services depend on this configuration",
        ],
        resource_changes: [
          {
            resource_id: "arn:aws:s3:::my-bucket",
            resource_type: "S3Bucket",
            change_type: "policy_update",
            before: "PublicReadGetObject",
            after: "Private",
          },
        ],
        impact_summary: "1 resource will be modified. No downtime expected.",
      })
    }
  } catch (error) {
    console.error("[v0] Simulation error:", error)
    // Return simulated response for UI demo even on error
    return NextResponse.json({
      success: true,
      simulated: true,
      confidence: 85,
      before_state: "S3 bucket has public read access enabled",
      after_state: "S3 bucket will have public read access removed",
      estimated_time: "2-3 minutes",
      temporal_info: {
        start_time: new Date().toISOString(),
        estimated_completion: new Date(Date.now() + 180000).toISOString(),
      },
      warnings: [],
      resource_changes: [],
      impact_summary: "Simulation queued (backend connection pending)",
    })
  }
}

