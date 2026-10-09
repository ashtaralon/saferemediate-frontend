import { NextResponse } from "next/server"
import { normalizeJewelArn } from "@/lib/server/normalize-jewel-id"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { systemChoiceDetail } from "@/lib/server/proxy-error"

const BACKEND_URL = getBackendBaseUrl()

export const maxDuration = 60

export async function GET(
  request: Request,
  { params }: { params: Promise<{ systemName: string; jewelId: string }> }
) {
  const { systemName, jewelId: rawJewelId } = await params
  const jewelId = normalizeJewelArn(rawJewelId)
  const { searchParams } = new URL(request.url)
  const maxPaths = searchParams.get("max_paths") || "5"
  // A7 B5: a page opened by key names ONE system (backend ?system_key=, with the account for a tag / source key).
  // Absent, the request -- and the edge cache's URL -- is byte-identical to before.
  const systemKey = searchParams.get("system_key")
  const accountId = searchParams.get("account_id")
  const scope = systemKey ? `&system_key=${encodeURIComponent(systemKey)}${
    accountId ? `&account_id=${encodeURIComponent(accountId)}` : ""}` : ""

  try {
    const query = `?max_paths=${maxPaths}${scope}`
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
      // A7 B5: the 409 system choice is relayed (typed) so the page can offer it; every other refusal answers as before.
      const choice = response.status === 409 ? systemChoiceDetail(await response.text().catch(() => "")) : undefined
      return NextResponse.json(
        { error: "Failed to load jewel detail", status: response.status, ...(choice ? { detail: choice } : {}) },
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
