import { NextResponse } from "next/server"

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ systemName: string; jewelId: string }> }
) {
  const { systemName, jewelId } = await params
  const { searchParams } = new URL(request.url)
  const maxPaths = searchParams.get("max_paths") || "5"

  try {
    const query = `?max_paths=${maxPaths}`
    const response = await fetch(
      `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(systemName)}/jewel/${encodeURIComponent(jewelId)}${query}`,
      {
        headers: {
          "ngrok-skip-browser-warning": "true",
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
      }
    )

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to load jewel detail", status: response.status },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[identity-attack-paths/jewel] Fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch jewel detail" }, { status: 500 })
  }
}
