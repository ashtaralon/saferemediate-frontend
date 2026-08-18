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

/** True when a /jewels proxy payload has at least one crown jewel. */
export function isJewelsPayloadCacheable(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false
  const d = payload as {
    result?: { crown_jewels?: unknown }
    data?: { crown_jewels?: unknown }
    crown_jewels?: unknown
  }
  const cjs = d.result?.crown_jewels ?? d.data?.crown_jewels ?? d.crown_jewels
  return Array.isArray(cjs) && cjs.length > 0
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
    const projected = convergencePathsToIdentityAttackPaths(jewel, serve.paths ?? [])
    // C1 can serve the per-jewel authority from the durable live-IAP
    // snapshot when Phase-3 materialization is absent. Preserve the summary's
    // authoritative membership/order, but reuse the matching full-IAP row so
    // the canvas keeps its real nodes and edges instead of an empty hop stub.
    const richById = new Map<string, IdentityAttackPath>()
    for (const path of iapPaths) {
      for (const id of [path.id, path.attack_path_id]) {
        if (id) richById.set(String(id), path)
      }
    }
    return {
      paths: projected.map(
        (path) => richById.get(String(path.id || path.attack_path_id || "")) ?? path,
      ),
      source: "serve",
    }
  }

  if (serveError && iapPaths.length > 0) {
    return { paths: iapPaths, source: "iap_fallback" }
  }

  return { paths: [], source: "none" }
}

/**
 * Jewel picker list: /jewels SERVE is authoritative once loaded.
 * Full IAP jewels only before /jewels responds or when /jewels failed.
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
 * True when GET /jewels returned successfully — including empty.
 * Empty SERVE is projection truth, not "not computed yet."
 */
export function isServeJewelsAuthoritative(
  serveJewelsRaw: unknown,
  serveJewelsError: string | null | undefined,
): boolean {
  return serveJewelsRaw != null && !serveJewelsError
}

/**
 * Full-page "Attack paths not computed yet" (IAP cold/stale envelope).
 * Never show when SERVE /jewels already answered — IAP provenance must
 * not override an honest READY / empty projection.
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
