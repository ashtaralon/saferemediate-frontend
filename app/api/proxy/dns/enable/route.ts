import { NextRequest, NextResponse } from "next/server"

// Vercel proxy for POST /api/dns/enable — creates Route 53 Resolver
// Query Log configs + associations for the requested VPCs. Operator-
// driven write action — never cached.

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  try {
    const url = `${BACKEND_URL}/api/dns/enable`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    })
    const text = await res.text()
    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, detail: text },
        { status: res.status },
      )
    }
    return NextResponse.json(text ? JSON.parse(text) : {})
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to enable DNS visibility" },
      { status: 502 },
    )
  }
}
