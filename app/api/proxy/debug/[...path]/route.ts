import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

async function forwardDebugRequest(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  method: "GET" | "POST"
) {
  const { path } = await context.params

  if (!path || path.length === 0) {
    return NextResponse.json({ error: "Debug path is required" }, { status: 400 })
  }

  const incomingUrl = new URL(req.url)
  const backendUrl = new URL(`${BACKEND_URL}/api/debug/${path.join("/")}`)
  backendUrl.search = incomingUrl.search

  const response = await fetch(backendUrl.toString(), {
    method,
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
      Accept: req.headers.get("accept") || "application/json",
    },
    body: method === "POST" ? await req.text() : undefined,
    cache: "no-store",
  })

  const text = await response.text()

  return new NextResponse(text, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") || "application/json",
    },
  })
}

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    return await forwardDebugRequest(req, context, "GET")
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to proxy debug request" },
      { status: 502 }
    )
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    return await forwardDebugRequest(req, context, "POST")
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to proxy debug request" },
      { status: 502 }
    )
  }
}
