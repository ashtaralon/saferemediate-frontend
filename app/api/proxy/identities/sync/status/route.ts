import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"

const BACKEND_URL =
  getBackendBaseUrl()

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/identities/sync/status`, {
      cache: "no-store",
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: "Backend unavailable", detail: error.message }, { status: 503 })
  }
}
