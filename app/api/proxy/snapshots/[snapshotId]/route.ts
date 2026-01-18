import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  const { snapshotId } = await params

  try {
    console.log("[proxy] get snapshot:", snapshotId)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(
      `${BACKEND_URL}/api/remediation/snapshots/${snapshotId}`,
      {
        headers: { "Accept": "application/json" },
        cache: "no-store",
        signal: controller.signal,
      }
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[proxy] get snapshot error " + response.status + ": " + errorText)
      return NextResponse.json({ error: "Snapshot not found" }, { status: response.status })
    }

    const data = await response.json()
    console.log("[proxy] snapshot retrieved:", data.snapshot_id)

    return NextResponse.json(data, { status: 200 })
  } catch (error: any) {
    console.error("[proxy] get snapshot error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  const { snapshotId } = await params

  try {
    console.log("[proxy] delete snapshot:", snapshotId)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    // Detect snapshot type by ID prefix and route to correct endpoint
    let endpoint: string
    if (snapshotId.startsWith('S3Bucket-') || snapshotId.startsWith('s3-policy-')) {
      // S3 bucket checkpoints
      endpoint = `${BACKEND_URL}/api/s3-remediation/checkpoints/${snapshotId}`
    } else if (snapshotId.startsWith('sg-snap-')) {
      // SG LP snapshots (new system)
      endpoint = `${BACKEND_URL}/api/sg-least-privilege/snapshots/${snapshotId}`
    } else {
      // Default to old SG remediation endpoint
      endpoint = `${BACKEND_URL}/api/remediation/snapshots/${snapshotId}`
    }

    console.log("[proxy] delete endpoint:", endpoint)

    const response = await fetch(endpoint, {
      method: "DELETE",
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[proxy] delete snapshot error " + response.status + ": " + errorText)
      return NextResponse.json({ error: "Failed to delete snapshot" }, { status: response.status })
    }

    const data = await response.json()
    console.log("[proxy] snapshot deleted:", snapshotId)

    return NextResponse.json({ success: true, deleted: snapshotId, ...data }, { status: 200 })
  } catch (error: any) {
    console.error("[proxy] delete snapshot error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
