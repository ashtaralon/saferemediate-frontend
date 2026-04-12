import { NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export async function GET(request: Request, { params }: { params: Promise<{ systemName: string }> }) {
  const { systemName } = await params
  const { searchParams } = new URL(request.url)
  const maxPaths = searchParams.get('max_paths') || '100'
  const includeConfigured = searchParams.get('include_configured') !== 'false'

  try {
    const queryParams = `?max_paths=${maxPaths}&include_configured=${includeConfigured}`
    const response = await fetch(`${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}${queryParams}`, {
      headers: {
        "ngrok-skip-browser-warning": "true",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      // Return empty data when backend returns error
      console.log("[attack-paths] Backend error, returning empty data")
      return NextResponse.json({
        paths: [],
        total_paths: 0,
        highest_risk_score: 0,
        critical_paths: 0,
        summary: {}
      })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[attack-paths] Fetch error:", error)
    return NextResponse.json({
      paths: [],
      total_paths: 0,
      highest_risk_score: 0,
      critical_paths: 0,
      summary: {}
    })
  }
}
