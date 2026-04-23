// app/api/proxy/least-privilege/simulate-fix/route.ts
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const RAW_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

function getBackendBase() {
  return RAW_BACKEND_URL.replace(/\/+$/, "").replace(/\/backend$/, "")
}

// POST /api/proxy/least-privilege/simulate-fix
// body: { resource_type: string, resource_id: string, system_name: string }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const { resource_type, resource_id, system_name } = body

  if (!resource_type || !resource_id || !system_name) {
    return NextResponse.json(
      { success: false, error: "resource_type, resource_id, and system_name are required" },
      { status: 400 },
    )
  }

  const base = getBackendBase()
  const backendUrl = base + "/api/least-privilege/simulate-fix"

  try {
    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ resource_type, resource_id, system_name }),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      return NextResponse.json(
        { success: false, error: errorData.detail || `Backend simulate-fix failed: ${res.status}` },
        { status: res.status },
      )
    }

    const data = await res.json()
    return NextResponse.json(data, { status: 200 })
  } catch (err: any) {
    console.error("[proxy] least-privilege simulate-fix error:", err)
    return NextResponse.json(
      {
        success: false,
        error: err?.message ?? "simulate-fix failed",
      },
      { status: 500 },
    )
  }
}
