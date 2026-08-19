import { type NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = getBackendBaseUrl()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const response = await fetch(
      `${BACKEND_URL}/api/change-executions/ownership/terraform/register-ui`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    )
    const data = await response.json().catch(() => ({}))
    return NextResponse.json(data, { status: response.status })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to register Terraform ownership" },
      { status: 500 },
    )
  }
}
