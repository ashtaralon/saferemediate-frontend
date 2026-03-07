import { NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ systemName: string; pathId: string }> }
) {
  const { systemName, pathId } = await params

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}/path/${encodeURIComponent(pathId)}/details`,
      {
        headers: {
          "ngrok-skip-browser-warning": "true",
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    )

    if (!response.ok) {
      console.log("[attack-path-details] Backend error, returning empty data")
      return NextResponse.json({
        error: "Failed to load path details",
        path_id: pathId
      }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[attack-path-details] Fetch error:", error)
    return NextResponse.json({
      error: "Failed to fetch attack path details",
      path_id: pathId
    }, { status: 500 })
  }
}
