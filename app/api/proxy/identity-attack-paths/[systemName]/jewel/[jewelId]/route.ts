import { NextResponse } from "next/server"
import { normalizeJewelArn } from "@/lib/server/normalize-jewel-id"

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 60

export async function GET(
  request: Request,
  { params }: { params: Promise<{ systemName: string; jewelId: string }> }
) {
  const { systemName, jewelId: rawJewelId } = await params
  const jewelId = normalizeJewelArn(rawJewelId)
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
        signal: AbortSignal.timeout(55000),
      }
    )

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to load jewel detail", status: response.status },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data, {
      headers: {
        // 2-min Vercel edge cache + 4-min stale-while-revalidate. Matches
        // the parent identity-attack-paths and the jewel-surface route.
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
      },
    })
  } catch (error) {
    console.error("[identity-attack-paths/jewel] Fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch jewel detail" }, { status: 500 })
  }
}
