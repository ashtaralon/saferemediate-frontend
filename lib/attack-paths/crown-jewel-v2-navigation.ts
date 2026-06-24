import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
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
  if ("path_count" in cj && typeof cj.path_count === "number") {
    return cj as CrownJewelSummary
  }
  return {
    id: cj.id,
    canonical_id: cj.arn ?? (cj.id.startsWith("arn:") ? cj.id : null),
    name: cj.name,
    type: cj.type,
    severity: "LOW",
    path_count: 0,
    highest_risk_score: 0,
    is_internet_exposed: false,
    data_classification: null,
    priority_score: 0,
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
}): string {
  const qs = new URLSearchParams()
  qs.set("system", params.systemName)
  qs.set("jewel", params.jewelId)
  qs.set("path", params.pathId)
  qs.set("map", "cyntro")
  qs.set("mode", "attack-path")
  return `/attack-paths-v2?${qs.toString()}`
}

/** TFM union spotlight — advanced / breadth view. */
export function buildTfmSpotlightUrl(
  systemName: string,
  jewelId: string,
): string {
  const qs = new URLSearchParams({
    systemName,
    tab: "dependency-map",
    cj: jewelId,
  })
  return `/systems?${qs.toString()}`
}

export async function fetchConvergenceSummary(
  systemName: string,
  jewel: CrownJewelSummary,
): Promise<CrownJewelConvergenceSummary | null> {
  const res = await fetch(buildConvergenceSummaryUrl(systemName, jewel), {
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
): boolean {
  const canonical = pickCanonicalConvergencePath(paths)
  if (!canonical) return false
  const href = buildAttackPathsV2CjUrl({
    systemName,
    jewelId: jewelIdForNavigation(jewel),
    pathId: canonical.path_id,
  })
  router.push(href)
  return true
}

export async function navigateCrownJewelClick(
  router: RouterLike,
  systemName: string,
  cj: CrownJewelSummary | { id: string; arn?: string | null; name: string; type: string },
): Promise<"v2" | "tfm-fallback"> {
  const jewel = toCrownJewelSummary(cj)
  const summary = await fetchConvergenceSummary(systemName, jewel)
  if (summary?.paths?.length) {
    const ok = navigateCrownJewelToV2(router, systemName, jewel, summary.paths)
    if (ok) return "v2"
  }
  return "tfm-fallback"
}
