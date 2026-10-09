import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import { systemScopeQuery } from "@/lib/scoped-system-catalog"

// A7 B5: every builder takes the page's system KEY (+ a tag / source key's account) when it was opened by key, and names
// ONE system with it (systemScopeQuery). Without a key the URL is byte-identical to before.

export function buildConvergenceFetchUrl(
  systemName: string,
  jewel: CrownJewelSummary,
  systemKey?: string | null,
  systemAccountId?: string | null,
): string {
  const base = `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/by-crown-jewel`
  const qs = new URLSearchParams()
  const arn =
    (jewel.canonical_id?.startsWith("arn:") ? jewel.canonical_id : null) ??
    (jewel.id.startsWith("arn:") ? jewel.id : null)
  const name = jewel.name || (!jewel.id.startsWith("arn:") ? jewel.id : "")
  if (arn) qs.set("cj_arn", arn)
  if (name) qs.set("cj_name", name)
  return `${base}?${qs.toString()}${systemScopeQuery(systemKey, systemAccountId)}`
}

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

export function buildConvergenceSummaryUrl(
  systemName: string,
  jewel: CrownJewelSummary,
  systemKey?: string | null,
  systemAccountId?: string | null,
): string {
  const base = `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/by-crown-jewel/summary`
  return `${base}?${convergenceQueryParams(jewel).toString()}${systemScopeQuery(systemKey, systemAccountId)}`
}

export function buildConvergenceDetailUrl(
  systemName: string,
  jewel: CrownJewelSummary,
  pathId: string,
  systemKey?: string | null,
  systemAccountId?: string | null,
): string {
  const base = `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/by-crown-jewel/detail`
  const qs = convergenceQueryParams(jewel)
  qs.set("path_id", pathId)
  return `${base}?${qs.toString()}${systemScopeQuery(systemKey, systemAccountId)}`
}
