/**
 * Attach network-posture provenance to whichever architecture is being drawn.
 *
 * Why this is separate from `buildPathAuthorityArchitecture`: the posture is a
 * fact about the PATH DTOs, not about the architecture object. PR #465 derived
 * it inside that builder, which only runs for the Zoom-0 fan-in
 * (`pathAuthorityOnly`). Every other view renders an architecture fetched from
 * the dependency-map API and therefore had no posture at all.
 *
 * Checking production on 2026-07-30 showed the cost: the attacker map rendered
 * `data-network-banner="path-scoped"` with a NULL reason — it was falling
 * through to the renderer's `?? true` default rather than reading a derived
 * posture, so a path whose hops were pending/errored was still described as
 * having no network hops.
 *
 * Pure, and exported so the composition is testable without mounting an
 * 11k-line component. The derivation itself lives in
 * `build-path-authority-architecture.ts` — one implementation, two callers.
 */
import { deriveNetworkPosture } from "@/lib/attack-paths/build-path-authority-architecture"
import { selectSpotlightPaths } from "@/lib/attack-paths/build-spotlight-active-node-ids"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

/**
 * Minimal shape this touches — anything carrying an optional posture.
 *
 * `reason` is widened to `string` rather than reusing
 * `PathAuthorityNetworkPosture`, whose `reason` is a narrow string-literal
 * union. The renderer's `SystemArchitecture` declares the loose shape, and a
 * narrow union does not structurally satisfy it, so constraining on the strict
 * type made SystemArchitecture unassignable here. Assignment goes the safe
 * direction — a literal union widens to `string` — so nothing is lost.
 */
export interface PostureBearing {
  networkPosture?: { settled: boolean; reason: string }
}

export function attachNetworkPosture<T extends PostureBearing>(
  arch: T,
  spotlightPaths: ConvergencePath[] | null | undefined,
  spotlightPathId: string | null | undefined,
): T {
  // Nothing to derive from. The renderer's own default governs, which for an
  // estate map with no path selected is the legacy empty-bucket inference.
  if (!spotlightPaths?.length) return arch

  // Never overwrite. buildPathAuthorityArchitecture already derived this for
  // the fan-in, using the same function; clobbering it here would make the
  // result depend on call order for no benefit.
  if (arch.networkPosture) return arch

  return {
    ...arch,
    // Same lane selection as the fan-in builder. A posture derived over a
    // different set of paths than the one being drawn would be its own lie.
    networkPosture: deriveNetworkPosture(
      selectSpotlightPaths(spotlightPaths, spotlightPathId ?? null),
    ),
  }
}
