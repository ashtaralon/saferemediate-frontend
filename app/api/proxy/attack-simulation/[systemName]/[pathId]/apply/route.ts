import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string; pathId: string }> }
) {
  try {
    const { systemName, pathId } = await params;
    const body = await request.json();

    console.log(
      `[Apply Remediation] POST /api/attack-simulation/${systemName}/path/${pathId}/apply-remediation`
    );

    const response = await fetch(
      `${BACKEND_URL}/api/attack-simulation/${systemName}/path/${pathId}/apply-remediation`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Apply Remediation] Backend error ${response.status}: ${errorText}`);
      return NextResponse.json(
        { error: `Backend error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Apply Remediation] Error:", error);
    return NextResponse.json(
      { error: "Failed to apply remediation", details: String(error) },
      { status: 500 }
    );
  }
}
