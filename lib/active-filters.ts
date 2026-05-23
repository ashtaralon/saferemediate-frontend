/**
 * Frontend mirror of api/_workload_filters.py — the single source of
 * truth for "is this node renderable on a path."
 *
 * Why this exists
 * ---------------
 * The backend's centralized is_active filter (commits 7c0c1f1 through
 * a41c1c7) drops phantom workloads/jewels at the API boundary. That's
 * correct for live API responses. But useCachedFetch surfaces
 * localStorage-cached IAP responses on backend 5xx — including
 * payloads captured before backend hardening landed. The client-side
 * gate (filterActivePaths) runs at render time on EVERY response,
 * fresh or cached, closing that leak.
 *
 * Enforcement model
 * -----------------
 * Compile-time fact, not runtime heuristic. The output of
 * filterActivePaths is a branded type, `ActivePathList<T>`. Components
 * that render path data declare their prop as `ActivePathList<T>`
 * instead of `T[]`. The TypeScript compiler then proves at build time
 * that filterActivePaths was called — there is no other constructor
 * for the branded type. A future fetch site that forgets to call the
 * filter will fail to compile when it tries to pass a raw array to a
 * brand-typed prop.
 *
 * The only way to bypass is an explicit `as ActivePathList<T>` cast
 * — which is an obvious operator error, not a silent regression.
 *
 * Memory: feedback_fix_model_not_paths.md (central enforcement, not
 * per-strategy). The frontend variant is captured in
 * feedback_frontend_cache_can_serve_stale_phantoms.md.
 */

/** Minimal shape this module needs to read from a path node. Concrete
 *  shapes (PathNodeDetail, dep_map MapNode, etc.) satisfy this
 *  structurally without an explicit `extends`. */
export interface PathNodeLike {
  id?: string | null
  type?: string | null
  is_active?: boolean | null
}

/** Minimal shape this module needs from a path. Concrete shapes
 *  (IdentityAttackPath, AttackPath, etc.) satisfy this structurally.
 *  No `[key: string]: unknown` index signature — it conflicts with
 *  concrete interfaces that have typed extra fields. */
export interface AttackPathLike {
  id?: string
  nodes?: PathNodeLike[]
}

// ─── Branded type for compile-time enforcement ───────────────────────
//
// `unique symbol` declared but never assigned — exists only in the
// TypeScript type domain. At runtime, ActivePathList<T> is just T[];
// the brand is erased. Anyone trying to construct one without
// filterActivePaths needs an explicit `as` cast (caught by code
// review).
declare const __activeFiltered: unique symbol

/**
 * A path array that has been gated through filterActivePaths.
 *
 * Components rendering path data should declare their prop as
 * `ActivePathList<IdentityAttackPath>` rather than `IdentityAttackPath[]`.
 * Callers must then call filterActivePaths before passing the data
 * down. The compiler enforces this; no lint heuristic needed.
 */
export type ActivePathList<T extends AttackPathLike> = T[] & {
  readonly [__activeFiltered]: true
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
): ActivePathList<T> {
  if (!paths || !Array.isArray(paths)) return EMPTY_ACTIVE_LIST as ActivePathList<T>
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

  // The brand cast is the ONLY place where unverified data acquires
  // the ActivePathList shape. Every render site downstream then has
  // a compile-time guarantee that this function was called.
  return kept as unknown as ActivePathList<T>
}

// Shared empty list to avoid allocating a new empty array per call.
// Frozen so a consumer can't push into it (would corrupt the brand
// across renders).
const EMPTY_ACTIVE_LIST = Object.freeze([]) as unknown as ActivePathList<AttackPathLike>


/**
 * Narrow an already-branded list to a subset that still carries the
 * brand. Use this for derivations like "paths for the selected jewel"
 * — TypeScript's built-in `.filter()` returns a non-branded array, so
 * passing the result downstream would lose the compile-time proof.
 *
 * Safe by construction: filterActivePaths already gated the input;
 * `narrowActivePaths` only removes items, never adds. The output is
 * a strict subset of an already-gated set.
 */
export function narrowActivePaths<T extends AttackPathLike>(
  paths: ActivePathList<T>,
  predicate: (path: T) => boolean,
): ActivePathList<T> {
  return (paths as T[]).filter(predicate) as unknown as ActivePathList<T>
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
