import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string; pathId: string }> }
) {
  try {
    const { systemName, pathId } = await params;
    const { searchParams } = new URL(request.url);
    const remediationId = searchParams.get("remediation_id");

    if (!remediationId) {
      return NextResponse.json(
        { error: "remediation_id query parameter is required" },
        { status: 400 }
      );
    }

    console.log(
      `[Rollback Remediation] POST /api/attack-simulation/${systemName}/path/${pathId}/rollback-remediation?remediation_id=${remediationId}`
    );

    const response = await fetch(
      `${BACKEND_URL}/api/attack-simulation/${systemName}/path/${pathId}/rollback-remediation?remediation_id=${remediationId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Rollback Remediation] Backend error ${response.status}: ${errorText}`);
      return NextResponse.json(
        { error: `Backend error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Rollback Remediation] Error:", error);
    return NextResponse.json(
      { error: "Failed to rollback remediation", details: String(error) },
      { status: 500 }
    );
  }
}
