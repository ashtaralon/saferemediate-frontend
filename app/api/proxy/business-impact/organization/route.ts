import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"

async function forward(method: "GET" | "PUT", req?: NextRequest) {
  const base = getBackendBaseUrl()
  try {
    const body = method === "PUT" && req ? await req.text() : undefined
    const response = await fetch(`${base}/api/business-impact/organization`, {
      method,
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    })
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Business impact service unavailable" },
      { status: 502 },
    )
  }
}

export async function GET() {
  return forward("GET")
}

export async function PUT(req: NextRequest) {
  return forward("PUT", req)
}
