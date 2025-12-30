import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  const { snapshotId } = await params

  try {
    console.log("[proxy] rollback to snapshot:", snapshotId)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 minute timeout for rollback

    const response = await fetch(
      `${BACKEND_URL}/api/remediation/rollback/${snapshotId}`,
      {
        method: "POST",
        headers: { "Accept": "application/json" },
        cache: "no-store",
        signal: controller.signal,
      }
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[proxy] rollback error " + response.status + ": " + errorText)
      
      let errorData: any = { detail: "Rollback failed" }
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { detail: errorText || "Rollback failed" }
      }

      return NextResponse.json(
        { success: false, error: errorData.detail || "Rollback failed" },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log("[proxy] rollback success:", data.success, "rules_restored:", data.rules_restored)

    return NextResponse.json(data, { status: 200 })
  } catch (error: any) {
    console.error("[proxy] rollback error:", error)

    if (error.name === "AbortError") {
      return NextResponse.json(
        { success: false, error: "Request timeout. Rollback is taking longer than expected." },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}


