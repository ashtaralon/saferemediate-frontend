export type CanonicalFinding<T extends Record<string, unknown>> = T & {
  id: string
  finding_id: string
}

export function canonicalFindingId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null
  const finding = raw as Record<string, unknown>
  const value = [finding.finding_id, finding.id, finding.findingId]
    .find((candidate) => typeof candidate === "string" && candidate.trim().length > 0)
  return typeof value === "string" ? value.trim() : null
}

export function normalizeFindingIdentity<T extends Record<string, unknown>>(
  raw: T,
): CanonicalFinding<T> | null {
  const findingId = canonicalFindingId(raw)
  if (!findingId) return null
  return { ...raw, id: findingId, finding_id: findingId }
}

export function normalizeFindingIdentities<T extends Record<string, unknown>>(
  rows: readonly T[],
): { findings: CanonicalFinding<T>[]; withheldCount: number } {
  const findings = rows.flatMap((row) => {
    const normalized = normalizeFindingIdentity(row)
    return normalized ? [normalized] : []
  })
  return { findings, withheldCount: rows.length - findings.length }
}
