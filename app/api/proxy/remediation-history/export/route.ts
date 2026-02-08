import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const format = searchParams.get("format") || "csv"

    const url = `${BACKEND_URL}/api/remediation-history/export?format=${format}`
    console.log("[Remediation Export Proxy] GET:", url)

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (!response.ok) {
      // Return empty export data if endpoint doesn't exist
      if (response.status === 404) {
        console.log("[Remediation Export Proxy] Endpoint not found, returning empty data")
        return NextResponse.json({
          content: "",
          filename: `remediation_history_${new Date().toISOString().split('T')[0]}.${format}`,
          format
        })
      }
      const errorText = await response.text()
      console.error("[Remediation Export Proxy] Error:", response.status, errorText)
      return NextResponse.json({ error: errorText }, { status: response.status })
    }

    const data = await response.json()
    console.log("[Remediation Export Proxy] Success")
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[Remediation Export Proxy] Error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
