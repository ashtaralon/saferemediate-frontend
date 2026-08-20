import { type NextRequest, NextResponse } from "next/server"

import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { approvalWorkflowConfigured } from "@/lib/server/approval-backend-auth"
import { customerSafeError } from "@/lib/customer-error"

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

    // The finding ID is the only browser-supplied authority. Resource identity,
    // evidence, and the exact candidate plan are reloaded by the backend.
    const response = await fetch(`${getBackendBaseUrl()}/api/configuration-fixes/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finding_id: findingId }),
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
        { success: false, error: customerSafeError(
          data?.detail || data?.error,
          "Configuration analysis could not be completed. Refresh the inventory and try again. No change was made.",
        ) },
        { status: response.status, headers: { "X-Proxy": "simulate-error" } },
      )
    }
    if (!data?.success || !data?.decision || !data?.change_case) {
      return NextResponse.json(
        { success: false, error: "Backend returned an incomplete Change Case" },
        { status: 502, headers: { "X-Proxy": "simulate-error" } },
      )
    }

    const frontendApprovalReady = approvalWorkflowConfigured()
    if (data.change_case?.approval?.required && !frontendApprovalReady) {
      data.change_case.approval.available = false
      data.change_case.approval.reason =
        "The authenticated approval gateway is not configured. Review is available; AWS mutation remains disabled."
    }

    return NextResponse.json(
      { ...data, frontend_approval_ready: frontendApprovalReady },
      { headers: { "X-Proxy": "configuration-fix-simulate", "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Configuration simulation failed:", error)
    return NextResponse.json(
      { success: false, error: "Configuration analysis service is unreachable" },
      { status: 503, headers: { "X-Proxy": "simulate-error" } },
    )
  }
}
