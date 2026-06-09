// Granular damage capability lines — multiple ✓/✕ rows per READ/WRITE/DELETE/ADMIN.

import type { DamageCapability } from "@/components/identity-attack-paths/types"
import type { DamageScopePayload } from "./damage-scope-drawer"
import {
  type ConfidenceLabel,
  type DamageVerbKey,
  type EffectiveDamageMatrix,
  verbLabel,
} from "./effective-damage-matrix"
import { actionToEnglish, type DamageCategory } from "./iam-action-to-english"

export interface GranularDamageLine {
  verb: DamageVerbKey
  label: string
  allowed: boolean
  confidence: ConfidenceLabel
  detail?: string
}

const CATEGORY_TO_VERB: Record<DamageCategory, DamageVerbKey> = {
  exfil: "read",
  manipulate: "write",
  destructive: "delete",
  control_plane: "admin",
}

const S3_NEGATIVES: Array<{ verb: DamageVerbKey; match: string; label: string }> = [
  { verb: "write", match: "s3:putobject", label: "Upload new objects" },
  { verb: "delete", match: "s3:deletebucket", label: "Delete entire bucket" },
  { verb: "admin", match: "s3:putbucketpolicy", label: "Change bucket policy" },
  { verb: "admin", match: "s3:putbucketpublicaccessblock", label: "Change public access block" },
]

function actionVerbKey(action: string): DamageVerbKey {
  const entry = actionToEnglish(action)
  const lower = action.toLowerCase()
  if (entry.category === "destructive") {
    if (lower.includes("deletebucket")) return "delete"
    return "delete"
  }
  if (entry.category === "exfil") return "read"
  if (entry.category === "control_plane") return "admin"
  if (lower.includes("policy") || lower.includes("acl") || lower.includes("publicaccess")) {
    return "admin"
  }
  return "write"
}

function prefixLines(
  scope: DamageScopePayload | null | undefined,
): GranularDamageLine[] {
  const obs = scope?.scope_observed
  if (!obs) return []
  const lines: GranularDamageLine[] = []
  const readP = obs.read_prefixes ?? []
  const writeP = obs.write_prefixes ?? []
  const deleteP = obs.delete_prefixes ?? []
  if (readP.length) {
    lines.push({
      verb: "read",
      label: "Read objects",
      allowed: true,
      confidence: "Observed",
      detail: `under /${readP[0]}/` + (readP.length > 1 ? ` (+${readP.length - 1} prefixes)` : ""),
    })
  }
  if (writeP.length) {
    lines.push({
      verb: "write",
      label: "Write objects",
      allowed: true,
      confidence: "Observed",
      detail: `under /${writeP[0]}/` + (writeP.length > 1 ? ` (+${writeP.length - 1} prefixes)` : ""),
    })
  }
  if (deleteP.length) {
    lines.push({
      verb: "delete",
      label: "Delete objects",
      allowed: true,
      confidence: "Observed",
      detail: `under /${deleteP[0]}/` + (deleteP.length > 1 ? ` (+${deleteP.length - 1} prefixes)` : ""),
    })
  }
  return lines
}

export function buildGranularDamageLines(
  dc: DamageCapability | null | undefined,
  scope: DamageScopePayload | null | undefined,
  matrix: EffectiveDamageMatrix,
): GranularDamageLine[] {
  if (matrix.blockedReason) {
    return (["read", "write", "delete", "admin"] as DamageVerbKey[]).map((verb) => ({
      verb,
      label: verbLabel(verb),
      allowed: false,
      confidence: "Blocked" as ConfidenceLabel,
      detail: matrix.blockedReason,
    }))
  }

  const lines: GranularDamageLine[] = []
  const seen = new Set<string>()
  const actions = (dc?.direct_actions ?? scope?.scope_today?.actions ?? []).map((a) =>
    a.toLowerCase(),
  )
  const actionSet = new Set(actions)

  for (const action of dc?.direct_actions ?? []) {
    const entry = actionToEnglish(action)
    const verb = actionVerbKey(action)
    const key = `${verb}|${entry.sentence}`
    if (seen.has(key)) continue
    seen.add(key)
    lines.push({
      verb,
      label: entry.sentence,
      allowed: true,
      confidence: "Configured",
    })
  }

  for (const pl of prefixLines(scope)) {
    const key = `${pl.verb}|${pl.label}|${pl.detail}`
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(pl)
  }

  const jewelService = (dc?.jewel_service ?? scope?.node_type ?? "").toLowerCase()
  if (jewelService === "s3" || jewelService === "s3bucket") {
    for (const neg of S3_NEGATIVES) {
      if (actionSet.has(neg.match) || actions.some((a) => a === neg.match || a === "s3:*")) {
        continue
      }
      const key = `neg|${neg.verb}|${neg.label}`
      if (seen.has(key)) continue
      seen.add(key)
      lines.push({
        verb: neg.verb,
        label: neg.label,
        allowed: false,
        confidence: "Unknown",
        detail: "Not in configured IAM scope on this path",
      })
    }
  }

  if (lines.length === 0) {
    for (const verb of ["read", "write", "delete", "admin"] as DamageVerbKey[]) {
      const cell = matrix[verb]
      lines.push({
        verb,
        label: verbLabel(verb),
        allowed: cell.allowed,
        confidence: cell.confidence,
        detail: cell.detail,
      })
    }
  }

  const order: DamageVerbKey[] = ["read", "write", "delete", "admin"]
  return lines.sort(
    (a, b) => order.indexOf(a.verb) - order.indexOf(b.verb) || Number(b.allowed) - Number(a.allowed),
  )
}

export function groupLinesByVerb(
  lines: GranularDamageLine[],
): Record<DamageVerbKey, GranularDamageLine[]> {
  const out: Record<DamageVerbKey, GranularDamageLine[]> = {
    read: [],
    write: [],
    delete: [],
    admin: [],
  }
  for (const line of lines) {
    out[line.verb].push(line)
  }
  return out
}
