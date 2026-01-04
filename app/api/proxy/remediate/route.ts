import { type NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { roleName, permission, action } = body

    // Call backend remediation endpoint
    const response = await fetch(`${BACKEND_URL}/api/remediate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role_name: roleName || "SafeRemediate-Lambda-Remediation-Role",
        permission: permission,
        action: action || "remove", // remove, ignore, snooze
      }),
    })

    if (response.ok) {
      const data = await response.json()
      return NextResponse.json({
        success: true,
        message: `Permission "${permission}" has been remediated`,
        ...data,
      })
    } else {
      // Backend error - return error (no mock data)
      const errorData = await response.json().catch(() => ({ error: `Backend returned ${response.status}` }))
      return NextResponse.json({
        success: false,
        error: errorData.error || errorData.message || `Backend returned ${response.status}`,
        permission,
        roleName,
        action,
      }, { status: response.status })
    }
  } catch (error) {
    console.error("[v0] Remediation error:", error)
    // Return error (no mock data)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Remediation failed",
    }, { status: 500 })
  }
}
