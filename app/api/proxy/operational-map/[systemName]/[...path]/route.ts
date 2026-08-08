import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { approvalBackendHeaders } from "@/lib/server/approval-backend-auth"

export const runtime = "nodejs"
export const maxDuration = 60

// Route families gated by the backend's operational-proxy secret
// (_require_operational_proxy). s3-bucket-policy was missing here, so every
// enforcement-wizard call reached the backend without credentials and 401ed —
// including the read-only analyze that Preview mode promises still works.
const OPERATIONAL_SECRET_PREFIXES = new Set(["s3-vpce", "s3-bucket-policy", "s3-posture"])

async function forward(
  request: NextRequest,
  params: Promise<{ systemName: string; path: string[] }>,
) {
  const { systemName, path } = await params
  const suffix = path.map(encodeURIComponent).join("/")
  const query = request.nextUrl.search
  const url = `${getBackendBaseUrl()}/api/operational-map/${encodeURIComponent(systemName)}/${suffix}${query}`
  try {
    const headers = OPERATIONAL_SECRET_PREFIXES.has(path[0])
      ? approvalBackendHeaders()
      : { "Content-Type": "application/json" }
    const response = await fetch(url, {
      method: request.method,
      headers,
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
