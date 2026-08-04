import { type NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { approvalBackendHeaders } from "@/lib/server/approval-backend-auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = getBackendBaseUrl()

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.toString()
    const response = await fetch(
      `${BACKEND_URL}/api/iam-roles/approval-requests${search ? `?${search}` : ""}`,
      { cache: "no-store", headers: approvalBackendHeaders({ json: false }) },
    )
    const data = await response.json().catch(() => ({}))
    return NextResponse.json(data, { status: response.status })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch IAM approval requests" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const response = await fetch(`${BACKEND_URL}/api/iam-roles/approval-requests`, {
      method: "POST",
      headers: approvalBackendHeaders(),
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    return NextResponse.json(data, { status: response.status })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to create IAM approval request" },
      { status: 500 },
    )
  }
}
