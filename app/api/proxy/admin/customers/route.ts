import { NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/api/admin/customers`, { cache: "no-store" })
    const body = await response.text()
    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
    })
  } catch (reason) {
    return NextResponse.json(
      { error: "customer_roster_unavailable", detail: reason instanceof Error ? reason.message : String(reason) },
      { status: 502 },
    )
  }
}
