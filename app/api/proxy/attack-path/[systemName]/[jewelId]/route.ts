import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { buildIapIdentityAttackPathsQuery } from "@/lib/server/iap-proxy-query"
import { getCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"
import { backendNodeId } from "@/lib/iap-node-id"

// =============================================================================
// Unified Attack Path facade — strangler-pattern endpoint
// =============================================================================
//
// One frontend call, one payload. Internally fans out to the two existing
// backend endpoints and joins on path_id server-side, so the merged
// `AttackPath` tab can read from a single source of truth at the FE
// boundary. When the backend ships a proper unified Cypher query, this
// facade becomes a thin pass-through and the FE doesn't change.
//
// Sources fanned out:
//   1. GET  /api/identity-attack-paths/<system>?enriched=true&envelope=true
//      → IdentityAttackPathsResponse: contains crown_jewels[] and paths[]
//        with metadata (severity, evidence_type, damage_narrative,
//        reduction_narrative, risk_reduction, target_blast_radius) +
//        per-path nodes[] / edges[].
//   2. POST /api/attack-chain/graph-view
//      Body: { system_name, node_ids, path_edges, lateral_cap_per_node }
//      → GraphViewResponse: raw Neo4j node properties + lateral fan-outs
//        per node (used by the Attacker-View canvas for on-path vs
//        lateral edge distinction, hover provenance, VPCE→Bucket dashed
//        edges).
//
// The selected path is located by path_id (query param) inside response 1.
// Its nodes + edges become the input to call 2.
//
// Output: AttackPathPayload — the merged shape consumed by AttackPathPanel.
// =============================================================================

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

interface PathEdgeLite {
  source: string
  target: string
  type: string
  label?: string
  port?: number | null
  protocol?: string | null
  is_observed?: boolean
  traffic_bytes?: number
  hit_count?: number
}

interface PathNodeLite {
  id: string
  type?: string
  label?: string
  name?: string
  [k: string]: unknown
}

interface IdentityPath {
  id: string
  crown_jewel_id: string
  nodes: PathNodeLite[]
  edges: PathEdgeLite[]
  severity?: unknown
  path_kind?: string
  evidence_type?: "observed" | "configured"
  hop_count?: number
  risk_reduction?: unknown
  target_blast_radius?: unknown
  path_kind_tag?: string
  damage_capability?: unknown
  damage_narrative?: string | null
  reduction_narrative?: string | null
  reachable_neighbors?: unknown
}

interface IdentityResponse {
  system_name: string
  paths?: IdentityPath[]
  crown_jewels?: Array<{ id: string; name: string; type: string; path_count: number }>
}

interface FacadeError {
  error: string
  detail?: string
}

// =============================================================================
// GET /api/proxy/attack-path/<systemName>/<jewelId>?path_id=<id>
// =============================================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string; jewelId: string }> },
) {
  const { systemName, jewelId } = await params
  const { searchParams } = new URL(req.url)
  const pathId = searchParams.get("path_id")
  const lateralCap = Number(searchParams.get("lateral_cap") || "200")
  // Decoded once — params come URL-encoded for jewel ARNs.
  const jewelIdDecoded = decodeURIComponent(jewelId)

  if (!pathId) {
    return NextResponse.json<FacadeError>(
      { error: "missing_path_id", detail: "?path_id=<id> is required" },
      { status: 400 },
    )
  }

  const cacheKey = `attack-path:${systemName}:${jewelIdDecoded}:${pathId}:${lateralCap}`
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        // Match the underlying identity-attack-paths edge-cache window.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  }

  // -----------------------------------------------------------------------
  // Step 1: pull the full identity-attack-paths response and locate the
  // selected path within it. Backend supports `path_id` query so we don't
  // have to filter client-side, but the param hasn't been wired yet —
  // for now we pull all jewels for the system (cheap when cached) and
  // pick the matching path. TODO: switch to single-path API once shipped.
  // -----------------------------------------------------------------------
  let identityResp: IdentityResponse
  try {
    // No envelope — facade just needs paths/crown_jewels at the top
    // level. envelope=true wraps in { provenance, result } which the
    // page-level fetch unwraps; for our internal join we skip it.
    // 8×8 — same backend cache key as the page-level identity-attack-paths
    // proxy (defaults). 12×12 was a guaranteed Redis miss on every path click.
    const url =
      `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(systemName)}` +
      buildIapIdentityAttackPathsQuery({ enriched: true })
    const t0 = Date.now()
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    })
    const latencyMs = Date.now() - t0
    console.log(
      `[attack-path facade] identity status=${res.status} latency_ms=${latencyMs} system=${systemName} jewel=${jewelIdDecoded.slice(0, 64)}`,
    )
    if (!res.ok) {
      return NextResponse.json<FacadeError>(
        { error: "identity_unavailable", detail: `backend ${res.status}` },
        { status: 502 },
      )
    }
    identityResp = (await res.json()) as IdentityResponse
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError"
    return NextResponse.json<FacadeError>(
      {
        error: isTimeout ? "identity_timeout" : "identity_proxy_error",
        detail: e?.message ?? String(err),
      },
      { status: 502 },
    )
  }

  const selectedPath = (identityResp.paths ?? []).find(
    (p) => p.id === pathId && p.crown_jewel_id === jewelIdDecoded,
  )
  if (!selectedPath) {
    return NextResponse.json<FacadeError>(
      {
        error: "path_not_found",
        detail: `No path with id=${pathId} jewel=${jewelIdDecoded} in system ${systemName}`,
      },
      { status: 404 },
    )
  }

  // Jewel summary block used by the breadcrumb + closure card.
  const jewel = (identityResp.crown_jewels ?? []).find(
    (j) => j.id === jewelIdDecoded,
  ) ?? { id: jewelIdDecoded, name: jewelIdDecoded, type: "unknown", path_count: 0 }

  // The path-selector dropdown needs the sibling-path list (other paths
  // to the same jewel).
  const siblingPaths = (identityResp.paths ?? [])
    .filter((p) => p.crown_jewel_id === jewelIdDecoded)
    .map((p) => ({
      id: p.id,
      hop_count: p.hop_count ?? p.nodes.length,
      evidence_type: p.evidence_type ?? "configured",
      severity:
        // Pull the overall severity score if present; tolerate either shape.
        typeof (p.severity as { score?: number })?.score === "number"
          ? (p.severity as { score: number }).score
          : null,
    }))

  // -----------------------------------------------------------------------
  // Step 2: POST the selected path's nodes + edges to graph-view to get
  // the rich canvas data (lateral fan-outs, on_path flags, provenance).
  // -----------------------------------------------------------------------
  const nodeIds = selectedPath.nodes.map((n) => backendNodeId(n))
  const pathEdges = selectedPath.edges.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.type,
  }))

  let graphResp: unknown
  try {
    const t0 = Date.now()
    const res = await fetch(`${BACKEND_URL}/api/attack-chain/graph-view`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        system_name: systemName,
        node_ids: nodeIds,
        path_edges: pathEdges,
        lateral_cap_per_node: lateralCap,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    })
    const latencyMs = Date.now() - t0
    console.log(
      `[attack-path facade] graph-view status=${res.status} latency_ms=${latencyMs} nodes=${nodeIds.length}`,
    )
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return NextResponse.json<FacadeError>(
        {
          error: "graph_view_unavailable",
          detail: `backend ${res.status} ${text.slice(0, 300)}`,
        },
        { status: 502 },
      )
    }
    graphResp = await res.json()
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError"
    return NextResponse.json<FacadeError>(
      {
        error: isTimeout ? "graph_view_timeout" : "graph_view_proxy_error",
        detail: e?.message ?? String(err),
      },
      { status: 502 },
    )
  }

  // -----------------------------------------------------------------------
  // Step 3: assemble the unified payload. Field shape mirrors
  // AttackPathPayload in lib/types.ts (the FE consumer reads only this).
  // -----------------------------------------------------------------------
  const payload = {
    path_id: selectedPath.id,
    system_name: systemName,
    jewel,
    severity: selectedPath.severity ?? null,
    evidence_type: selectedPath.evidence_type ?? null,
    hop_count: selectedPath.hop_count ?? selectedPath.nodes.length,
    path_kind: selectedPath.path_kind ?? null,
    path_kind_tag: selectedPath.path_kind_tag ?? null,
    damage_capability: selectedPath.damage_capability ?? null,
    damage_narrative: selectedPath.damage_narrative ?? null,
    reduction_narrative: selectedPath.reduction_narrative ?? null,
    risk_reduction: selectedPath.risk_reduction ?? null,
    target_blast_radius: selectedPath.target_blast_radius ?? null,
    reachable_neighbors: selectedPath.reachable_neighbors ?? null,
    // hops = nodes + edges from the identity response (drives the
    // breadcrumb in the header and the on-path overlay on the canvas).
    hops: {
      nodes: selectedPath.nodes,
      edges: selectedPath.edges,
    },
    // canvas = raw graph-view response (drives the 9-lane Attacker-View
    // canvas: lateral fan-outs, on_path/lateral distinction, hover
    // provenance, VPCE→Bucket inferred edge).
    canvas: graphResp,
    sibling_paths: siblingPaths,
  }

  setCached(cacheKey, payload, TTL_STD)
  return NextResponse.json(payload, {
    headers: {
      "X-Cache": "MISS",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  })
}
