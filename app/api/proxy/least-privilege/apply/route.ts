// app/api/proxy/least-privilege/apply/route.ts
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const RAW_BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend.onrender.com"

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
        success: raw.success ?? true,
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
