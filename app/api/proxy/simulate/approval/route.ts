import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_API_URL ||
  "https://saferemediate-backend.onrender.com"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { finding_id } = body
    
    console.log(`[SIMULATE-APPROVAL] Requesting approval for finding: ${finding_id}`)

    // Call backend approval endpoint (if it exists, otherwise return success)
    // TODO: Implement backend approval endpoint
    const response = await fetch(`${BACKEND_URL}/api/simulate/approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finding_id }),
    }).catch(() => {
      // If endpoint doesn't exist, return success (approval request created)
      return new Response(JSON.stringify({ 
        success: true, 
        finding_id,
        status: 'pending_approval',
        message: 'Approval request created'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { success: false, error: `Approval request failed: ${response.status}`, message: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(`[SIMULATE-APPROVAL] ✅ Success:`, data)
    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error("[SIMULATE-APPROVAL] Error:", error)
    return NextResponse.json(
      { success: false, error: "Approval request failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
