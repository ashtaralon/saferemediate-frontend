import { NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ systemName: string; pathId: string }> }
) {
  const { systemName, pathId } = await params

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}/path/${encodeURIComponent(pathId)}/block`,
      {
        method: "POST",
        headers: {
          "ngrok-skip-browser-warning": "true",
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[block-attack-path] Backend error:", errorText)
      return NextResponse.json({
        status: "ERROR",
        message: "Failed to block attack path",
        error: errorText
      }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[block-attack-path] Fetch error:", error)
    return NextResponse.json({
      status: "ERROR",
      message: "Failed to block attack path",
      error: String(error)
    }, { status: 500 })
  }
}
