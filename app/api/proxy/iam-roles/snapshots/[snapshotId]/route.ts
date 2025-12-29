import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

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
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`[IAM-SNAPSHOT] Delete error:`, data);
      return NextResponse.json(
        { error: data.detail || 'Failed to delete snapshot' },
        { status: response.status }
      );
    }
    
    console.log(`[IAM-SNAPSHOT] Deleted:`, data);
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error(`[IAM-SNAPSHOT] Delete exception:`, error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

