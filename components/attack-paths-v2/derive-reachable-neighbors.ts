// Derive "lateral reach" (other resources each role on the path can also
// touch) from the facade's graph-view canvas.
//
// WHY THIS EXISTS: the per-system IAP list computes reachable_neighbors against
// the dependency-map edge projection, which does not always carry the
// behavioral edges the computation keys on — so list paths can arrive with
// reachable_neighbors === [] even for roles with real fan-out. The facade's
// graph-view canvas DOES carry the per-node lateral fan-out (laterals_by_node,
// cap 200, with observed/significance), so it's the reliable real-data source.
//
// NO MOCK DATA. Every neighbor is a real lateral edge from the canvas. If a role
// has no qualifying out-edges, it contributes nothing (no invented reach).

import type {
  IdentityAttackPath,
  ReachableNeighbor,
  ReachableNeighborsByRole,
} from "@/components/identity-attack-paths/types"
import type { GraphViewResponse } from "./build-attacker-architecture"
import { friendlyResourceName, isOpaqueIamId } from "./friendly-names"

const ROLE_TYPES = new Set(["IAMRole", "IAMUser", "AccessKey", "InstanceProfile"])

// Edge significance classes that mean "this role reaches/touches the neighbor"
// (the lateral fan-out we want to surface). "control"/"misc" are topology noise.
const REACH_SIGNIFICANCE = new Set(["escalation", "data", "identity", "network", "forensic"])

const SKIP_TYPES = new Set(["", "?", "Unknown"])

const MAX_PER_ROLE = 25

export function deriveReachableNeighborsFromCanvas(
  path: IdentityAttackPath | null | undefined,
  canvas: GraphViewResponse | null | undefined,
): ReachableNeighborsByRole[] {
  if (!path || !canvas?.laterals_by_node) return []
  const pathNodes = path.nodes ?? []
  const onPathIds = new Set(pathNodes.map((n) => String(n.id)))
  const canvasNodeById = new Map(canvas.nodes.map((n) => [n.id, n]))
  const out: ReachableNeighborsByRole[] = []

  for (const node of pathNodes) {
    if (!ROLE_TYPES.has(String(node.type))) continue
    const roleId = String(node.id)
    const laterals = canvas.laterals_by_node[roleId] ?? []

    const targets = new Map<string, ReachableNeighbor & { _edges: Set<string> }>()
    for (const e of laterals) {
      if (e.direction !== "out") continue // resources the role REACHES (out)
      if (e.on_path) continue // already on the spine — not "other" reach
      if (!REACH_SIGNIFICANCE.has(e.significance)) continue
      const tid = String(e.neighbor_id || "")
      if (!tid || onPathIds.has(tid)) continue
      const ttype = String(e.neighbor_type || "")
      if (SKIP_TYPES.has(ttype)) continue

      const existing = targets.get(tid)
      if (existing) {
        existing._edges.add(e.type)
        existing.edge_count += 1
      } else {
        targets.set(tid, {
          id: tid,
          name: e.neighbor_name || tid,
          type: ttype,
          is_internet_exposed: Boolean(
            canvasNodeById.get(tid)?.key_properties?.is_internet_exposed,
          ),
          edge_types: [],
          edge_count: 1,
          _edges: new Set([e.type]),
        })
      }
    }
    if (targets.size === 0) continue

    const neighbors: ReachableNeighbor[] = [...targets.values()]
      .sort((a, b) => b.edge_count - a.edge_count)
      .slice(0, MAX_PER_ROLE)
      .map(({ _edges, ...n }) => ({ ...n, edge_types: [..._edges].sort() }))

    const by_type: Record<string, number> = {}
    for (const n of neighbors) by_type[n.type] = (by_type[n.type] ?? 0) + 1

    // Resolve a human role name (BE-8). The path/canvas node id is often an
    // opaque AROA…; the lateral header was leaking it because the friendly-name
    // fix only covered the map. Resolution order, preferring the most specific
    // real name before degrading to the generic type:
    //   1. path node name (when not an opaque id)
    //   2. canvas node name (when not an opaque id)
    //   3. canvas node key_properties.arn → last segment — this is where the
    //      real role name lives (`…role/alon-demo-ec2-role`) when both ids are
    //      AROA; same field build-attacker-architecture trusts for the canvas.
    //   4. the path's damage role name (per-path, less node-specific)
    //   5. generic type fallback ("assumed role") — honest last resort.
    const canvasNode = canvasNodeById.get(roleId)
    const canvasName = canvasNode?.name
    const canvasArn =
      typeof canvasNode?.key_properties?.arn === "string"
        ? (canvasNode.key_properties.arn as string)
        : null
    const roleName =
      (!isOpaqueIamId(node.name) &&
        node.name &&
        friendlyResourceName(node.name, String(node.type))) ||
      (!isOpaqueIamId(canvasName) &&
        canvasName &&
        friendlyResourceName(canvasName, String(node.type))) ||
      (canvasArn && friendlyResourceName(canvasArn, String(node.type))) ||
      path.damage_capability?.role_name ||
      friendlyResourceName(node.name, String(node.type))

    out.push({
      role_id: roleId,
      role_name: roleName || undefined,
      neighbor_count: targets.size,
      neighbors_returned: neighbors.length,
      by_type,
      neighbors,
    })
  }

  return out
}
