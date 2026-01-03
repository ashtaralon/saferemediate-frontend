import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const systemName = url.searchParams.get("systemName") ?? "alon-prod";
  const observationDays = url.searchParams.get("observationDays") ?? "90";
  const includeUnused = url.searchParams.get("includeUnused") ?? "true";
  const minTemporalWeight = url.searchParams.get("minTemporalWeight") ?? "0";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const backendUrl = `${BACKEND_URL}/api/traffic-graph/full?` + 
      `system_name=${encodeURIComponent(systemName)}` +
      `&observation_days=${observationDays}` +
      `&include_unused=${includeUnused}` +
      `&min_temporal_weight=${minTemporalWeight}`;

    console.log(`[Traffic Graph Proxy] Fetching from: ${backendUrl}`);

    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Traffic Graph Proxy] Backend error ${res.status}: ${errorText}`);
      return NextResponse.json(
        { nodes: [], edges: [], error: errorText },
        { status: res.status }
      );
    }

    const data = await res.json();
    
    console.log(`[Traffic Graph Proxy] Success: ${data.total_nodes || 0} nodes, ${data.total_edges || 0} edges`);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Traffic Graph Proxy] Error:", error.message);
    return NextResponse.json(
      { nodes: [], edges: [], error: error.message },
      { status: 500 }
    );
  }
}


