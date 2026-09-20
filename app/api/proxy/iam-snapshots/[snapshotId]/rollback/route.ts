import { NextRequest, NextResponse } from "next/server";
import { selectBackendProof } from "@/lib/server/backend-proof"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  try {
    const { snapshotId } = await params;

    const proof = await residentRollbackProof(req);
    if (proof.refusal) {
      return NextResponse.json(
        { error: { code: proof.refusal.code, message: ROLLBACK_PROOF_MESSAGES[proof.refusal.code] ?? "Rollback request refused." },
          success: false, origin: "proxy" },
        { status: proof.refusal.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Forward request body (may contain selected_items for partial restore)
    const body = await req.json().catch(() => ({}));

    console.log(`[IAM-ROLLBACK] Rolling back IAM snapshot: ${snapshotId}`, body.selected_items ? `(partial: ${body.selected_items.length} items)` : '(full)');

    // Use the generic snapshots rollback endpoint which handles SNAP-* format
    const response = await fetch(
      `${BACKEND_URL}/api/snapshots/${snapshotId}/rollback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...proof.headers },
        body: JSON.stringify(body)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(`[IAM-ROLLBACK] Error:`, data);
      return NextResponse.json(
        { error: data.detail || data.error || 'Rollback failed', success: false },
        { status: response.status }
      );
    }

    console.log(`[IAM-ROLLBACK] Success:`, data);
    return NextResponse.json({ success: true, ...data });

  } catch (error: any) {
    console.error(`[IAM-ROLLBACK] Exception:`, error);
    return NextResponse.json(
      { error: error.message || 'Internal server error', success: false },
      { status: 500 }
    );
  }
}

