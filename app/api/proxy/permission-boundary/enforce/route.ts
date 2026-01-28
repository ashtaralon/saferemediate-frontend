import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log(`[BOUNDARY] Enforce request for role: ${body.role_name} (dry_run: ${body.dry_run})`);

    const response = await fetch(`${BACKEND_URL}/api/permission-boundary/enforce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(28000),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[BOUNDARY] Enforce error:`, data);
      return NextResponse.json(
        { error: data.detail || data.error || "Enforcement failed" },
        { status: response.status }
      );
    }

    console.log(`[BOUNDARY] Enforce success:`, data);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`[BOUNDARY] Enforce exception:`, error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
