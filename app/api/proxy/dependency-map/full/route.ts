import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const systemName = url.searchParams.get("systemName") ?? "alon-prod";
  const includeUnused = url.searchParams.get("includeUnused") ?? "true";
  const maxNodes = url.searchParams.get("maxNodes") ?? "200";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const backendUrl = `${BACKEND_URL}/api/dependency-map/full?` +
      `system_name=${encodeURIComponent(systemName)}` +
      `&include_unused=${includeUnused}` +
      `&max_nodes=${maxNodes}`;

    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Dependency Map Full Proxy] Backend error ${res.status}: ${errorText}`);
      return NextResponse.json(
        { nodes: [], edges: [], error: errorText },
        { status: res.status }
      );
    }

    const data = await res.json();
    console.log(`[Dependency Map Full Proxy] ${data.total_nodes || 0} nodes, ${data.total_edges || 0} edges`);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Dependency Map Full Proxy] Error:", error.message);
    return NextResponse.json(
      { nodes: [], edges: [], error: error.message },
      { status: 500 }
    );
  }
}

