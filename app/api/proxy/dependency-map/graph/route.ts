import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com";

export const maxDuration = 60;

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      
      clearTimeout(timeoutId);
      
      if (res.ok) return res;
      
      console.log(`[Dependency Map] Attempt ${i + 1} failed with status ${res.status}`);
    } catch (error: any) {
      console.log(`[Dependency Map] Attempt ${i + 1} failed: ${error.message}`);
      if (i === retries) throw error;
    }
    
    // Wait before retry (1s, 2s)
    if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error("All retries failed");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const systemName = url.searchParams.get("systemName") ?? "alon-prod";

  try {
    const backendUrl = `${BACKEND_URL}/api/dependency-map/graph?systemName=${encodeURIComponent(systemName)}`;
    
    const res = await fetchWithRetry(backendUrl);
    const data = await res.json();
    
    console.log(`[Dependency Map] Success: ${data.nodes?.length || 0} nodes, ${data.edges?.length || 0} edges`);
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Dependency Map] Error:", error.message);
    return NextResponse.json(
      { nodes: [], edges: [], error: error.message },
      { status: 500 }
    );
  }
}
