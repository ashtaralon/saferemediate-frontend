import { NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 30

const BACKEND_URL = getBackendBaseUrl().replace(/\/+$/, "").replace(/\/backend$/, "")

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const { resource_type, resource_id, system_name, permissions_to_remove } = body
  if (
    resource_type !== "IAMRole"
    || !resource_id
    || !system_name
    || !Array.isArray(permissions_to_remove)
    || permissions_to_remove.length === 0
  ) {
    return NextResponse.json(
      { error: "IAMRole, resource_id, system_name, and a non-empty permission selection are required" },
      { status: 400 },
    )
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/least-privilege/break-glass-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        resource_type,
        resource_id,
        system_name,
        permissions_to_remove,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    return NextResponse.json(payload, { status: response.status })
  } catch (error: any) {
    const timedOut = error?.name === "AbortError" || error?.name === "TimeoutError"
    return NextResponse.json(
      { error: timedOut ? "Break-glass planning timed out" : (error?.message || "Break-glass planning failed") },
      { status: timedOut ? 504 : 502 },
    )
  }
}
