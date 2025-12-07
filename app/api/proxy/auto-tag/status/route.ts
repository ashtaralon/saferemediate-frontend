import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-1.onrender.com"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const systemName = searchParams.get("systemName") || ""

  try {
    // Try to fetch from backend
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

    const response = await fetch(`${BACKEND_URL}/api/auto-tag/status?systemName=${encodeURIComponent(systemName)}`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      const data = await response.json()
      return NextResponse.json(data)
    }
  } catch (error) {
    console.log("[proxy] Auto-tag status endpoint not available, returning fallback")
  }

  // Return fallback data if backend unavailable
  return NextResponse.json({
    success: true,
    status: "stopped",
    total_cycles: 0,
    actual_traffic: 15,
    last_sync: "Awaiting connection",
    tagged: 0,
    untagged: 0,
    total: 0,
    lastScan: null,
    fallback: true,
    systemName,
  })
}
