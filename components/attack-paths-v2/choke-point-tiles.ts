/**
 * Zoom 0 choke-point tiles (PRD-attacker-lens-three-zoom S2).
 *
 * When path count exceeds CHOKE_TILE_THRESHOLD, fan-in collapses to tiles
 * instead of N spaghetti edges. Expand one tile at a time.
 */

import type { CrownJewelConvergence, ConvergencePath } from "@/lib/attack-paths/convergence-types"

/** Spec default — collapse fan-in edges above this path count. */
export const CHOKE_TILE_THRESHOLD = 12

export type ChokeTileKind =
  | "public_entries"
  | "identity_chokes"
  | "network_chokes"
  | "data_plane_gates"
  | "crown_jewel"

export interface ChokeTileMember {
  id: string
  label: string
  /** Paths that touch this choke member. */
  pathIds: string[]
  count: number
}

export interface ChokeTile {
  kind: ChokeTileKind
  title: string
  count: number
  subtitle: string
  members: ChokeTileMember[]
}

const PUBLIC_KIND_RE =
  /alb|load.?balancer|igw|internet|gateway|public|imds|exposed|api.?gateway/i
const NETWORK_TYPE_RE =
  /subnet|security.?group|nacl|networkacl|vpc|vpce|route|nat|igw|eni|network.?interface/i

function shortLabel(raw: string): string {
  const s = raw.trim()
  if (!s) return "—"
  const role = /[:/]role\/([^/]+)$/.exec(s)
  if (role) return role[1]
  const last = s.split("/").pop() || s
  return last.length > 36 ? `${last.slice(0, 16)}…${last.slice(-12)}` : last
}

function bump(
  map: Map<string, ChokeTileMember>,
  id: string,
  label: string,
  pathId: string,
): void {
  const key = id || label
  const cur = map.get(key)
  if (cur) {
    if (!cur.pathIds.includes(pathId)) cur.pathIds.push(pathId)
    cur.count = cur.pathIds.length
  } else {
    map.set(key, { id: key, label: shortLabel(label || key), pathIds: [pathId], count: 1 })
  }
}

function membersOf(map: Map<string, ChokeTileMember>): ChokeTileMember[] {
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function tileSubtitle(members: ChokeTileMember[], fallback: string): string {
  if (members.length === 0) return fallback
  return members
    .slice(0, 3)
    .map((m) => m.label)
    .join(" · ")
}

/** True when fan-in should prefer tiles over full multi-path edge draw. */
export function shouldCollapseToChokeTiles(
  pathCount: number,
  threshold: number = CHOKE_TILE_THRESHOLD,
): boolean {
  return pathCount > threshold
}

/**
 * Compile five choke tiles from a crown-jewel convergence payload.
 * Always returns all five kinds (count may be 0 for empty groups).
 */
export function compileChokePointTiles(data: CrownJewelConvergence): ChokeTile[] {
  const publicMap = new Map<string, ChokeTileMember>()
  const identityMap = new Map<string, ChokeTileMember>()
  const networkMap = new Map<string, ChokeTileMember>()
  const dataMap = new Map<string, ChokeTileMember>()

  for (const p of data.paths) {
    classifyPathIntoMaps(p, publicMap, identityMap, networkMap, dataMap)
  }

  // Identity choke_points from API (role ARNs → path counts) enrich the map.
  for (const [id, n] of Object.entries(data.choke_points || {})) {
    if (!id) continue
    const cur = identityMap.get(id)
    if (cur) {
      cur.count = Math.max(cur.count, n)
    } else {
      identityMap.set(id, {
        id,
        label: shortLabel(id),
        pathIds: [],
        count: n,
      })
    }
  }

  const publicMembers = membersOf(publicMap)
  const identityMembers = membersOf(identityMap)
  // Shared identity chokes = identities on ≥2 paths (or choke_points count ≥2).
  const sharedIdentity = identityMembers.filter((m) => m.count >= 2)
  const identityForTile = sharedIdentity.length > 0 ? sharedIdentity : identityMembers
  const networkMembers = membersOf(networkMap)
  const dataMembers = membersOf(dataMap)

  const jewelId = data.cj_arn || data.cj_name || "crown-jewel"
  const jewelLabel = data.cj_name || shortLabel(jewelId)

  return [
    {
      kind: "public_entries",
      title: "Public entries",
      count: publicMembers.length,
      subtitle: tileSubtitle(publicMembers, "no public entry classified"),
      members: publicMembers,
    },
    {
      kind: "identity_chokes",
      title: "Identity chokes",
      count: identityForTile.length,
      subtitle: tileSubtitle(identityForTile, "no shared identity"),
      members: identityForTile,
    },
    {
      kind: "network_chokes",
      title: "Network chokes",
      count: networkMembers.length,
      subtitle: tileSubtitle(networkMembers, "no network choke"),
      members: networkMembers,
    },
    {
      kind: "data_plane_gates",
      title: "Data-plane gates",
      count: dataMembers.length,
      subtitle: tileSubtitle(dataMembers, "no data-plane signal"),
      members: dataMembers,
    },
    {
      kind: "crown_jewel",
      title: "Crown jewel",
      count: 1,
      subtitle: jewelLabel,
      members: [
        {
          id: jewelId,
          label: jewelLabel,
          pathIds: data.paths.map((p) => p.path_id),
          count: data.paths_total || data.paths.length,
        },
      ],
    },
  ]
}

function classifyPathIntoMaps(
  p: ConvergencePath,
  publicMap: Map<string, ChokeTileMember>,
  identityMap: Map<string, ChokeTileMember>,
  networkMap: Map<string, ChokeTileMember>,
  dataMap: Map<string, ChokeTileMember>,
): void {
  const pathId = p.path_id

  if (p.source && PUBLIC_KIND_RE.test(p.source_kind || p.source)) {
    bump(publicMap, p.workload_arn || p.source, p.source, pathId)
  } else if (p.source_kind && PUBLIC_KIND_RE.test(p.source_kind)) {
    bump(publicMap, p.workload_arn || p.source || p.source_kind, p.source || p.source_kind, pathId)
  }

  // Initial-access categories that imply a public / exposed entry.
  for (const ia of p.initial_access || []) {
    if (/EXPOSED|IMDS|LEAKED|PUBLIC|CROSS_ACCOUNT/i.test(ia.category || "")) {
      const id = ia.pivot_node_id || ia.category
      bump(publicMap, id, ia.pivot_name || ia.category, pathId)
    }
  }

  if (p.identity) {
    bump(identityMap, p.identity, p.identity_name || p.identity, pathId)
  }

  for (const hop of p.hops || []) {
    if (hop.is_crown_jewel) continue
    const id = hop.node_id
    const label = hop.name || hop.node_id
    if (hop.plane === "identity" || /iamrole|instance.?profile/i.test(hop.node_type)) {
      bump(identityMap, id, label, pathId)
    } else if (
      hop.plane === "network" ||
      NETWORK_TYPE_RE.test(hop.node_type) ||
      hop.subnet_public === true ||
      (hop.security_groups && hop.security_groups.length > 0)
    ) {
      if (hop.subnet_public === true && hop.plane === "network") {
        bump(publicMap, id, label, pathId)
      }
      if (NETWORK_TYPE_RE.test(hop.node_type) || (hop.security_groups?.length ?? 0) > 0) {
        bump(networkMap, id, label, pathId)
      }
    } else if (hop.plane === "data") {
      bump(dataMap, id, label, pathId)
    }
  }

  // Data-plane gate proxy: confidence / damage on the path itself.
  if ((p.damage && p.damage.length > 0) || p.confidence) {
    const gateId = `${p.confidence || "config"}:${(p.damage || []).slice(0, 2).join(",") || "access"}`
    bump(
      dataMap,
      gateId,
      p.confidence === "observed" ? "observed access" : "config-allowed access",
      pathId,
    )
  }
}

/** Path ids to highlight when a tile (or member) is expanded. */
export function pathIdsForChokeSelection(
  tile: ChokeTile | null,
  memberId: string | null,
): string[] | null {
  if (!tile) return null
  if (memberId) {
    const m = tile.members.find((x) => x.id === memberId)
    return m ? m.pathIds : []
  }
  const ids = new Set<string>()
  for (const m of tile.members) {
    for (const pid of m.pathIds) ids.add(pid)
  }
  return Array.from(ids)
}
