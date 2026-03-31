import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let snapshotId = body.checkpoint_id || body.snapshot_id;

    console.log(`[IAM-ROLLBACK] Rolling back: ${snapshotId || '(lookup by role)'}`);
    console.log(`[IAM-ROLLBACK] Role name: ${body.role_name || '(from snapshot)'}`);

    // If no snapshot ID but we have role_name, look up the latest snapshot
    if (!snapshotId && body.role_name) {
      console.log(`[IAM-ROLLBACK] Looking up snapshot for role: ${body.role_name}`);
      const snapRes = await fetch(`${BACKEND_URL}/api/snapshots?role_name=${encodeURIComponent(body.role_name)}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (snapRes.ok) {
        const snapData = await snapRes.json();
        const snapshots = snapData.snapshots || [];
        // Find the latest rollback-available snapshot for this role
        const match = snapshots.find((s: any) =>
          s.rollback_available &&
          (s.original_role === body.role_name || s.resource_id === body.role_name)
        );
        if (match) {
          snapshotId = match.snapshot_id;
          console.log(`[IAM-ROLLBACK] Found snapshot: ${snapshotId}`);
        } else {
          console.error(`[IAM-ROLLBACK] No rollback-available snapshot found for ${body.role_name}`);
          return NextResponse.json(
            { detail: `No rollback-available snapshot found for ${body.role_name}` },
            { status: 404 }
          );
        }
      }
    }

    let response;

    // Use unified snapshots endpoint for SNAP-* IDs (new IAM remediation format)
    if (snapshotId && snapshotId.startsWith('SNAP-')) {
      console.log(`[IAM-ROLLBACK] Using snapshots rollback endpoint`);
      response = await fetch(`${BACKEND_URL}/api/snapshots/${encodeURIComponent(snapshotId)}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (snapshotId) {
      // Use remediation rollback with snapshot_id
      console.log(`[IAM-ROLLBACK] Using remediation rollback endpoint`);
      response = await fetch(`${BACKEND_URL}/api/remediation/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot_id: snapshotId })
      });
    } else {
      return NextResponse.json(
        { detail: 'No snapshot_id or role_name provided' },
        { status: 400 }
      );
    }

    const data = await response.json();

    if (!response.ok) {
      console.error(`[IAM-ROLLBACK] Backend error:`, response.status, data);
      return NextResponse.json(
        { detail: data.detail || data.error || 'Rollback failed' },
        { status: response.status }
      );
    }

    console.log(`[IAM-ROLLBACK] Success:`, data);
    return NextResponse.json(data);

  } catch (error: any) {
    console.error(`[IAM-ROLLBACK] Exception:`, error);
    return NextResponse.json(
      { detail: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
