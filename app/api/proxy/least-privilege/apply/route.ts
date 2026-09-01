// app/api/proxy/least-privilege/apply/route.ts
import { NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const RAW_BACKEND_URL =
  getBackendBaseUrl()

function getBackendBase() {
  return RAW_BACKEND_URL.replace(/\/+$/, "").replace(/\/backend$/, "")
}

// POST /api/proxy/least-privilege/apply
// body: { systemName: string, planId?: string }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const { systemName, planId } = body || {}

  if (!systemName) {
    return NextResponse.json(
      { success: false, error: "systemName is required" },
      { status: 400 },
    )
  }

  const base = getBackendBase()
  const backendUrl = base + "/api/least-privilege/apply"

  try {
    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ systemName, planId }),
    })

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: "Backend apply failed: " + res.status },
        { status: res.status },
      )
    }

    const raw = await res.json()

    return NextResponse.json(
      {
        // A 200 with no `success` field is not a successful apply. This is
        // a MUTATION path: `?? true` reported a permission removal as
        // applied whenever the backend omitted the field, which is the one
        // place a default must never be optimistic.
        success: raw.success === true,
        systemName,
        roleName: raw.roleName ?? "",
        checkpoint: raw.checkpoint ?? "",
        applied: raw.applied ?? 0,
      },
      { status: 200 },
    )
  } catch (err: any) {
    console.error("[proxy] least-privilege apply error:", err)
    return NextResponse.json(
      {
        success: false,
        error: err?.message ?? "apply failed",
      },
      { status: 500 },
    )
  }
}
