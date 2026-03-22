import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function POST(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/identities/sync`, {
      method: "POST",
      cache: "no-store",
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: "Backend unavailable", detail: error.message }, { status: 503 })
  }
}
