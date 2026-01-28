import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queryString = searchParams.toString();
    const url = `${BACKEND_URL}/api/permission-boundary/candidates${queryString ? `?${queryString}` : ""}`;

    console.log(`[BOUNDARY] Fetching candidates: ${url}`);

    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(28000),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[BOUNDARY] Candidates error:`, data);
      return NextResponse.json(
        { error: data.detail || data.error || "Failed to fetch candidates" },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`[BOUNDARY] Candidates exception:`, error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
