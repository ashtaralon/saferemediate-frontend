import { NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

// GET proxy for /api/freshness — pass-through of the backend's
// CollectorRun.finished_at lookup so the FreshnessBanner can render
// "Graph synced X min ago" on every view. Cheap (~5ms upstream); safe
// to poll every 30-60s without straining Render.

export const runtime = "nodejs"
export const maxDuration = 30
export const dynamic = "force-dynamic"
export const revalidate = 0

const BACKEND_URL = getBackendBaseUrl()

export async function GET() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)
    const upstream = await fetch(`${BACKEND_URL}/api/freshness`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!upstream.ok) {
      const text = await upstream.text()
      return NextResponse.json(
        {
          ok: false,
          error: `backend ${upstream.status}`,
          detail: text.slice(0, 500),
          graph_synced_at_iso: null,
          graph_age_seconds: null,
          latest_collector_id: null,
          now_iso: new Date().toISOString(),
        },
        { status: upstream.status },
      )
    }
    const data = await upstream.json()
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  } catch (e: any) {
    const isTimeout = e?.name === "AbortError" || e?.name === "TimeoutError"
    return NextResponse.json(
      {
        ok: false,
        error: isTimeout ? "upstream_timeout" : "proxy_error",
        detail: e instanceof Error ? e.message : String(e),
        graph_synced_at_iso: null,
        graph_age_seconds: null,
        latest_collector_id: null,
        now_iso: new Date().toISOString(),
      },
      { status: 502 },
    )
  }
}
