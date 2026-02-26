import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sg_id = searchParams.get('sg_id')
    const limit = searchParams.get('limit') || '50'

    const params = new URLSearchParams()
    if (sg_id) params.append('sg_id', sg_id)
    params.append('limit', limit)

    // Fetch all snapshot sources in parallel
    const [sgResponse, checkpointsResponse, sgLpResponse, unifiedSnapshotsResponse] = await Promise.all([
      // Security Group snapshots (old endpoint)
      fetch(`${BACKEND_URL}/api/remediation/snapshots?${params.toString()}`, {
        headers: { "Accept": "application/json" },
        cache: "no-store",
      }).catch(() => null),

      // S3 Bucket checkpoints
      fetch(`${BACKEND_URL}/api/s3-remediation/checkpoints?limit=${limit}`, {
        headers: { "Accept": "application/json" },
        cache: "no-store",
      }).catch(() => null),

      // SG LP snapshots (new endpoint)
      fetch(`${BACKEND_URL}/api/sg-least-privilege/snapshots/all?limit=${limit}`, {
        headers: { "Accept": "application/json" },
        cache: "no-store",
      }).catch(() => null),

      // Unified snapshots (IAM remediation with SNAP-* format)
      fetch(`${BACKEND_URL}/api/snapshots?limit=${limit}`, {
        headers: { "Accept": "application/json" },
        cache: "no-store",
      }).catch(() => null)
    ])

    let allSnapshots: any[] = []

    // Process SG snapshots
    if (sgResponse?.ok) {
      const sgData = await sgResponse.json()
      const sgSnapshots = Array.isArray(sgData) ? sgData : (sgData.snapshots || [])
      allSnapshots.push(...sgSnapshots)
      console.log("[proxy] SG snapshots:", sgSnapshots.length)
    }

    // Process S3 checkpoints and transform to snapshot format
    if (checkpointsResponse?.ok) {
      const checkpointsData = await checkpointsResponse.json()
      const checkpoints = checkpointsData.checkpoints || []

      // Transform checkpoints to match snapshot format
      const transformedCheckpoints = checkpoints.map((cp: any) => ({
        snapshot_id: cp.checkpoint_id,
        id: cp.checkpoint_id,
        finding_id: cp.resource_id,
        issue_id: cp.checkpoint_id,
        resource_type: cp.resource_type,
        created_at: cp.timestamp,
        created_by: 'system',
        reason: 'Pre-remediation checkpoint',
        status: cp.status === 'ROLLED_BACK' ? 'RESTORED' : 'ACTIVE',
        system_name: cp.resource_id,
        current_state: {
          resource_name: cp.resource_id,
          role_name: cp.resource_type === 'IAMRole' ? cp.resource_id : undefined,
          checkpoint_type: cp.resource_type || 'S3Bucket'
        }
      }))

      allSnapshots.push(...transformedCheckpoints)
      console.log("[proxy] S3 checkpoints:", transformedCheckpoints.length)
    }

    // Process SG LP snapshots (new system)
    if (sgLpResponse?.ok) {
      const sgLpData = await sgLpResponse.json()
      const sgLpSnapshots = sgLpData.snapshots || []

      // Transform to match snapshot format
      const transformedSgLp = sgLpSnapshots.map((snap: any) => ({
        snapshot_id: snap.snapshot_id,
        id: snap.snapshot_id,
        sg_id: snap.sg_id,
        sg_name: snap.sg_name,
        finding_id: snap.sg_id,
        resource_type: 'SecurityGroup',
        created_at: snap.created_at || snap.timestamp,
        timestamp: snap.created_at || snap.timestamp,
        created_by: snap.created_by || 'sg-lp-engine',
        reason: snap.reason || 'Pre-remediation snapshot',
        status: snap.status || 'ACTIVE',
        rules_count: snap.rules_count,
        current_state: {
          sg_name: snap.sg_name,
          checkpoint_type: 'SecurityGroup'
        }
      }))

      allSnapshots.push(...transformedSgLp)
      console.log("[proxy] SG LP snapshots:", transformedSgLp.length)
    }

    // Process unified snapshots (IAM remediation with SNAP-* format)
    if (unifiedSnapshotsResponse?.ok) {
      const unifiedData = await unifiedSnapshotsResponse.json()
      const unifiedSnapshots = unifiedData.snapshots || []

      // Transform to match snapshot format and filter out duplicates
      const transformedUnified = unifiedSnapshots
        .filter((snap: any) => snap.snapshot_id?.startsWith('SNAP-'))
        .map((snap: any) => ({
          snapshot_id: snap.snapshot_id,
          id: snap.snapshot_id,
          finding_id: snap.original_role || snap.resource_id,
          issue_id: snap.snapshot_id,
          resource_type: snap.resource_type || 'IAM',
          snapshot_type: snap.snapshot_type || 'IAM_REMEDIATION',
          created_at: snap.created_at,
          timestamp: snap.created_at,
          created_by: 'iam-remediation-engine',
          reason: 'IAM remediation snapshot',
          status: 'ACTIVE',
          original_role: snap.original_role,
          new_role: snap.new_role,
          current_state: {
            role_name: snap.original_role,
            resource_name: snap.original_role,
            checkpoint_type: 'IAMRole'
          }
        }))

      allSnapshots.push(...transformedUnified)
      console.log("[proxy] Unified IAM snapshots:", transformedUnified.length)
    }

    // Sort by created_at descending (newest first)
    allSnapshots.sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime()
      const dateB = new Date(b.created_at || 0).getTime()
      return dateB - dateA
    })

    console.log("[proxy] total snapshots:", allSnapshots.length)

    return NextResponse.json({
      snapshots: allSnapshots,
      total: allSnapshots.length
    }, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error: any) {
    console.error("[proxy] snapshots error:", error)
    return NextResponse.json({ snapshots: [], total: 0 }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log("[proxy] create snapshot for SG:", body.sg_id)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    const response = await fetch(`${BACKEND_URL}/api/remediation/snapshot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[proxy] create snapshot error " + response.status + ": " + errorText)
      return NextResponse.json({ error: "Failed to create snapshot" }, { status: response.status })
    }

    const data = await response.json()
    console.log("[proxy] snapshot created:", data.snapshot_id)

    return NextResponse.json(data, { status: 200 })
  } catch (error: any) {
    console.error("[proxy] create snapshot error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
