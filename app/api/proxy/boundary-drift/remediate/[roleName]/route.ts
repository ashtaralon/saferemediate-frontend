import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  try {
    const { roleName } = await params;

    console.log(`[DRIFT] Remediate request for role: ${roleName}`);

    const response = await fetch(
      `${BACKEND_URL}/api/boundary-drift/remediate/${encodeURIComponent(roleName)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(28000),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(`[DRIFT] Remediate error:`, data);
      return NextResponse.json(
        { error: data.detail || data.error || "Remediation failed" },
        { status: response.status }
      );
    }

    console.log(`[DRIFT] Remediate success:`, data);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`[DRIFT] Remediate exception:`, error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
