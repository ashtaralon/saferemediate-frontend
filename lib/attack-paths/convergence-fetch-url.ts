import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"

export function buildConvergenceFetchUrl(
  systemName: string,
  jewel: CrownJewelSummary,
): string {
  const base = `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/by-crown-jewel`
  const qs = new URLSearchParams()
  const arn =
    (jewel.canonical_id?.startsWith("arn:") ? jewel.canonical_id : null) ??
    (jewel.id.startsWith("arn:") ? jewel.id : null)
  const name = jewel.name || (!jewel.id.startsWith("arn:") ? jewel.id : "")
  if (arn) qs.set("cj_arn", arn)
  if (name) qs.set("cj_name", name)
  return `${base}?${qs.toString()}`
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
): string {
  const base = `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/by-crown-jewel/summary`
  return `${base}?${convergenceQueryParams(jewel).toString()}`
}

export function buildConvergenceDetailUrl(
  systemName: string,
  jewel: CrownJewelSummary,
  pathId: string,
): string {
  const base = `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/by-crown-jewel/detail`
  const qs = convergenceQueryParams(jewel)
  qs.set("path_id", pathId)
  return `${base}?${qs.toString()}`
}
