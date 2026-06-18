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
