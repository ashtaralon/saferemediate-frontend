// app/api/proxy/least-privilege/simulate/route.ts
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

// POST /api/proxy/least-privilege/simulate
// body: { systemName: string }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const systemName: string | undefined = body.systemName

  if (!systemName) {
    return NextResponse.json(
      { success: false, error: "systemName is required" },
      { status: 400 },
    )
  }

  const base = getBackendBase()
  const backendUrl = base + "/api/least-privilege/simulate"

  try {
    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ systemName }),
    })

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: "Backend simulate failed: " + res.status },
        { status: res.status },
      )
    }

    const raw = await res.json()

    // normalize a bit
    return NextResponse.json(
      {
        success: raw.success ?? true,
        systemName,
        roleName: raw.roleName ?? raw.role_name ?? "",
        allowed: raw.allowed ?? [],
        used: raw.used ?? [],
        unused: raw.unused ?? [],
        confidence: raw.confidence ?? 99,
        plan: raw.plan ?? [],
        planId: raw.planId ?? raw.plan_id ?? null,
      },
      { status: 200 },
    )
  } catch (err: any) {
    console.error("[proxy] least-privilege simulate error:", err)
    return NextResponse.json(
      {
        success: false,
        error: err?.message ?? "simulate failed",
      },
      { status: 500 },
    )
  }
}
