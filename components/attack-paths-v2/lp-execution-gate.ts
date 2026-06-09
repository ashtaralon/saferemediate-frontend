// Map IAM LP evidence confidence → operator-facing AUTO / REVIEW gate.

import type { DamageScopePayload } from "./damage-scope-drawer"

export type LpExecutionGate = "AUTO" | "REVIEW"

export interface LpExecutionAssessment {
  gate: LpExecutionGate
  label: string
  reason: string
  consumerCount: number | null
  evidenceGaps: string[]
  vetos: string[]
}

export function assessLpExecution(
  lp: DamageScopePayload["lp_confidence"] | null | undefined,
  sharedRoleConsumers?: number | null,
): LpExecutionAssessment {
  const consumerCount =
    lp?.consumer_count ??
    sharedRoleConsumers ??
    null
  const vetos = lp?.vetos ?? []
  const evidenceGaps = lp?.evidence_gaps ?? []
  const level = (lp?.level ?? "").toUpperCase()

  const sharedRole = consumerCount != null && consumerCount > 1
  const hasVetos = vetos.length > 0
  const weakEvidence = level === "LOW" || level === "MEDIUM"

  if (sharedRole) {
    return {
      gate: "REVIEW",
      label: "REVIEW",
      reason: `Role shared by ${consumerCount} workloads — LP may affect more than this path`,
      consumerCount,
      evidenceGaps,
      vetos,
    }
  }
  if (hasVetos) {
    return {
      gate: "REVIEW",
      label: "REVIEW",
      reason: `Evidence vetos: ${vetos.join(", ")}`,
      consumerCount,
      evidenceGaps,
      vetos,
    }
  }
  if (weakEvidence) {
    return {
      gate: "REVIEW",
      label: "REVIEW",
      reason:
        evidenceGaps[0] ??
        `LP confidence ${level || "unknown"} — verify before apply`,
      consumerCount,
      evidenceGaps,
      vetos,
    }
  }

  return {
    gate: "AUTO",
    label: "AUTO",
    reason: "High-confidence LP — unused permissions with strong observation coverage",
    consumerCount,
    evidenceGaps,
    vetos,
  }
}

export function gateTone(gate: LpExecutionGate): string {
  return gate === "AUTO"
    ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
    : "border-amber-500/40 text-amber-300 bg-amber-500/10"
}
