// app/api/proxy/least-privilege/simulate-fix/route.ts
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
// 30s max — must be > AbortSignal.timeout below so the function doesn't
// get killed mid-fetch. Per feedback_vercel_abort_cascade.md: "per-route
// maxDuration + per-fetch timeout < N" prevents the 500 cascade where
// Vercel kills the function before fetch finishes and the AbortController
// raises in-flight, surfacing as 500 to the caller.
export const maxDuration = 30

const RAW_BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

function getBackendBase() {
  return RAW_BACKEND_URL.replace(/\/+$/, "").replace(/\/backend$/, "")
}

// POST /api/proxy/least-privilege/simulate-fix
// body: { resource_type: string, resource_id: string, system_name: string }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const { resource_type, resource_id, system_name } = body

  if (!resource_type || !resource_id || !system_name) {
    return NextResponse.json(
      { success: false, error: "resource_type, resource_id, and system_name are required" },
      { status: 400 },
    )
  }

  const base = getBackendBase()
  const backendUrl = base + "/api/least-privilege/simulate-fix"

  try {
    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ resource_type, resource_id, system_name }),
      // 25s — leaves 5s headroom under Vercel maxDuration (30s) so the
      // proxy can still serialize the response after fetch completes.
      // Backend simulate-fix p95 is ~2s in healthy state; 25s tolerates
      // Render cold-worker + Neo4j Aura first-query latency without
      // surfacing as a 500 from the function-timeout cascade.
      signal: AbortSignal.timeout(25000),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      return NextResponse.json(
        { success: false, error: errorData.detail || `Backend simulate-fix failed: ${res.status}` },
        { status: res.status },
      )
    }

    const data = await res.json()
    return NextResponse.json(data, { status: 200 })
  } catch (err: any) {
    // Distinguish AbortError (timeout) from other failures so the
    // toast surfaces a useful retry hint instead of a generic 500.
    const isTimeout =
      err?.name === "TimeoutError" ||
      err?.name === "AbortError" ||
      String(err?.message || "").includes("timeout")
    console.error(
      "[proxy] least-privilege simulate-fix error:",
      isTimeout ? "timeout" : err,
    )
    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? "simulate-fix timed out (backend > 25s). Retry; Render worker may be warming."
          : err?.message ?? "simulate-fix failed",
      },
      { status: isTimeout ? 504 : 500 },
    )
  }
}
