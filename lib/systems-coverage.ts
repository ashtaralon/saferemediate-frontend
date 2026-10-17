/**
 * What a systems answer did NOT cover, in the backend's own terms (api/system_resources.py
 * member_account_fields): accounts the readiness gate held, accounts with nothing published,
 * and each member's registered Regions this install does not serve. A list with any of these is
 * partial and must say so -- a held account is not an empty one.
 */
function entries(value: unknown): [string, unknown][] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : []
}

export function systemsCoverageGaps(data: unknown): string[] {
  const d = (data ?? {}) as Record<string, unknown>
  const gaps: string[] = []
  for (const [account, reason] of entries(d.accounts_held)) {
    gaps.push(`Account ${account} is not served yet${typeof reason === "string" && reason ? ` (${reason})` : ""}`)
  }
  for (const [account, reason] of entries(d.accounts_not_recorded)) {
    gaps.push(`Account ${account} has nothing published${typeof reason === "string" && reason ? ` (${reason})` : ""}`)
  }
  for (const [account, regions] of entries(d.regions_not_served)) {
    const list = Array.isArray(regions) ? regions.filter((r): r is string => typeof r === "string") : []
    if (list.length) gaps.push(`Account ${account}: ${list.join(", ")} not served by this install`)
  }
  return gaps
}
