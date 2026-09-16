/**
 * Which system-dashboard tab an Estate surface deep link must open.
 *
 * `?surface=identity` is read inside `EstateMapView`, which mounts only under
 * the Topology leaf (`dependency-map`). Without this mapping the root deep
 * link opened Overview and the operator had to click Topology before the
 * requested surface appeared — the navigation gap seen in QA on 2026-09-16.
 *
 * Unsupported values return undefined so the dashboard keeps its own default:
 * a deep link never selects a tab this does not recognise.
 */
export const ESTATE_TOPOLOGY_TAB = "dependency-map" as const

/** Estate surfaces that are addressable by URL. `map` is the Topology default. */
const ESTATE_SURFACES = new Set(["identity", "map"])

export function estateSurfaceInitialTab(surface: string | null | undefined): typeof ESTATE_TOPOLOGY_TAB | undefined {
  return typeof surface === "string" && ESTATE_SURFACES.has(surface) ? ESTATE_TOPOLOGY_TAB : undefined
}
