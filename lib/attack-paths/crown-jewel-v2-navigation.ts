import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type { ScopeClaims } from "@/lib/attack-paths/scope-claims"
import { buildConvergenceSummaryUrl } from "@/lib/attack-paths/convergence-fetch-url"
import type {
  ConvergencePath,
  CrownJewelConvergenceSummary,
} from "@/lib/attack-paths/convergence-types"

type RouterLike = { push: (href: string) => void }

const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

export function toCrownJewelSummary(
  cj: CrownJewelSummary | { id: string; arn?: string | null; name: string; type: string },
): CrownJewelSummary {
  // A full summary passes through, a not-computed (null) count included; only a lite jewel is rebuilt.
  if ("path_count" in cj && (typeof cj.path_count === "number" || cj.path_count === null)) {
    return cj as CrownJewelSummary
  }
  return {
    id: cj.id,
    canonical_id: ("arn" in cj ? cj.arn : null) ?? (cj.id.startsWith("arn:") ? cj.id : null),
    name: cj.name,
    type: cj.type,
    // AP201 (I3) / S13: a lite jewel carries none of these; null, never an invented LOW / 0 / false.
    severity: null,
    path_count: null,
    highest_risk_score: null,
    is_internet_exposed: null,
    data_classification: null,
    priority_score: null,
  }
}

/** Skip orphan-role summary rows (empty workload_arn). */
export function filterRealConvergencePaths(
  paths: ConvergencePath[],
): ConvergencePath[] {
  return paths.filter((p) => (p.workload_arn ?? "").trim().length > 0)
}

/** Highest severity → observed → score → stable first-path tie-break. */
export function pickCanonicalConvergencePath(
  paths: ConvergencePath[],
): ConvergencePath | null {
  const real = filterRealConvergencePaths(paths)
  if (!real.length) return null
  return [...real].sort((a, b) => {
    const sevA = SEVERITY_RANK[(a.severity ?? "").toUpperCase()] ?? 0
    const sevB = SEVERITY_RANK[(b.severity ?? "").toUpperCase()] ?? 0
    if (sevB !== sevA) return sevB - sevA
    const obsA = a.confidence === "observed" ? 1 : 0
    const obsB = b.confidence === "observed" ? 1 : 0
    if (obsB !== obsA) return obsB - obsA
    return (b.score ?? 0) - (a.score ?? 0)
  })[0]
}

export function jewelIdForNavigation(jewel: CrownJewelSummary): string {
  return jewel.canonical_id ?? jewel.id
}

export function buildAttackPathsV2CjUrl(params: {
  systemName: string
  jewelId: string
  pathId: string
  /** A7 B5: the system's KEY (+ a tag / source key's account) -- the page then names ONE system. Absent: as before. */
  systemKey?: string | null
  systemAccountId?: string | null
}): string {
  const qs = new URLSearchParams()
  qs.set("system", params.systemName)
  if (params.systemKey) {
    qs.set("system_key", params.systemKey)
    if (params.systemAccountId) qs.set("account_id", params.systemAccountId)
  }
  qs.set("jewel", params.jewelId)
  qs.set("path", params.pathId)
  qs.set("map", "cyntro")
  qs.set("mode", "attack-path")
  return `/attack-paths-v2?${qs.toString()}`
}

/** TFM union spotlight — advanced / breadth view. A7 B5: with the system's KEY (+ a tag / source key's account) the
 *  system page opens that ONE system (app/systems reads system_key / account_id); without, the link is as before. */
export function buildTfmSpotlightUrl(
  systemName: string,
  jewelId: string,
  systemKey?: string | null,
  systemAccountId?: string | null,
): string {
  const qs = new URLSearchParams({
    systemName,
    tab: "dependency-map",
    cj: jewelId,
  })
  if (systemKey) {
    qs.set("system_key", systemKey)
    if (systemAccountId) qs.set("account_id", systemAccountId)
  }
  return `/systems?${qs.toString()}`
}

/** (AP201 review S1/S2) `claims` are the read's claims from THE one rule (`attackPathReadClaims` /
 *  `useAttackPathReadClaims`): the selected account rides as on every other Attack Paths read, and a system key's own
 *  account replaces it. A caller with no selected account (the dashboard card) passes only the identity. */
export async function fetchConvergenceSummary(
  systemName: string,
  jewel: CrownJewelSummary,
  claims: ScopeClaims,
): Promise<CrownJewelConvergenceSummary | null> {
  const res = await fetch(buildConvergenceSummaryUrl(systemName, jewel, claims), {
    cache: "no-store",
  })
  const body = (await res.json().catch(() => null)) as
    | CrownJewelConvergenceSummary
    | { error?: string }
    | null
  if (!res.ok || !body || "error" in body) return null
  return body as CrownJewelConvergenceSummary
}

/** Navigate to v2 spine when at least one real workload path exists. */
export function navigateCrownJewelToV2(
  router: RouterLike,
  systemName: string,
  jewel: CrownJewelSummary,
  paths: ConvergencePath[],
  systemKey?: string | null,
  systemAccountId?: string | null,
): boolean {
  const canonical = pickCanonicalConvergencePath(paths)
  if (!canonical) return false
  const href = buildAttackPathsV2CjUrl({
    systemName,
    jewelId: jewelIdForNavigation(jewel),
    pathId: canonical.path_id,
    systemKey,
    systemAccountId,
  })
  router.push(href)
  return true
}

export async function navigateCrownJewelClick(
  router: RouterLike,
  systemName: string,
  cj: CrownJewelSummary | { id: string; arn?: string | null; name: string; type: string },
  systemKey?: string | null,
  systemAccountId?: string | null,
): Promise<"v2" | "tfm-fallback"> {
  const jewel = toCrownJewelSummary(cj)
  const summary = await fetchConvergenceSummary(systemName, jewel, { customerId: null, accountId: null, systemKey, systemAccountId })
  if (summary?.paths?.length) {
    const ok = navigateCrownJewelToV2(router, systemName, jewel, summary.paths, systemKey, systemAccountId)
    if (ok) return "v2"
  }
  return "tfm-fallback"
}
