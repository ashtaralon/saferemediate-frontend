import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL =
  getBackendBaseUrl()

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/identities/detail/${encodeURIComponent(name)}`,
      { cache: "no-store" }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}
