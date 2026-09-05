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

type JewelsEnvelope = {
  serve_state?: unknown
  coverage_state?: unknown
  crown_jewels?: unknown
  result?: JewelsEnvelope
  data?: JewelsEnvelope
}

function jewelEnvelopeBody(payload: unknown): JewelsEnvelope | null {
  if (!payload || typeof payload !== "object") return null
  const outer = payload as JewelsEnvelope
  if (outer.result && typeof outer.result === "object") return outer.result
  if (outer.data && typeof outer.data === "object") return outer.data
  return outer
}

/** True when a /jewels proxy payload has at least one crown jewel. */
export function isJewelsPayloadCacheable(payload: unknown): boolean {
  return isServeJewelsAuthoritative(payload, null)
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
  serveCollectionAuthoritative?: boolean
  jewel: CrownJewelSummary | null
  iapPaths: IdentityAttackPath[]
}): JewelRailResolution {
  const {
    serve,
    serveError,
    serveCollectionAuthoritative = true,
    jewel,
    iapPaths,
  } = args

  if (serve != null) {
    if (!jewel) {
      return { paths: [], source: "serve" }
    }
    return {
      paths: convergencePathsToIdentityAttackPaths(jewel, serve.paths ?? []),
      source: "serve",
    }
  }

  // When the collection-level /jewels contract is already inconsistent,
  // do not wait for three slow per-jewel retries before showing the coherent
  // full-IAP paths that are already in memory.
  if (!serveCollectionAuthoritative && iapPaths.length > 0) {
    return { paths: iapPaths, source: "iap_fallback" }
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
  serveJewelsAuthoritative: boolean
  iapJewels: CrownJewelSummary[] | null
}): CrownJewelSummary[] {
  const {
    serveJewels,
    serveJewelsError,
    serveJewelsAuthoritative,
    iapJewels,
  } = args
  if (serveJewels != null && !serveJewelsError && serveJewelsAuthoritative) {
    return serveJewels
  }
  if (iapJewels && iapJewels.length > 0) {
    return iapJewels
  }
  // Preserve the real target inventory while the full Neptune-backed IAP
  // fallback is loading, but do not let this provisional list claim serving
  // authority or suppress NOT_READY messaging.
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
  if (serveJewelsRaw == null || serveJewelsError) return false
  const body = jewelEnvelopeBody(serveJewelsRaw)
  if (!body || !Array.isArray(body.crown_jewels)) return false

  const serveState = String(body.serve_state ?? "").toUpperCase()
  const coverageState = String(body.coverage_state ?? "").toUpperCase()
  if (
    ["NOT_READY", "INTEGRITY_HELD", "PARTIAL", "ERROR"].includes(serveState) ||
    ["NOT_READY", "INTEGRITY_HELD", "PARTIAL", "ERROR"].includes(coverageState)
  ) {
    return false
  }

  const visiblePathCount = body.crown_jewels.reduce((total, rawJewel) => {
    if (!rawJewel || typeof rawJewel !== "object") return total
    const count = Number((rawJewel as { path_count?: unknown }).path_count ?? 0)
    return total + (Number.isFinite(count) && count > 0 ? count : 0)
  }, 0)

  // A zero-path response is authoritative only when the backend explicitly
  // certifies READY_ZERO.  HTTP 200 + ACTIVE + all-zero counts was the live
  // split-brain failure that hid a separate full-IAP response containing paths.
  if (visiblePathCount === 0) return coverageState === "READY_ZERO"
  return serveState === "ACTIVE" && coverageState === "READY"
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
