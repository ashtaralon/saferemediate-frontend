import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    console.log(`[SAFE-REMEDIATE] Executing: ${body.finding_id}`)

    const response = await fetch(`${BACKEND_URL}/api/safe-remediate/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { success: false, error: `Remediation failed: ${response.status}`, message: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(`[SAFE-REMEDIATE] ✅ Success:`, data)
    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error("[SAFE-REMEDIATE] Error:", error)
    return NextResponse.json(
      { success: false, error: "Remediation failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

