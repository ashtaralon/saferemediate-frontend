import { NextResponse } from "next/server"

const BACKEND_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const systemName = searchParams.get("systemName") || ""

  // The /api/auto-tag/status endpoint doesn't exist on the backend
  // Return fallback data directly
  return NextResponse.json({
    success: true,
    status: "stopped",
    total_cycles: 0,
    actual_traffic: 0,
    last_sync: "Never",
    tagged: 0,
    untagged: 0,
    total: 0,
    lastScan: null,
    fallback: true,
    systemName,
  })
}
