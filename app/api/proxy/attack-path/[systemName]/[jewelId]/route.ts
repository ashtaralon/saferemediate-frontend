import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  buildIapIdentityAttackPathsQuery,
  IAP_PROXY_DEFAULT_LATERAL_CAP,
} from "@/lib/server/iap-proxy-query"
import { getCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"
import { backendNodeId } from "@/lib/iap-node-id"
import { jewelIdsMatch, normalizeJewelArn } from "@/lib/server/normalize-jewel-id"

// =============================================================================
// Unified Attack Path facade — strangler-pattern endpoint
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

interface AttackPathPostBody {
  path_id: string
  path?: IdentityPath
  jewel?: { id: string; name: string; type: string; path_count: number }
  sibling_paths?: Array<{
    id: string
    hop_count: number
    evidence_type: string
    severity: number | null
  }>
}

type BuildResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; response: NextResponse<FacadeError> }

async function fetchGraphView(
  systemName: string,
  selectedPath: IdentityPath,
  lateralCap: number,
): Promise<
  | { ok: true; graphResp: unknown }
  | { ok: false; response: NextResponse<FacadeError> }
> {
  const nodeIds = selectedPath.nodes.map((n) => backendNodeId(n))
  const pathEdges = selectedPath.edges.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.type,
  }))

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
      `[attack-path facade] graph-view status=${res.status} latency_ms=${latencyMs} nodes=${nodeIds.length} cap=${lateralCap}`,
    )
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        ok: false,
        response: NextResponse.json<FacadeError>(
          {
            error: "graph_view_unavailable",
            detail: `backend ${res.status} ${text.slice(0, 300)}`,
          },
          { status: 502 },
        ),
      }
    }
    return { ok: true, graphResp: await res.json() }
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError"
    return {
      ok: false,
      response: NextResponse.json<FacadeError>(
        {
          error: isTimeout ? "graph_view_timeout" : "graph_view_proxy_error",
          detail: e?.message ?? String(err),
        },
        { status: 502 },
      ),
    }
  }
}

async function buildAttackPathPayload(
  systemName: string,
  jewelIdDecoded: string,
  pathId: string,
  lateralCap: number,
  opts?: {
    pathFromClient?: IdentityPath
    jewelFromClient?: AttackPathPostBody["jewel"]
    siblingPathsFromClient?: AttackPathPostBody["sibling_paths"]
  },
): Promise<BuildResult> {
  let selectedPath: IdentityPath | undefined = opts?.pathFromClient
  let jewel =
    opts?.jewelFromClient ??
    ({ id: jewelIdDecoded, name: jewelIdDecoded, type: "unknown", path_count: 0 } as const)
  let siblingPaths = opts?.siblingPathsFromClient

  if (!selectedPath || selectedPath.id !== pathId) {
    let identityResp: IdentityResponse
    try {
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
        return {
          ok: false,
          response: NextResponse.json<FacadeError>(
            { error: "identity_unavailable", detail: `backend ${res.status}` },
            { status: 502 },
          ),
        }
      }
      identityResp = (await res.json()) as IdentityResponse
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string }
      const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError"
      return {
        ok: false,
        response: NextResponse.json<FacadeError>(
          {
            error: isTimeout ? "identity_timeout" : "identity_proxy_error",
            detail: e?.message ?? String(err),
          },
          { status: 502 },
        ),
      }
    }

    selectedPath = (identityResp.paths ?? []).find(
      (p) =>
        (p.id === pathId || (p as { attack_path_id?: string }).attack_path_id === pathId) &&
        (jewelIdsMatch(p.crown_jewel_id, jewelIdDecoded) ||
          jewelIdsMatch(p.crown_jewel_id, jewel?.id ?? "") ||
          jewelIdsMatch(
            p.crown_jewel_id,
            (jewel as { canonical_id?: string })?.canonical_id ?? "",
          )),
    )
    if (!selectedPath) {
      return {
        ok: false,
        response: NextResponse.json<FacadeError>(
          {
            error: "path_not_found",
            detail: `No path with id=${pathId} jewel=${jewelIdDecoded} in system ${systemName}`,
          },
          { status: 404 },
        ),
      }
    }

    jewel =
      (identityResp.crown_jewels ?? []).find(
        (j) =>
          jewelIdsMatch(j.id, jewelIdDecoded) ||
          jewelIdsMatch((j as { canonical_id?: string }).canonical_id ?? "", jewelIdDecoded),
      ) ?? jewel

    const jewelIds = new Set(
      [jewelIdDecoded, jewel.id, (jewel as { canonical_id?: string }).canonical_id]
        .filter(Boolean)
        .flatMap((id) => [id!, normalizeJewelArn(id!)]) as string[],
    )
    siblingPaths = (identityResp.paths ?? [])
      .filter((p) => jewelIds.has(p.crown_jewel_id) || jewelIds.has(normalizeJewelArn(p.crown_jewel_id)))
      .map((p) => ({
        id: p.id,
        hop_count: p.hop_count ?? p.nodes.length,
        evidence_type: p.evidence_type ?? "configured",
        severity:
          typeof (p.severity as { score?: number })?.score === "number"
            ? (p.severity as { score: number }).score
            : null,
      }))
  } else {
    console.log(
      `[attack-path facade] skip_identity=1 path=${pathId} nodes=${selectedPath.nodes.length}`,
    )
    if (!siblingPaths) {
      siblingPaths = []
    }
  }

  const graph = await fetchGraphView(systemName, selectedPath, lateralCap)
  if (!graph.ok) {
    return graph
  }

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
    hops: {
      nodes: selectedPath.nodes,
      edges: selectedPath.edges,
    },
    canvas: graph.graphResp,
    sibling_paths: siblingPaths,
  }

  return { ok: true, payload }
}

async function handleAttackPath(
  req: NextRequest,
  systemName: string,
  jewelId: string,
  pathId: string,
  lateralCap: number,
  postBody?: AttackPathPostBody,
) {
  const jewelIdDecoded = normalizeJewelArn(decodeURIComponent(jewelId))
  const useClient =
    postBody?.path &&
    postBody.path_id === pathId &&
    jewelIdsMatch(postBody.path.crown_jewel_id, jewelIdDecoded)

  const cacheKey = `attack-path:${systemName}:${jewelIdDecoded}:${pathId}:${lateralCap}:${useClient ? "page" : "iap"}`
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  }

  const built = await buildAttackPathPayload(
    systemName,
    jewelIdDecoded,
    pathId,
    lateralCap,
    useClient
      ? {
          pathFromClient: postBody!.path,
          jewelFromClient: postBody!.jewel,
          siblingPathsFromClient: postBody!.sibling_paths,
        }
      : undefined,
  )

  if (!built.ok) {
    return built.response
  }

  setCached(cacheKey, built.payload, TTL_STD)
  return NextResponse.json(built.payload, {
    headers: {
      "X-Cache": "MISS",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string; jewelId: string }> },
) {
  const { systemName, jewelId } = await params
  const { searchParams } = new URL(req.url)
  const pathId = searchParams.get("path_id")
  const lateralCap = Number(
    searchParams.get("lateral_cap") || String(IAP_PROXY_DEFAULT_LATERAL_CAP),
  )

  if (!pathId) {
    return NextResponse.json<FacadeError>(
      { error: "missing_path_id", detail: "?path_id=<id> is required" },
      { status: 400 },
    )
  }

  return handleAttackPath(req, systemName, jewelId, pathId, lateralCap)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string; jewelId: string }> },
) {
  const { systemName, jewelId } = await params
  const { searchParams } = new URL(req.url)
  const pathId = searchParams.get("path_id")
  const lateralCap = Number(
    searchParams.get("lateral_cap") || String(IAP_PROXY_DEFAULT_LATERAL_CAP),
  )

  if (!pathId) {
    return NextResponse.json<FacadeError>(
      { error: "missing_path_id", detail: "?path_id=<id> is required" },
      { status: 400 },
    )
  }

  let body: AttackPathPostBody
  try {
    body = (await req.json()) as AttackPathPostBody
  } catch {
    return NextResponse.json<FacadeError>(
      { error: "invalid_body", detail: "JSON body required" },
      { status: 400 },
    )
  }

  if (body.path_id && body.path_id !== pathId) {
    return NextResponse.json<FacadeError>(
      { error: "path_id_mismatch", detail: "body.path_id must match query path_id" },
      { status: 400 },
    )
  }

  return handleAttackPath(req, systemName, jewelId, pathId, lateralCap, body)
}
