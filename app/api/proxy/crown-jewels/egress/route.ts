import { NextRequest, NextResponse } from "next/server"

// Crown Jewel Egress proxy — read-side endpoint that returns each
// crown jewel's CloudTrail-observed readers + each reader's egress
// topology + the account-scope inspection-layer fact (whether AWS
// Network Firewall / WAFv2 is deployed at all).
//
// Mirrors the egress visibility proxy pattern: BACKEND_URL_OVERRIDE
// for local dev, BACKEND_URL fallback, Render in prod. Same 55s
// abort window — the crown-jewel cypher is a single query so cold-
// path is fast, but the inspection-layer count adds 3-4 small reads
// that can spike on cold Aura.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  process.env.BACKEND_URL ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const systemName = searchParams.get("systemName") || ""
  const lookbackDays = searchParams.get("lookbackDays") || "30"
  const maxJewels = searchParams.get("maxJewels") || "20"
  if (!systemName) {
    return NextResponse.json({ error: "systemName required" }, { status: 400 })
  }
  try {
    const url = `${BACKEND_URL}/api/crown-jewels/egress?systemName=${encodeURIComponent(
      systemName,
    )}&lookbackDays=${lookbackDays}&maxJewels=${maxJewels}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(55000),
    })
    const text = await res.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      json = { error: "Non-JSON response from backend", raw: text.slice(0, 500) }
    }
    return NextResponse.json(json, { status: res.status })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch crown-jewel egress" },
      { status: err?.name === "AbortError" ? 504 : 502 },
    )
  }
}
