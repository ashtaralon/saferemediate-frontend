import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import { appendScopeClaims, type ScopeClaims } from "./scope-claims"

/**
 * The page's per-jewel read URLs, in one place. Each takes the read's scope (AP201, R11 + A7 B5): the operator's tenant /
 * account CLAIMS -- on a control plane with several registered workload accounts the backend refuses an unnamed read by
 * name -- and, when the page was opened by key, the system KEY (+ a tag / source key's account) that names ONE system
 * (`appendScopeClaims`). Absent scope leaves the URL as before.
 */

function convergenceQueryParams(jewel: CrownJewelSummary): URLSearchParams {
  const qs = new URLSearchParams()
  const arn =
    (jewel.canonical_id?.startsWith("arn:") ? jewel.canonical_id : null) ??
    (jewel.id.startsWith("arn:") ? jewel.id : null)
  const name = jewel.name || (!jewel.id.startsWith("arn:") ? jewel.id : "")
  if (arn) qs.set("cj_arn", arn)
  if (name) qs.set("cj_name", name)
  return qs
}

export function buildConvergenceFetchUrl(
  systemName: string,
  jewel: CrownJewelSummary,
  claims?: ScopeClaims | null,
): string {
  const base = `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/by-crown-jewel`
  return `${base}?${appendScopeClaims(convergenceQueryParams(jewel), claims).toString()}`
}

export function buildConvergenceSummaryUrl(
  systemName: string,
  jewel: CrownJewelSummary,
  claims?: ScopeClaims | null,
): string {
  const base = `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/by-crown-jewel/summary`
  return `${base}?${appendScopeClaims(convergenceQueryParams(jewel), claims).toString()}`
}

export function buildConvergenceDetailUrl(
  systemName: string,
  jewel: CrownJewelSummary,
  pathId: string,
  claims?: ScopeClaims | null,
): string {
  const base = `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/by-crown-jewel/detail`
  const qs = convergenceQueryParams(jewel)
  qs.set("path_id", pathId)
  return `${base}?${appendScopeClaims(qs, claims).toString()}`
}

/** GET /api/proxy/attack-paths/{system}/targets — the crown-jewel catalog (AP3-104). */
export function buildTargetCatalogUrl(systemName: string, claims?: ScopeClaims | null): string {
  const base = `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/targets`
  const qs = appendScopeClaims(new URLSearchParams(), claims).toString()
  return qs ? `${base}?${qs}` : base
}

/** GET /api/proxy/attack-paths/{system}/jewel-footholds — the ATLAS foothold candidates (+ evaluation params). */
export function buildJewelFootholdsUrl(
  systemName: string,
  jewelRef: string,
  evaluation: Record<string, string | number | boolean>,
  claims?: ScopeClaims | null,
): string {
  const qs = new URLSearchParams({ jewel_ref: jewelRef })
  for (const [key, value] of Object.entries(evaluation)) qs.set(key, String(value))
  return `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/jewel-footholds?${appendScopeClaims(qs, claims).toString()}`
}

/** GET /api/proxy/attack-paths/{system}/jewel-lateral-reach — the Lateral lens bands. */
export function buildJewelLateralReachUrl(
  systemName: string,
  jewelRef: string,
  jewelType: string,
  claims?: ScopeClaims | null,
): string {
  const qs = new URLSearchParams({ jewel_ref: jewelRef, jewel_type: jewelType })
  return `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/jewel-lateral-reach?${appendScopeClaims(qs, claims).toString()}`
}

/** GET /api/proxy/identity-attack-paths/{system}/jewel-surface/{jewel} — the aggregated surface card. */
export function buildJewelSurfaceUrl(systemName: string, jewelId: string, claims?: ScopeClaims | null): string {
  const base = `/api/proxy/identity-attack-paths/${encodeURIComponent(systemName)}/jewel-surface/${encodeURIComponent(jewelId)}`
  const qs = appendScopeClaims(new URLSearchParams(), claims).toString()
  return qs ? `${base}?${qs}` : base
}
