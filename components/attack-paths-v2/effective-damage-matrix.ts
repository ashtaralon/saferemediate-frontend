// Effective damage matrix — READ / WRITE / DELETE / ADMIN with confidence labels.
//
// Combines path-level damage_capability (configured IAM on the jewel) with
// optional per-node damage-scope (observed prefix/table access, post-LP).
// Never fabricates object counts — uses Configured / Observed / Blocked /
// Unknown per the Damage-Aware Attack Paths spec.

import type { DamageCapability } from "@/components/identity-attack-paths/types"
import type { DamageScopePayload } from "./damage-scope-drawer"

export type DamageVerbKey = "read" | "write" | "delete" | "admin"
export type ConfidenceLabel =
  | "Configured"
  | "Observed"
  | "Confirmed"
  | "Blocked"
  | "Unknown"

export interface MatrixCell {
  allowed: boolean
  confidence: ConfidenceLabel
  detail?: string
}

export interface EffectiveDamageMatrix {
  read: MatrixCell
  write: MatrixCell
  delete: MatrixCell
  admin: MatrixCell
  blockedReason?: string
}

const VERB_LABELS: Record<DamageVerbKey, string> = {
  read: "READ",
  write: "WRITE",
  delete: "DELETE",
  admin: "ADMIN",
}

export function verbLabel(key: DamageVerbKey): string {
  return VERB_LABELS[key]
}

function emptyCell(): MatrixCell {
  return { allowed: false, confidence: "Unknown" }
}

function cellFromCount(
  count: number,
  baseConfidence: ConfidenceLabel,
  detail?: string,
): MatrixCell {
  if (count <= 0) return { allowed: false, confidence: "Unknown" }
  return { allowed: true, confidence: baseConfidence, detail }
}

function observedS3Verbs(
  scope: Record<string, unknown> | undefined,
): Partial<Record<DamageVerbKey, string>> {
  if (!scope) return {}
  const out: Partial<Record<DamageVerbKey, string>> = {}
  const readP = (scope.read_prefixes as string[] | undefined) ?? []
  const writeP = (scope.write_prefixes as string[] | undefined) ?? []
  const deleteP = (scope.delete_prefixes as string[] | undefined) ?? []
  if (readP.length) {
    out.read = `Observed read under /${readP[0]}/` + (readP.length > 1 ? ` (+${readP.length - 1})` : "")
  }
  if (writeP.length) {
    out.write = `Observed write under /${writeP[0]}/` + (writeP.length > 1 ? ` (+${writeP.length - 1})` : "")
  }
  if (deleteP.length) {
    out.delete = `Observed delete under /${deleteP[0]}/` + (deleteP.length > 1 ? ` (+${deleteP.length - 1})` : "")
  }
  return out
}

/**
 * Build the 4-verb matrix from damage_capability + optional damage-scope.
 */
export function buildEffectiveDamageMatrix(
  dc: DamageCapability | null | undefined,
  scope: DamageScopePayload | null | undefined,
  _pathHasObservedHop: boolean,
): EffectiveDamageMatrix {
  const verbs = dc?.direct_verbs ?? dc?.verbs
  const gates = dc?.gates
  const effective = dc?.effective_damage

  if (effective === "network_blocked") {
    const reason = gates?.network_reason ?? "Network controls block reachability"
    return {
      read: { allowed: false, confidence: "Blocked", detail: reason },
      write: { allowed: false, confidence: "Blocked", detail: reason },
      delete: { allowed: false, confidence: "Blocked", detail: reason },
      admin: { allowed: false, confidence: "Blocked", detail: reason },
      blockedReason: reason,
    }
  }
  if (effective === "data_plane_blocked") {
    const reason = gates?.data_plane_reason ?? "Data-plane controls block access"
    return {
      read: { allowed: false, confidence: "Blocked", detail: reason },
      write: { allowed: false, confidence: "Blocked", detail: reason },
      delete: { allowed: false, confidence: "Blocked", detail: reason },
      admin: { allowed: false, confidence: "Blocked", detail: reason },
      blockedReason: reason,
    }
  }
  if (effective === "no_jewel_perms" || dc?.state === "not_applicable") {
    return {
      read: { allowed: false, confidence: "Unknown", detail: dc?.reason },
      write: { allowed: false, confidence: "Unknown", detail: dc?.reason },
      delete: { allowed: false, confidence: "Unknown", detail: dc?.reason },
      admin: { allowed: false, confidence: "Unknown", detail: dc?.reason },
    }
  }

  const matrix: EffectiveDamageMatrix = {
    read: cellFromCount(verbs?.read ?? 0, "Configured"),
    write: cellFromCount(verbs?.write ?? 0, "Configured"),
    delete: cellFromCount(verbs?.delete ?? 0, "Configured"),
    admin: cellFromCount(verbs?.admin ?? 0, "Configured"),
  }

  const observed = observedS3Verbs(scope?.scope_observed as Record<string, unknown> | undefined)
  for (const key of ["read", "write", "delete"] as DamageVerbKey[]) {
    const obsDetail = observed[key]
    if (!obsDetail) continue
    const cur = matrix[key]
    if (cur.allowed) {
      matrix[key] = { allowed: true, confidence: "Observed", detail: obsDetail }
    }
  }

  if (!verbs && scope?.scope_today?.actions?.length) {
    const actions = scope.scope_today.actions.map((a) => a.toLowerCase())
    const has = (pred: (a: string) => boolean) => actions.some(pred)
    matrix.read = has((a) => a.includes("get") || a.includes("list") || a.includes("read"))
      ? { allowed: true, confidence: "Configured", detail: scope.scope_today.headline }
      : emptyCell()
    matrix.write = has((a) => a.includes("put") || a.includes("write") || a.includes("update"))
      ? { allowed: true, confidence: "Configured", detail: scope.scope_today.headline }
      : emptyCell()
    matrix.delete = has((a) => a.includes("delete"))
      ? { allowed: true, confidence: "Configured", detail: scope.scope_today.headline }
      : emptyCell()
    matrix.admin = has((a) => a.endsWith(":*") || a.includes("admin"))
      ? { allowed: true, confidence: "Configured" }
      : emptyCell()
  }

  return matrix
}

/** One-line damage summary for path list / comparison table. */
export function matrixToSummary(matrix: EffectiveDamageMatrix): string {
  const parts: string[] = []
  for (const key of ["delete", "admin", "write", "read"] as DamageVerbKey[]) {
    const c = matrix[key]
    if (c.allowed) parts.push(VERB_LABELS[key])
  }
  if (matrix.blockedReason) return "Blocked"
  if (parts.length === 0) return "Unknown"
  return parts.join(" · ")
}
