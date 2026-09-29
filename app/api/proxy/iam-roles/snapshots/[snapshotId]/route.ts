import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { fromCaughtError, relayBackendError } from "@/lib/server/proxy-error"

const BACKEND_URL = getBackendBaseUrl();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  try {
    const { snapshotId } = await params;
    
    console.log(`[IAM-SNAPSHOT] Fetching snapshot: ${snapshotId}`);
    
    const response = await fetch(
      `${BACKEND_URL}/api/iam-roles/snapshots/${snapshotId}`,
      { cache: 'no-store' }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.detail || 'Snapshot not found' },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error(`[IAM-SNAPSHOT] Error:`, error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  try {
    const { snapshotId } = await params;
    
    console.log(`[IAM-SNAPSHOT] Deleting snapshot: ${snapshotId}`);
    
    const response = await fetch(
      `${BACKEND_URL}/api/iam-roles/snapshots/${snapshotId}`,
      { method: 'DELETE' }
    );
    
    if (!response.ok) {
      // Status and typed body unchanged: a held delete is a 409 off_boundary_mutation_refused the UI must show.
      console.error(`[IAM-SNAPSHOT] Delete refused: HTTP ${response.status}`);
      return relayBackendError(response);
    }

    const data = await response.json();
    console.log(`[IAM-SNAPSHOT] Deleted:`, data);
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error(`[IAM-SNAPSHOT] Delete exception:`, error);
    // Timeout (504) or unreachable (503): the delete may or may not have committed.
    return fromCaughtError(error);
  }
}




