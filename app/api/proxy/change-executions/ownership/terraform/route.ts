import { type NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = getBackendBaseUrl()

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.toString()
    const response = await fetch(
      `${BACKEND_URL}/api/change-executions/ownership/terraform${search ? `?${search}` : ""}`,
      { cache: "no-store" },
    )
    const data = await response.json().catch(() => ({}))
    return NextResponse.json(data, { status: response.status })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to load Terraform ownership" },
      { status: 500 },
    )
  }
}
