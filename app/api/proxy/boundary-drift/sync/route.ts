import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log(`[DRIFT] Sync request:`, body);

    const response = await fetch(`${BACKEND_URL}/api/boundary-drift/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000), // 60s timeout for sync
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[DRIFT] Sync error:`, data);
      return NextResponse.json(
        { error: data.detail || data.error || "Sync failed" },
        { status: response.status }
      );
    }

    console.log(`[DRIFT] Sync complete: ${data.total_checked} checked, ${data.drift_detected} drifted`);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`[DRIFT] Sync exception:`, error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
