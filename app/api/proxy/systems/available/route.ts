import { NextResponse } from "next/server"

// Force the route to be dynamically rendered on every request and
// disable any Next.js fetch cache. Without this, Vercel's edge can
// keep returning a stale response from the old shape (when the
// proxy still pointed at /api/systems/available which 405'd and
// returned `systems: []`) — which is what kept the System Context
// card showing "Account —" even after the proxy edit shipped.
export const dynamic = "force-dynamic"
export const revalidate = 0

// Render free-tier cold-starts on /api/systems were measured at
// 13.6s+ (the systems endpoint runs an aggregated Cypher with
// resource counts + finding counts + region + ARN collection per
// system). Vercel's default function timeout (10s on Hobby) was
// killing the proxy before the backend responded — visible as
// repeated `(pending)` rows in DevTools that never settled.
// Match the maxDuration of /api/proxy/systems so cold-starts
// can complete on first hit.
export const maxDuration = 120

export async function GET() {
  const backendUrl = "https://saferemediate-backend-f.onrender.com"

  if (!backendUrl) {
    return NextResponse.json(
      {
        success: false,
        error: "Backend URL not configured",
        systems: [],
      },
      { status: 500 },
    )
  }

  try {
    // Backend exposes the systems list at /api/systems — there is no
    // /available route, and hitting it used to return 405 silently,
    // which made `fetchSystemMeta` fail and forced every System Context
    // card into the literal-string fallback ("Standard / Production /
    // eu-west-1"). Route to the real endpoint.
    console.log("[API Proxy] Fetching available systems from:", `${backendUrl}/api/systems`)

    const response = await fetch(`${backendUrl}/api/systems`, {
      cache: "no-store",
      // 90s leaves margin under the 120s maxDuration; covers the
      // 13s cold-start observed on Render free tier with a buffer
      // for slow Cypher execution under high resource counts.
      signal: AbortSignal.timeout(90000),
      headers: {
        Accept: "application/json",
        "ngrok-skip-browser-warning": "true",
      },
    })

    const text = await response.text()
    console.log("[API Proxy] Available systems raw response:", text.substring(0, 500))

    // Check for ngrok offline error
    if (text.includes("ERR_NGROK") || text.includes("ngrok")) {
      return NextResponse.json({
        success: false,
        error: "Backend server is offline",
        hint: "Please start your Python backend and ngrok tunnel.",
        offline: true,
        systems: [],
      })
    }

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}`,
        systems: [],
      })
    }

    const data = JSON.parse(text)
    console.log("[API Proxy] Available systems parsed:", data)

    return NextResponse.json(
      {
        success: true,
        systems: data.systems || [],
        total: data.total || 0,
      },
      {
        headers: {
          // Belt-and-braces: tell every cache between us and the browser
          // not to keep this. The systems list changes when collectors
          // run; rendering yesterday's payload made the System Context
          // card show "—" for hours after the new account_id/region
          // wiring landed.
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    )
  } catch (error) {
    console.error("[API Proxy] Error fetching available systems:", error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch available systems",
      systems: [],
    })
  }
}
