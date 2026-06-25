import type { AttackPathReport } from "./attack-path-report-types"

/** L3-verified Mistral executive from Neo4j narration_json, when present. */
export function llmVerifiedExecutive(report: AttackPathReport): string | null {
  if (report.narration_source !== "llm" || !report.narration_l3_ok) return null
  const exec = report.narration_json?.executive
  if (typeof exec !== "string") return null
  const trimmed = exec.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function usesLlmRiskLede(report: AttackPathReport): boolean {
  return llmVerifiedExecutive(report) != null
}

/** Prefer L2 executive over the compiler headline when narration passed L3. */
export function resolveRiskLede(report: AttackPathReport, compilerLede: string): string {
  return llmVerifiedExecutive(report) ?? compilerLede
}
