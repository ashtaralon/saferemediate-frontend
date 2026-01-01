import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const systemName = url.searchParams.get("systemName") ?? "alon-prod";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const backendUrl = `${BACKEND_URL}/api/dependency-map/graph?systemName=${encodeURIComponent(systemName)}`;

    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Dependency Map Proxy] Backend error ${res.status}: ${errorText}`);
      return NextResponse.json(
        { nodes: [], edges: [], error: errorText },
        { status: res.status }
      );
    }

    const data = await res.json();
    
    console.log(`[Dependency Map Proxy] Fetched ${data.nodes?.length || 0} nodes, ${data.edges?.length || 0} edges`);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Dependency Map Proxy] Error:", error.message);
    return NextResponse.json(
      { nodes: [], edges: [], error: error.message },
      { status: 500 }
    );
  }
}
