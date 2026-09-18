import { NextRequest, NextResponse } from "next/server";
import { selectBackendProof } from "@/lib/server/backend-proof";
import { getBackendBaseUrl } from "@/lib/server/backend-url";

const BACKEND_URL = getBackendBaseUrl();

/**
 * Customer-resident: the request's own signed operator proof is selected BEFORE any backend call (the shared
 * selection, unchanged), refused by name with no call at all, and only the selected proof header is forwarded.
 * Hosted: unchanged -- the sealed-session gate and the process-wide token writer, and no client identity header.
 */
async function residentRollbackProof(req: NextRequest): Promise<
  { refusal: { status: number; code: string }; headers?: never } | { refusal?: never; headers: Record<string, string> }
> {
  if (process.env.CYNTRO_DEPLOYMENT_MODE !== "CUSTOMER_RESIDENT") return { headers: {} }
  const proof = await selectBackendProof(req)
  if (!proof.ok) return { refusal: { status: proof.status, code: proof.code } }
  return { headers: proof.headers }
}

const ROLLBACK_PROOF_MESSAGES: Record<string, string> = {
  ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE: "The load balancer attached no verified operator identity. Nothing was restored.",
  SITE_SESSION_INVALID: "The site session is missing or invalid. Nothing was restored.",
  DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE: "This deployment's server-to-server credential is not installed. Nothing was restored.",
}

export async function POST(req: NextRequest) {
  // Before ANY backend call, including the snapshot lookup below.
  const proof = await residentRollbackProof(req);
  if (proof.refusal) {
    return NextResponse.json(
      { detail: { code: proof.refusal.code, message: ROLLBACK_PROOF_MESSAGES[proof.refusal.code] ?? "Rollback request refused." },
        origin: "proxy" },
      { status: proof.refusal.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const body = await req.json();
    let snapshotId = body.checkpoint_id || body.snapshot_id;

    console.log(`[IAM-ROLLBACK] Rolling back: ${snapshotId || '(lookup by role)'}`);
    console.log(`[IAM-ROLLBACK] Role name: ${body.role_name || '(from snapshot)'}`);

    // If no snapshot ID but we have role_name, look up the latest snapshot
    if (!snapshotId && body.role_name) {
      console.log(`[IAM-ROLLBACK] Looking up snapshot for role: ${body.role_name}`);
      const snapRes = await fetch(`${BACKEND_URL}/api/snapshots?role_name=${encodeURIComponent(body.role_name)}`, {
        headers: { 'Accept': 'application/json', ...proof.headers }
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
        headers: { 'Content-Type': 'application/json', ...proof.headers }
      });
    } else if (snapshotId) {
      // Legacy IAM checkpoints must use the dedicated IAM rollback endpoint.
      console.log(`[IAM-ROLLBACK] Using dedicated IAM rollback endpoint`);
      response = await fetch(`${BACKEND_URL}/api/iam-roles/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...proof.headers },
        body: JSON.stringify({
          checkpoint_id: snapshotId,
          role_name: body.role_name || undefined,
        })
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
