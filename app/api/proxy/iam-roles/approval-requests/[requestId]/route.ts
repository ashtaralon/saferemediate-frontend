import { type NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { approvalBackendHeaders } from "@/lib/server/approval-backend-auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = getBackendBaseUrl()

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await params
    const response = await fetch(
      `${BACKEND_URL}/api/iam-roles/approval-requests/${encodeURIComponent(requestId)}`,
      { cache: "no-store", headers: approvalBackendHeaders({ json: false }) },
    )
    const data = await response.json().catch(() => ({}))
    return NextResponse.json(data, { status: response.status })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch IAM approval request" },
      { status: 500 },
    )
  }
}
