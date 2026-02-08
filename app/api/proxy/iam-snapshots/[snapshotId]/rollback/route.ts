import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  try {
    const { snapshotId } = await params;

    console.log(`[IAM-ROLLBACK] Rolling back IAM snapshot: ${snapshotId}`);

    // Use the generic snapshots rollback endpoint which handles SNAP-* format
    const response = await fetch(
      `${BACKEND_URL}/api/snapshots/${snapshotId}/rollback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
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

