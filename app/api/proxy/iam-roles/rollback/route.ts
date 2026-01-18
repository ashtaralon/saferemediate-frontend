import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log(`[IAM-ROLLBACK] Rolling back checkpoint: ${body.checkpoint_id}`);
    console.log(`[IAM-ROLLBACK] Role name: ${body.role_name || '(from checkpoint)'}`);

    const response = await fetch(`${BACKEND_URL}/api/iam-roles/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

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
