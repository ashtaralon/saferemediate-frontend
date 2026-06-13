// Path-level damage + fix summaries for list rows and comparison table.

import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import {
  buildEffectiveDamageMatrix,
  matrixToSummary,
} from "./effective-damage-matrix"

// BE-10 (sibling to BE-9): the role→role assume hop has a direction. source =
// the role doing the assuming (entry), target = the role being assumed. TRUSTS
// is excluded (resource-policy / cross-account, not an assume).
function assumeEdgeOf(path: IdentityAttackPath) {
  return (path.edges ?? []).find((e) => /ASSUME|STS/i.test(e.type))
}
function nodeByIdLocal(path: IdentityAttackPath, id: string | null | undefined) {
  if (!id) return undefined
  return (path.nodes ?? []).find((n) => n.id === id || n.canonical_id === id)
}

export function pathSourceLabel(path: IdentityAttackPath): string {
  // BE-10: when the path opens with an assume hop, the entry is the assuming
  // role (assume edge SOURCE) — not whichever role sits at nodes[0]. Without
  // this an injected escalation target at nodes[0] is mislabeled as the source
  // (e.g. "treasury → treasury → jewel" when reality is pivot → treasury).
  const entry = nodeByIdLocal(path, assumeEdgeOf(path)?.source)
  if (entry) return entry.name
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
  // BE-10: the identity that reaches the jewel. An assume chain has two IAMRole
  // nodes; naively taking the first one duplicates the source label. Prefer the
  // role whose edge actually targets the crown jewel.
  const cj = path.crown_jewel_id
  const reachEdge = (path.edges ?? []).find(
    (e) =>
      (e.target === cj || e.target === nodeByIdLocal(path, cj)?.id) &&
      /ACCESS|QUERIES_DB|ENCRYPTED_BY|CALLS/i.test(e.type),
  )
  const reacher = nodeByIdLocal(path, reachEdge?.source)
  if (reacher && /IAMRole/i.test(reacher.type)) return reacher.name
  const role = (path.nodes ?? []).find((n) => n.type === "IAMRole")
  return role?.name ?? path.damage_capability?.role_name ?? "—"
}

export function pathDamageSummary(path: IdentityAttackPath): string {
  const dc = path.damage_capability
  const matrix = buildEffectiveDamageMatrix(dc, null, false)
  const fromMatrix = matrixToSummary(matrix)
  if (fromMatrix !== "Unknown") return fromMatrix
  if (dc?.summary?.toLowerCase().includes("network blocked")) return "Blocked"
  if (dc?.summary?.toLowerCase().includes("data-plane blocked")) return "Blocked"
  return fromMatrix
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
