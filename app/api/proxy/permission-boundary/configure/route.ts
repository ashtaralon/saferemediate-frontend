import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function GET() {
  try {
    console.log(`[BOUNDARY] Fetching enforcement config`);

    const response = await fetch(`${BACKEND_URL}/api/permission-boundary/config`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(28000),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[BOUNDARY] Config fetch error:`, data);
      return NextResponse.json(
        { error: data.detail || data.error || "Failed to fetch config" },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`[BOUNDARY] Config fetch exception:`, error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log(`[BOUNDARY] Updating enforcement config`);

    const response = await fetch(`${BACKEND_URL}/api/permission-boundary/configure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(28000),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[BOUNDARY] Config update error:`, data);
      return NextResponse.json(
        { error: data.detail || data.error || "Config update failed" },
        { status: response.status }
      );
    }

    console.log(`[BOUNDARY] Config updated:`, data);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`[BOUNDARY] Config update exception:`, error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
