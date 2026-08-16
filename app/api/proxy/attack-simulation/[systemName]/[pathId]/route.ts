import { NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL = getBackendBaseUrl()

export async function GET(
  request: Request,
  { params }: { params: Promise<{ systemName: string; pathId: string }> }
) {
  const { systemName, pathId } = await params

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/attack-simulation/${encodeURIComponent(systemName)}/path/${encodeURIComponent(pathId)}/simulation`,
      {
        headers: {
          "ngrok-skip-browser-warning": "true",
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[attack-simulation] Backend error:", errorText)
      return NextResponse.json({
        status: "ERROR",
        message: "Failed to get attack simulation",
        error: errorText
      }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[attack-simulation] Fetch error:", error)
    return NextResponse.json({
      status: "ERROR",
      message: "Failed to fetch attack simulation",
      error: String(error)
    }, { status: 500 })
  }
}
