import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> }
) {
  const { systemName } = await params
  const { searchParams } = new URL(req.url)
  const maxJewels = searchParams.get("max_jewels") || "12"
  // Default bumped 3 → 8 to match backend default; surfaces more paths
  // per crown jewel (was 12 jewels × 3 paths = 36 max; now up to 96).
  const maxPathsPerJewel = searchParams.get("max_paths_per_jewel") || "8"
  const envelope = searchParams.get("envelope") === "true" ? "true" : ""
  // Stale toggle: when true, the backend includes historical (is_stale=true)
  // observed-behavior edges in the attack-path response. Default false so
  // the live view stays focused on recent activity.
  const includeStale = searchParams.get("include_stale") === "true" ? "true" : ""
  // Deleted toggle: when true, the backend includes soft-deleted nodes
  // (is_active=false — resources the last successful collector run
  // confirmed absent from AWS). Default false so zombies stay hidden.
  const includeDeleted = searchParams.get("include_deleted") === "true" ? "true" : ""

  try {
    const envelopeParam = envelope ? `&envelope=${envelope}` : ""
    const staleParam = includeStale ? `&include_stale=${includeStale}` : ""
    const deletedParam = includeDeleted ? `&include_deleted=${includeDeleted}` : ""
    const query = `?max_jewels=${maxJewels}&max_paths_per_jewel=${maxPathsPerJewel}${envelopeParam}${staleParam}${deletedParam}`
    const url = `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(systemName)}${query}`
    console.log("[identity-attack-paths] Fetching:", url)
    const res = await fetch(
      `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(systemName)}${query}`,
      {
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(55000),
      }
    )
    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status }
      )
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch identity attack paths" },
      { status: 502 }
    )
  }
}
