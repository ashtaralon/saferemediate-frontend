/**
 * Engineer placement overrides — OPERATOR PROVENANCE, NEVER A GRAPH FACT.
 *
 * The map places a node from the graph or it says it cannot (see the unplaced
 * area in `aws-frame.tsx`). This module is the third case: a human who knows
 * where something actually lives can say so, and the map will draw it there —
 * while continuing to state that it is a human's claim and not the graph's.
 *
 * Three rules, and they are the whole point of the file:
 *
 * 1. **It is never written back to the graph.** An override lives in this
 *    browser only. Nothing here calls the API, and no collector reads it. The
 *    graph keeps saying "I don't know where this is", which is true.
 * 2. **It never silently becomes indistinguishable from evidence.** Every
 *    override carries `placed_at`, the renderer badges the chip, and the count
 *    stays visible in the unplaced-area header. An operator-placed chip must
 *    always be tellable from a graph-placed one.
 * 3. **It is a weaker claim, so it loses to evidence.** If the graph later
 *    resolves a subnet for the node, the graph wins and the override is
 *    ignored — an override answers "where does this go when nothing knows",
 *    not "override what the collector found".
 *
 * Storage follows the existing map-preference convention in
 * `estate-map-view.tsx` (`topology-hidden-az:` / `topology-vpc:`): browser
 * localStorage, keyed by system + VPC scope, tolerant of anything already in
 * the slot. Stale or hand-edited JSON must never crash the canvas, so every
 * read is validated field by field and a bad entry is dropped rather than
 * trusted.
 *
 * What this deliberately is NOT: an audit trail. It records WHEN a placement
 * was asserted, not by whom — there is no authenticated identity on this code
 * path, and inventing one would be worse than omitting it. If placement
 * provenance ever needs to be shared between operators or audited, it needs a
 * backend endpoint and an identity, not a bigger localStorage blob.
 */
import type { SubnetTier } from "./types"

const STORAGE_PREFIX = "topology-placement-override:"

/** Tiers an engineer may target — `unknown` is not a placement. */
const ASSIGNABLE_TIERS: readonly SubnetTier[] = ["web", "app", "data"]

export function isAssignableTier(tier: string): tier is "web" | "app" | "data" {
  return (ASSIGNABLE_TIERS as readonly string[]).includes(tier)
}

export interface PlacementOverride {
  node_id: string
  /**
   * The VPC frame this placement targets.
   *
   * Required, and it is not redundant with `az`: two VPCs in one region both
   * have an AZ whose name ends `a`, so an AZ name alone does not name a cell. It also
   * carries the placement's whole point for the largest unplaced population —
   * a node whose `vpc_id` the graph never recorded belongs to no frame at all,
   * so without this the engineer would have nowhere to put it.
   */
  vpc_id: string
  az: string
  tier: "web" | "app" | "data"
  /** ISO-8601, UTC. When a human asserted this placement. */
  placed_at: string
}

/** Keyed by `node_id` — one placement per node. */
export type PlacementOverrideMap = Readonly<Record<string, PlacementOverride>>

export const NO_PLACEMENT_OVERRIDES: PlacementOverrideMap = Object.freeze({})

export function placementOverrideStorageKey(systemName: string, vpcKey: string): string {
  return `${STORAGE_PREFIX}${systemName}:${vpcKey}`
}

/** Validate one entry. Anything not fully well-formed is dropped, not repaired:
 *  a half-read override would place a chip somewhere nobody chose. */
function parseOverride(raw: unknown): PlacementOverride | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (typeof o.node_id !== "string" || o.node_id === "") return null
  if (typeof o.vpc_id !== "string" || o.vpc_id === "") return null
  if (typeof o.az !== "string" || o.az === "") return null
  if (typeof o.tier !== "string" || !isAssignableTier(o.tier)) return null
  if (typeof o.placed_at !== "string" || Number.isNaN(Date.parse(o.placed_at))) return null
  return {
    node_id: o.node_id,
    vpc_id: o.vpc_id,
    az: o.az,
    tier: o.tier,
    placed_at: o.placed_at,
  }
}

export function loadPlacementOverrides(systemName: string, vpcKey: string): PlacementOverrideMap {
  if (typeof window === "undefined") return NO_PLACEMENT_OVERRIDES
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(placementOverrideStorageKey(systemName, vpcKey))
  } catch {
    // Private mode / disabled storage. No overrides is a correct answer.
    return NO_PLACEMENT_OVERRIDES
  }
  if (!raw) return NO_PLACEMENT_OVERRIDES
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return NO_PLACEMENT_OVERRIDES
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NO_PLACEMENT_OVERRIDES
  const out: Record<string, PlacementOverride> = {}
  for (const [nodeId, value] of Object.entries(parsed as Record<string, unknown>)) {
    const ov = parseOverride(value)
    // A key that disagrees with its own payload is corrupt, not ambiguous.
    if (ov && ov.node_id === nodeId) out[nodeId] = ov
  }
  return out
}

export function savePlacementOverrides(
  systemName: string,
  vpcKey: string,
  overrides: PlacementOverrideMap,
): void {
  if (typeof window === "undefined") return
  const key = placementOverrideStorageKey(systemName, vpcKey)
  try {
    if (Object.keys(overrides).length === 0) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(overrides))
  } catch {
    // Quota or private mode. Losing a presentation preference is acceptable;
    // throwing here would take the canvas down with it.
  }
}

/** Add or replace one placement. `placed_at` is stamped here so a caller cannot
 *  forget it and leave an override that looks like it has always been there. */
export function withPlacementOverride(
  overrides: PlacementOverrideMap,
  nodeId: string,
  vpcId: string,
  az: string,
  tier: "web" | "app" | "data",
  now: Date = new Date(),
): PlacementOverrideMap {
  return {
    ...overrides,
    [nodeId]: { node_id: nodeId, vpc_id: vpcId, az, tier, placed_at: now.toISOString() },
  }
}

export function withoutPlacementOverride(
  overrides: PlacementOverrideMap,
  nodeId: string,
): PlacementOverrideMap {
  if (!(nodeId in overrides)) return overrides
  const next = { ...overrides }
  delete next[nodeId]
  return next
}

/**
 * Overrides plus the scope they were loaded for.
 *
 * This pairing exists because of a real ordering bug, not for tidiness. The
 * host loads on scope change and persists on change, and both effects run in
 * the same commit — so a persist keyed on the NEW scope while state still held
 * the PREVIOUS scope's overrides stamped one VPC's placements into another's
 * key, inventing placements nobody made. Carrying the scope in the value makes
 * every read and write answerable without knowing effect order.
 *
 * The scope token IS the storage key, so there is one identity for "which slot
 * are we talking about" rather than a second parallel convention.
 */
export interface ScopedPlacementOverrides {
  scope: string
  map: PlacementOverrideMap
}

export const EMPTY_SCOPED_OVERRIDES: ScopedPlacementOverrides = Object.freeze({
  scope: "",
  map: NO_PLACEMENT_OVERRIDES,
})

export function loadScopedOverrides(
  systemName: string,
  vpcKey: string,
): ScopedPlacementOverrides {
  return {
    scope: placementOverrideStorageKey(systemName, vpcKey),
    map: loadPlacementOverrides(systemName, vpcKey),
  }
}

/** Overrides to render for this scope. A mismatch yields none — the safe
 *  answer, since the alternative is drawing another scope's placements. */
export function readScopedOverrides(
  state: ScopedPlacementOverrides,
  systemName: string,
  vpcKey: string,
): PlacementOverrideMap {
  return state.scope === placementOverrideStorageKey(systemName, vpcKey)
    ? state.map
    : NO_PLACEMENT_OVERRIDES
}

/** Persist only into the scope the value came from. Returns whether it wrote,
 *  so a caller can assert the fence rather than assume it. */
export function persistScopedOverrides(
  state: ScopedPlacementOverrides,
  systemName: string,
  vpcKey: string,
): boolean {
  if (state.scope !== placementOverrideStorageKey(systemName, vpcKey)) return false
  savePlacementOverrides(systemName, vpcKey, state.map)
  return true
}

/**
 * Apply one engineer placement, or clear it with `cell = null`.
 *
 * Returns the state unchanged when it belongs to a different scope: a click
 * that lands after a scope switch but before the reload belongs to neither
 * scope, and attributing it to the wrong one is the fabrication this module
 * exists to prevent.
 */
export function updateScopedOverrides(
  state: ScopedPlacementOverrides,
  systemName: string,
  vpcKey: string,
  nodeId: string,
  cell: { vpc_id: string; az: string; tier: "web" | "app" | "data" } | null,
  now: Date = new Date(),
): ScopedPlacementOverrides {
  if (state.scope !== placementOverrideStorageKey(systemName, vpcKey)) return state
  const map = cell
    ? withPlacementOverride(state.map, nodeId, cell.vpc_id, cell.az, cell.tier, now)
    : withoutPlacementOverride(state.map, nodeId)
  return map === state.map ? state : { scope: state.scope, map }
}

/**
 * Why there is no `pruneOverrides…` here.
 *
 * The obvious fourth function drops overrides whose cell the map no longer
 * draws — an AZ or a whole VPC went away between collections. It is not
 * written, on purpose: a collector run that temporarily loses a subnet would
 * then permanently destroy an engineer's assertion, and the engineer is the
 * more reliable of the two. A stale override is already harmless — the grid
 * refuses it (`override.vpc_id === canvasVpcId && realAzs.has(override.az)`),
 * `buildVpcFrames` routes on it only into a frame that exists, and the
 * "Placed by an engineer" list filters to cells actually drawn — so it costs
 * one localStorage entry and comes back correct if the cell returns. Storage
 * is bounded by the nodes one operator has ever placed in one scope.
 */
