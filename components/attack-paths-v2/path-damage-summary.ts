// Path-level damage + fix summaries for list rows and comparison table.

import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import {
  buildEffectiveDamageMatrix,
  matrixToSummary,
} from "./effective-damage-matrix"

export function pathSourceLabel(path: IdentityAttackPath): string {
  const nodes = path.nodes ?? []
  const workload = nodes.find(
    (n) =>
      !["CloudTrailPrincipal", "AWSPrincipal", "Principal", "IAMUser", "HumanIdentity"].includes(
        n.type,
      ),
  )
  return workload?.name ?? nodes[0]?.name ?? "—"
}

export function pathIdentityLabel(path: IdentityAttackPath): string {
  const role = (path.nodes ?? []).find((n) => n.type === "IAMRole")
  return role?.name ?? path.damage_capability?.role_name ?? "—"
}

export function pathDamageSummary(path: IdentityAttackPath): string {
  const dc = path.damage_capability
  if (dc?.summary) return dc.summary
  const hasObserved = (path.edges ?? []).some((e) => e.is_observed)
  const matrix = buildEffectiveDamageMatrix(dc, null, hasObserved)
  return matrixToSummary(matrix)
}

export function pathTopFixLabel(path: IdentityAttackPath): string {
  const top = path.risk_reduction?.top_actions?.[0]
  if (top?.action) return top.action
  if (path.risk_reduction?.reduction_summary) {
    const s = path.risk_reduction.reduction_summary
    return s.length > 72 ? s.slice(0, 69) + "…" : s
  }
  return "—"
}
