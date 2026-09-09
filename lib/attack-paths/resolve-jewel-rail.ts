/**
 * Path-rail authority: SERVE by-crown-jewel/summary wins over full IAP.
 *
 * Zoom0 already fail-closes on READY_ZERO / NOT_READY (#437). The middle
 * rail used to prefer IAP paths whenever present, so operators saw 4 IAP
 * paths beside a READY_ZERO canvas. That dual-truth is forbidden.
 */

import type {
  CrownJewelSummary,
  IdentityAttackPath,
} from "@/components/identity-attack-paths/types"
import type { CrownJewelConvergence } from "./convergence-types"
import { convergencePathsToIdentityAttackPaths } from "./convergence-to-iap"

export type JewelRailSource = "serve" | "iap_fallback" | "none"

export type JewelRailResolution = {
  paths: IdentityAttackPath[]
  source: JewelRailSource
}

/**
 * Resolve paths for the Attack Paths V2 middle rail.
 *
 * - Any successful SERVE envelope (including empty READY_ZERO / NOT_READY)
 *   is authoritative — never pad with IAP.
 * - IAP only when SERVE is unreachable (error, no data) and IAP has rows.
 */
export function resolveJewelRailPaths(args: {
  serve: CrownJewelConvergence | null
  serveError: string | null
  jewel: CrownJewelSummary | null
  iapPaths: IdentityAttackPath[]
}): JewelRailResolution {
  const { serve, serveError, jewel, iapPaths } = args

  if (serve != null) {
    if (!jewel) {
      return { paths: [], source: "serve" }
    }
    return {
      paths: convergencePathsToIdentityAttackPaths(jewel, serve.paths ?? []),
      source: "serve",
    }
  }

  if (serveError && iapPaths.length > 0) {
    return { paths: iapPaths, source: "iap_fallback" }
  }

  return { paths: [], source: "none" }
}

/**
 * Jewel picker list: the SERVE target catalog (/attack-paths/{system}/targets,
 * AP3-104) is authoritative once loaded — INCLUDING its zero-path targets,
 * which carry an explicit state and must stay listed. Full IAP jewels only
 * before the catalog responds or when it failed.
 */
export function resolveJewelPickerList(args: {
  serveJewels: CrownJewelSummary[] | null
  serveJewelsError: string | null
  iapJewels: CrownJewelSummary[] | null
}): CrownJewelSummary[] {
  const { serveJewels, serveJewelsError, iapJewels } = args
  if (serveJewels != null && !serveJewelsError) {
    return serveJewels
  }
  if (iapJewels && iapJewels.length > 0) {
    return iapJewels
  }
  return serveJewels ?? []
}

/**
 * True when the SERVE catalog returned successfully — including empty and
 * NOT_READY (each target then carries `projection_not_ready`). An answered
 * catalog is the truth about this system; never overlay IAP provenance on it.
 */
export function isServeJewelsAuthoritative(
  serveJewelsRaw: unknown,
  serveJewelsError: string | null | undefined,
): boolean {
  return serveJewelsRaw != null && !serveJewelsError
}

/**
 * Full-page "Attack paths not computed yet" (IAP cold/stale envelope).
 * Never show when the SERVE catalog already answered — IAP provenance must
 * not override an honest READY / empty / NOT_READY projection.
 */
export function shouldShowAttackPathsNotComputed(args: {
  serveJewelsRaw: unknown
  serveJewelsError: string | null | undefined
  jewelsEmpty: boolean
  iapFailed: boolean
  jewelsLoading: boolean
  iapLoading: boolean
}): boolean {
  if (isServeJewelsAuthoritative(args.serveJewelsRaw, args.serveJewelsError)) {
    return false
  }
  return (
    args.jewelsEmpty &&
    args.iapFailed &&
    !args.jewelsLoading &&
    !args.iapLoading
  )
}
