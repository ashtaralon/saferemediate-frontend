import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"

async function forward(
  method: "GET" | "PUT",
  systemName: string,
  req?: NextRequest,
) {
  const base = getBackendBaseUrl()
  try {
    const body = method === "PUT" && req ? await req.text() : undefined
    const response = await fetch(
      `${base}/api/business-impact/profiles/${encodeURIComponent(systemName)}`,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      },
    )
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  return forward("GET", systemName)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  return forward("PUT", systemName, req)
}
