import { type NextRequest, NextResponse } from "next/server"

import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { approvalBackendHeaders, approvalOperatorIdentity } from "@/lib/server/approval-backend-auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const findingId = body?.finding_id
    if (!findingId) {
      return NextResponse.json({ success: false, error: "finding_id is required" }, { status: 400 })
    }

    // Operator identity and approval credentials are server-owned. Browser
    // fields cannot choose the actor or authorize a plan.
    const response = await fetch(`${getBackendBaseUrl()}/api/configuration-fixes/approval-requests`, {
      method: "POST",
      headers: approvalBackendHeaders(),
      body: JSON.stringify({
        finding_id: findingId,
        requested_by: approvalOperatorIdentity(),
        note: "Requested from the configuration Change Case review.",
      }),
      cache: "no-store",
    })
    const text = await response.text()
    let data: any = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { detail: text }
    }
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data?.detail || data?.error || `Approval request failed (${response.status})` },
        { status: response.status },
      )
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approval request failed"
    const unavailable = /not configured/i.test(message)
    console.error("Configuration approval request failed:", error)
    return NextResponse.json(
      { success: false, error: message },
      { status: unavailable ? 503 : 500 },
    )
  }
}
