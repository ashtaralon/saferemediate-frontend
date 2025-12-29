import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  try {
    const { snapshotId } = await params;
    
    console.log(`[IAM-ROLLBACK] Rolling back IAM snapshot: ${snapshotId}`);
    
    // New endpoint: /api/iam-roles/snapshots/{id}/rollback
    // Requires body with region
    const response = await fetch(
      `${BACKEND_URL}/api/iam-roles/snapshots/${snapshotId}/rollback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: 'eu-west-1' })
      }
    );
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`[IAM-ROLLBACK] Error:`, data);
      return NextResponse.json(
        { error: data.detail || data.error || 'Rollback failed' },
        { status: response.status }
      );
    }
    
    console.log(`[IAM-ROLLBACK] Success:`, data);
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error(`[IAM-ROLLBACK] Exception:`, error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

