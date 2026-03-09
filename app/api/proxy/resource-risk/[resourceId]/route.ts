import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  try {
    const { resourceId } = await params;
    const { searchParams } = new URL(request.url);
    const resourceType = searchParams.get("resource_type") || "";

    console.log(`[Resource Risk] GET /api/blast-radius/${resourceId}/risk-assessment`);

    const response = await fetch(
      `${BACKEND_URL}/api/blast-radius/${encodeURIComponent(resourceId)}/risk-assessment?resource_type=${resourceType}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        next: { revalidate: 60 }, // Cache for 60 seconds
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Resource Risk] Backend error ${response.status}: ${errorText}`);
      return NextResponse.json(
        { error: `Backend error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Resource Risk] Error:", error);
    return NextResponse.json(
      { error: "Failed to get resource risk assessment", details: String(error) },
      { status: 500 }
    );
  }
}
