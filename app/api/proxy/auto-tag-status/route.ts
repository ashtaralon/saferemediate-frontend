import { NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend.onrender.com"

const FETCH_TIMEOUT = 5000 // 5 second timeout

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const systemName = searchParams.get("systemName") || ""

  // Try to fetch from backend first
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    const response = await fetch(
      `${BACKEND_URL}/api/auto-tag/status?systemName=${encodeURIComponent(systemName)}`,
      {
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      }
    )

    clearTimeout(timeoutId)

    if (response.ok) {
      const data = await response.json()
      return NextResponse.json({
        success: true,
        status: data.status || "stopped",
        total_cycles: data.total_cycles || data.totalCycles || 0,
        actual_traffic: data.actual_traffic || data.actualTrafficCaptured || 0,
        last_sync: data.last_sync || data.lastSync || "Never",
        tagged: data.tagged || 0,
        untagged: data.untagged || 0,
        total: data.total || 0,
        lastScan: data.lastScan || null,
        systemName,
      })
    }
  } catch (error: any) {
    console.log("[auto-tag-status] Backend unavailable:", error.message)
  }

  // Fallback - return simulated status based on system
  // In production, this would come from a local store
  const fallbackData = generateFallbackStatus(systemName)

  return NextResponse.json({
    success: true,
    ...fallbackData,
    fallback: true,
    systemName,
  })
}

// Generate realistic fallback status for demo purposes
function generateFallbackStatus(systemName: string) {
  // Create deterministic but varied data based on system name
  const hash = systemName.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)

  const statuses = ["running", "stopped", "stopped"] // More likely to be stopped
  const status = statuses[hash % statuses.length]

  const totalCycles = status === "running" ? Math.floor(hash % 50) + 10 : 0
  const actualTraffic = status === "running" ? Math.floor(hash % 1000) + 100 : 0

  const now = new Date()
  const lastSyncDate = new Date(now.getTime() - (hash % 86400000)) // Within last 24 hours
  const lastSync = status === "running"
    ? lastSyncDate.toLocaleString()
    : "Never"

  return {
    status,
    total_cycles: totalCycles,
    actual_traffic: actualTraffic,
    last_sync: lastSync,
    tagged: Math.floor(hash % 20) + 5,
    untagged: Math.floor(hash % 10),
    total: Math.floor(hash % 30) + 10,
    lastScan: status === "running" ? lastSyncDate.toISOString() : null,
  }
}
