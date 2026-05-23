/**
 * Frontend mirror of api/_workload_filters.py — the single source of
 * truth for "is this node renderable on a path."
 *
 * Why this exists
 * ---------------
 * The backend ships a centralized is_active filter (commits 7c0c1f1
 * through a41c1c7) that drops phantom workloads/jewels at the API
 * boundary. That filter is correct for live API responses. But the
 * frontend serves CACHED IAP responses from localStorage when the
 * backend returns 5xx (useCachedFetch's stale-while-revalidate). A
 * cached response from before the backend hardening can contain
 * phantom nodes the freshly-deployed backend would never emit.
 *
 * This module is the client-side gate that runs at render time on
 * EVERY IAP response — fresh or cached — so the phantom-leak surface
 * is closed regardless of cache age.
 *
 * Apply at every path-list render site. The lint guard
 * (eslint-no-raw-path-rendering, ./eslint/no-raw-path-render.js)
 * fails the build if a new component renders an IdentityAttackPath[]
 * without first passing it through filterActivePaths.
 *
 * Memory: feedback_fix_model_not_paths.md (model-level central filter,
 * not per-strategy patches) — same lesson, applied to the frontend
 * surface. The variant lesson is in
 * feedback_frontend_cache_can_serve_stale_phantoms.md.
 */

/** Shape of a node within a path's `nodes` array, as returned by IAP. */
export interface PathNodeLike {
  id?: string | null
  type?: string | null
  is_active?: boolean | null
  [key: string]: unknown
}

/** Shape of an attack path returned by IAP. */
export interface AttackPathLike {
  id?: string
  nodes?: PathNodeLike[]
  [key: string]: unknown
}

/**
 * Return true iff the node is renderable as a path participant.
 *
 * - `is_active=false` → drop (explicitly soft-deleted)
 * - `is_active=null` / missing → keep (backward-compat with collectors
 *   that pre-date the field; standard coalesce convention)
 * - `is_active=true` → keep
 *
 * Optional `staleIds` set is the dual-label defense — when the dict's
 * own is_active was stripped or never set but the node's id matches a
 * known-stale resource from the server's stale-set, drop it anyway.
 * This mirrors the backend's `compute_stale_resource_ids` set.
 */
export function isActiveNode(
  node: PathNodeLike | undefined | null,
  staleIds?: ReadonlySet<string>,
): boolean {
  if (!node || typeof node !== "object") return false
  if (node.is_active === false) return false
  if (staleIds && node.id && staleIds.has(String(node.id))) return false
  return true
}

/**
 * Return only the paths whose nodes are ALL active. A single
 * is_active=false (or stale-id) node disqualifies the entire path —
 * the chain is broken if any link is soft-deleted.
 *
 * Drops are logged to console.warn so a developer testing locally
 * sees the filter firing. Production: silent.
 */
export function filterActivePaths<T extends AttackPathLike>(
  paths: T[] | undefined | null,
  staleIds?: ReadonlySet<string>,
): T[] {
  if (!paths || !Array.isArray(paths)) return []
  const kept: T[] = []
  const dropped: { id: string; reason: string }[] = []

  for (const path of paths) {
    const nodes = path.nodes ?? []
    const offender = nodes.find((n) => !isActiveNode(n, staleIds))
    if (offender) {
      dropped.push({
        id: String(path.id ?? "?"),
        reason: `node ${String(offender.id ?? "?")} is_active=${
          offender.is_active === false ? "false" : "via-stale-set"
        }`,
      })
      continue
    }
    kept.push(path)
  }

  if (
    dropped.length > 0 &&
    typeof window !== "undefined" &&
    process.env.NODE_ENV !== "production"
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      `[active-filters] dropped ${dropped.length} path(s) with stale workload(s):`,
      dropped,
    )
  }

  return kept
}

/**
 * Convenience: build a stale-id set from any node collection. Useful
 * for dep_map responses where every node carries is_active and the
 * caller wants to gate downstream lookups against a precomputed set.
 */
export function collectStaleIds(
  nodes: PathNodeLike[] | undefined | null,
): Set<string> {
  const out = new Set<string>()
  if (!nodes) return out
  for (const n of nodes) {
    if (n?.is_active === false && n.id) {
      out.add(String(n.id))
    }
  }
  return out
}
