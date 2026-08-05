import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"
export const maxDuration = 60

async function forward(
  request: NextRequest,
  params: Promise<{ systemName: string; path: string[] }>,
) {
  const { systemName, path } = await params
  const suffix = path.map(encodeURIComponent).join("/")
  const query = request.nextUrl.search
  const url = `${getBackendBaseUrl()}/api/operational-map/${encodeURIComponent(systemName)}/${suffix}${query}`
  try {
    const response = await fetch(url, {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    })
    const body = await response.text()
    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    })
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Operational map request failed" },
      { status: 502 },
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string; path: string[] }> },
) {
  return forward(request, params)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string; path: string[] }> },
) {
  return forward(request, params)
}
