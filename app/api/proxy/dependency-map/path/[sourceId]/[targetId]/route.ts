import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sourceId: string; targetId: string }> }
) {
  const { sourceId, targetId } = await context.params;
  const url = new URL(req.url);
  const systemName = url.searchParams.get("systemName");
  if (!systemName) {
    return NextResponse.json({ error: "systemName query parameter is required" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const backendUrl = `${BACKEND_URL}/api/dependency-map/path/${encodeURIComponent(sourceId)}/${encodeURIComponent(targetId)}?system_name=${encodeURIComponent(systemName)}`;

    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Security Path Proxy] Backend error ${res.status}: ${errorText}`);
      return NextResponse.json(
        { error: errorText, path_segments: [] },
        { status: res.status }
      );
    }

    const data = await res.json();
    console.log(`[Security Path Proxy] Path from ${sourceId} to ${targetId}: ${data.path_segments?.length || 0} segments`);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Security Path Proxy] Error:", error.message);
    return NextResponse.json(
      { error: error.message, path_segments: [] },
      { status: 500 }
    );
  }
}


