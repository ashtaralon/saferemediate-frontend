/**
 * Zoom0 Lateral — which identity is the compromised hub.
 *
 * SSOT is the pinned (or single-path) AttackPath. Jewel risk_summary.top_risk
 * must NEVER be used as a silent fallback — that showed the wrong attacker
 * when the pin disagreed with top_risk.
 */

import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

export type LateralIdentityResolution =
  | {
      status: "ready"
      identityId: string
      identityName: string | null
      path: ConvergencePath
      /** True when path was auto-selected because the jewel has exactly one path. */
      autoPinned: boolean
    }
  | { status: "need_pin" }
  | { status: "no_identity"; path: ConvergencePath; autoPinned: boolean }

function shortLabel(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null
  const s = raw.trim()
  const m = /[:/]([^:/]+)$/.exec(s)
  return m ? m[1] : s
}

/**
 * Resolve the Lateral hub identity from an explicit pin, or a single-path jewel.
 * Never synthesizes from risk_summary or paths[0] when multiple paths exist.
 */
export function resolveZoom0LateralIdentity(args: {
  pinnedPath: ConvergencePath | null
  /** All convergence paths for this jewel (summary or merged). */
  jewelPaths: ConvergencePath[]
}): LateralIdentityResolution {
  const { pinnedPath, jewelPaths } = args
  let path = pinnedPath
  let autoPinned = false

  if (!path) {
    if (jewelPaths.length === 1) {
      path = jewelPaths[0]
      autoPinned = true
    } else {
      return { status: "need_pin" }
    }
  }

  const identityId = (path.identity || "").trim()
  if (!identityId) {
    return { status: "no_identity", path, autoPinned }
  }

  return {
    status: "ready",
    identityId,
    identityName:
      (path.identity_name || "").trim() || shortLabel(path.identity) || null,
    path,
    autoPinned,
  }
}

/** Breach compute label for attacker-lens chrome. */
export function lateralBreachLabel(path: ConvergencePath): string {
  const raw =
    path.source ||
    path.workload_arn ||
    path.source_kind ||
    "unknown compute"
  return shortLabel(raw) || raw
}
