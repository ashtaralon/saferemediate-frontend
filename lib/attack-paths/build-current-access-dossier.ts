/**
 * Current Access dossier — composed checkpoints for one pinned path.
 *
 * Server-owned fields only. Never invent hops, gates, damage, or cuts.
 * Missing pieces render as UNKNOWN / unavailable — not empty success.
 */

import type {
  ConvergenceHop,
  ConvergencePath,
  InitialAccessEdge,
} from "@/lib/attack-paths/convergence-types"
import { hopRuleTotalCount } from "@/lib/attack-paths/hop-rule-total-count"

export type DossierCheckpointKind =
  | "credential"
  | "execution_network"
  | "authorization"
  | "data_operation"
  | "damage"
  | "cut"

export interface DossierDetailRow {
  label: string
  value: string
}

export interface DossierCheckpoint {
  kind: DossierCheckpointKind
  label: string
  /** Short status chip — gate / evidence / coverage. */
  status: string
  summary: string
  details: DossierDetailRow[]
  evidence?: string | null
}

export interface CurrentAccessDossier {
  path_id: string
  source_id: string | null
  jewel_id: string | null
  from: {
    id: string | null
    name: string
    type: string | null
  }
  to: {
    id: string | null
    name: string
    type: string | null
  }
  headline: string
  evidence: string
  checkpoints: DossierCheckpoint[]
}

function normType(t: string | undefined | null): string {
  return (t || "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

function hopByType(
  hops: ConvergenceHop[],
  predicate: (nt: string, hop: ConvergenceHop) => boolean,
): ConvergenceHop | null {
  for (const h of hops) {
    if (predicate(normType(h.node_type), h)) return h
  }
  return null
}

function gateLabel(gate: string | null | undefined): string {
  const g = (gate ?? "").trim()
  return g.length > 0 ? g : "UNKNOWN"
}

function evidenceLabel(evidence: string | null | undefined): string {
  const e = (evidence ?? "").trim()
  return e.length > 0 ? e : "unknown"
}

function shortName(hop: ConvergenceHop | null): string {
  if (!hop) return "unavailable"
  const n = (hop.name ?? "").trim()
  if (n) return n
  const id = (hop.node_id ?? "").trim()
  if (!id) return "unavailable"
  return id.length > 48 ? `${id.slice(0, 45)}…` : id
}

function rulesRow(hop: ConvergenceHop | null, label: string): DossierDetailRow | null {
  if (!hop) return null
  const coverage = hop.rules_coverage ?? null
  const count = hopRuleTotalCount(hop)
  if (coverage === "COLLECTED" && count != null) {
    return { label, value: `${count} rules · COLLECTED` }
  }
  if (coverage === "NOT_COLLECTED") {
    return { label, value: "rules not collected" }
  }
  if (coverage === "UNKNOWN" || coverage == null) {
    return count != null
      ? { label, value: `${count} rules · coverage unknown` }
      : { label, value: "rules coverage unknown" }
  }
  return { label, value: `coverage ${coverage}` }
}

function formatActionList(raw: unknown, label: string): DossierDetailRow | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const actions = raw.filter((a): a is string => typeof a === "string")
  if (actions.length === 0) return null
  return {
    label,
    value:
      actions.length <= 4
        ? actions.join(", ")
        : `${actions.slice(0, 4).join(", ")} (+${actions.length - 4})`,
  }
}

function formatClosure(
  closure: Record<string, unknown> | null | undefined,
): { summary: string; details: DossierDetailRow[] } {
  if (!closure || typeof closure !== "object") {
    return {
      summary: "No server-authored cut for this path.",
      details: [{ label: "Cut", value: "unavailable" }],
    }
  }
  const details: DossierDetailRow[] = []
  const removeRow = formatActionList(closure.remove_actions, "Remove actions")
  if (removeRow) details.push(removeRow)
  const keepRow = formatActionList(closure.keep_actions, "Keep actions")
  if (keepRow) details.push(keepRow)
  const scopeRow = formatActionList(closure.scope_to_prefixes, "Scope prefixes")
  if (scopeRow) details.push(scopeRow)
  if (closure.preserve_kms_chain === true) {
    details.push({ label: "KMS chain", value: "preserve" })
  }
  const windowDays = closure.remediation_window_days
  if (typeof windowDays === "number" && Number.isFinite(windowDays)) {
    details.push({ label: "Remediation window", value: `${windowDays} days` })
  }
  const notes = closure.posture_notes
  if (typeof notes === "string" && notes.trim()) {
    details.push({ label: "Posture notes", value: notes.trim() })
  } else if (Array.isArray(notes)) {
    const lines = notes.filter((n): n is string => typeof n === "string")
    if (lines.length) {
      details.push({ label: "Posture notes", value: lines.slice(0, 3).join("; ") })
    }
  }
  for (const key of ["hint", "mitigation_hint", "summary", "recommendation"] as const) {
    const v = closure[key]
    if (typeof v === "string" && v.trim()) {
      details.push({ label: "Hint", value: v.trim() })
      break
    }
  }
  if (details.length === 0) {
    const keys = Object.keys(closure).slice(0, 4)
    details.push({
      label: "Closure keys",
      value: keys.length ? keys.join(", ") : "empty object",
    })
  }
  const remove = closure.remove_actions
  const n =
    Array.isArray(remove) ? remove.filter((a) => typeof a === "string").length : 0
  return {
    summary:
      n > 0
        ? `Cut: remove ${n} excess action${n === 1 ? "" : "s"} from the path identity.`
        : "Server closure recommendation present — review cut details.",
    details,
  }
}

function credentialCheckpoint(
  path: ConvergencePath,
  hops: ConvergenceHop[],
): DossierCheckpoint {
  const accessRows: InitialAccessEdge[] = Array.isArray(path.initial_access)
    ? path.initial_access
    : []
  const ia = accessRows[0]
  const profile = hopByType(hops, (nt) => nt.includes("instanceprofile"))
  const role = hopByType(
    hops,
    (nt) =>
      (nt.includes("iamrole") || (nt.includes("role") && !nt.includes("profile"))) &&
      !nt.includes("instanceprofile"),
  )
  const details: DossierDetailRow[] = []
  if (accessRows.length > 0) {
    accessRows.forEach((row, idx) => {
      const bits = [
        row.category,
        row.pivot_name || row.pivot_node_id || null,
        row.verdict_confidence || null,
      ].filter(Boolean)
      details.push({
        label: accessRows.length === 1 ? "Initial access" : `Initial access ${idx + 1}`,
        value: bits.join(" · ") || "present",
      })
      if (row.attacker_narrative?.trim()) {
        details.push({
          label: accessRows.length === 1 ? "Narrative" : `Narrative ${idx + 1}`,
          value: row.attacker_narrative.trim(),
        })
      }
    })
  }
  if (profile) {
    details.push({ label: "Instance profile", value: shortName(profile) })
  }
  const roleName =
    path.identity_name?.trim() ||
    path.identity?.trim() ||
    (role ? shortName(role) : null)
  details.push({
    label: "Credential (role)",
    value: roleName ?? "unavailable",
  })

  const summary = ia?.attacker_narrative?.trim()
    ? ia.attacker_narrative.trim()
    : roleName
      ? `Credential on path: ${roleName}`
      : "Credential hop not present on this path DTO."

  return {
    kind: "credential",
    label: "Credential",
    status: evidenceLabel(ia?.verdict_confidence ?? path.evidence ?? path.confidence),
    summary,
    details,
    evidence: ia?.verdict_confidence ?? path.evidence ?? path.confidence,
  }
}

function executionNetworkCheckpoint(
  path: ConvergencePath,
  hops: ConvergenceHop[],
): DossierCheckpoint {
  const compute = hopByType(
    hops,
    (nt) =>
      nt.includes("ec2") ||
      nt.includes("instance") ||
      nt.includes("lambda") ||
      nt.includes("ecs") ||
      nt.includes("fargate"),
  )
  const subnet = hopByType(hops, (nt) => nt.includes("subnet"))
  const sg = hopByType(
    hops,
    (nt) => nt.includes("securitygroup") || nt === "sg",
  )
  const nacl = hopByType(
    hops,
    (nt) => nt.includes("networkacl") || nt === "nacl",
  )
  const details: DossierDetailRow[] = []
  details.push({
    label: "Execution",
    value: compute
      ? shortName(compute)
      : (path.workload_arn ?? path.source ?? "unavailable"),
  })
  if (subnet) {
    const pub =
      subnet.subnet_public === true
        ? "public"
        : subnet.subnet_public === false
          ? "private"
          : "public/private unknown"
    details.push({ label: "Subnet", value: `${shortName(subnet)} · ${pub}` })
  } else {
    details.push({ label: "Subnet", value: "unavailable on path DTO" })
  }
  const sgRow = rulesRow(sg, "Security group")
  if (sgRow) details.push({ ...sgRow, value: `${shortName(sg)} · ${sgRow.value}` })
  else details.push({ label: "Security group", value: "unavailable on path DTO" })
  const naclRow = rulesRow(nacl, "NACL")
  if (naclRow) details.push({ ...naclRow, value: `${shortName(nacl)} · ${naclRow.value}` })
  else details.push({ label: "NACL", value: "unavailable on path DTO" })

  const rv = path.route_verdict
  if (rv && typeof rv === "object") {
    const gw =
      (typeof rv.winning_gateway === "string" && rv.winning_gateway) ||
      (typeof rv.gateway_name === "string" && rv.gateway_name) ||
      null
    const kind = typeof rv.route_kind === "string" ? rv.route_kind : null
    const basis = typeof rv.basis === "string" ? rv.basis : null
    const ev = typeof rv.evidence === "string" ? rv.evidence : null
    details.push({
      label: "Route verdict",
      value: [kind, gw, basis].filter(Boolean).join(" · ") || "present",
    })
    if (ev) details.push({ label: "Route evidence", value: ev })
  } else {
    details.push({ label: "Route verdict", value: "unavailable" })
  }

  return {
    kind: "execution_network",
    label: "Execution / network",
    status: gateLabel(path.route_gate),
    summary: compute
      ? `Execution on ${shortName(compute)}; route gate ${gateLabel(path.route_gate)}.`
      : `Execution / network spine incomplete on DTO; route gate ${gateLabel(path.route_gate)}.`,
    details,
    evidence: path.evidence ?? path.confidence,
  }
}

function authorizationCheckpoint(
  path: ConvergencePath,
  hops: ConvergenceHop[],
): DossierCheckpoint {
  const role = hopByType(
    hops,
    (nt) =>
      (nt.includes("iamrole") || (nt.includes("role") && !nt.includes("profile"))) &&
      !nt.includes("instanceprofile"),
  )
  const details: DossierDetailRow[] = [
    {
      label: "Identity gate",
      value: gateLabel(path.identity_gate),
    },
    {
      label: "Role",
      value:
        path.identity_name?.trim() ||
        path.identity?.trim() ||
        (role ? shortName(role) : "unavailable"),
    },
  ]
  if (role?.edge_type_from_prev) {
    details.push({ label: "Edge", value: role.edge_type_from_prev })
  }
  if (role?.edge_evidence) {
    details.push({ label: "Edge evidence", value: role.edge_evidence })
  }
  return {
    kind: "authorization",
    label: "Authorization",
    status: gateLabel(path.identity_gate),
    summary: `Identity gate ${gateLabel(path.identity_gate)} for the path credential.`,
    details,
    evidence: role?.edge_evidence ?? path.evidence ?? path.confidence,
  }
}

function dataOperationCheckpoint(
  path: ConvergencePath,
  hops: ConvergenceHop[],
): DossierCheckpoint {
  const access = hopByType(
    hops,
    (nt, h) =>
      nt.includes("s3") ||
      nt.includes("rds") ||
      nt.includes("dynamodb") ||
      nt.includes("secretsmanager") ||
      h.is_crown_jewel === true ||
      (h.edge_type_from_prev ?? "").includes("ACCESSES"),
  )
  const details: DossierDetailRow[] = [
    {
      label: "Data-plane gate",
      value: gateLabel(path.data_plane_gate),
    },
  ]
  if (access) {
    details.push({ label: "Target", value: shortName(access) })
    if (access.edge_type_from_prev) {
      details.push({ label: "Relationship", value: access.edge_type_from_prev })
    }
    if (access.edge_evidence) {
      details.push({ label: "Edge evidence", value: access.edge_evidence })
    }
    if (typeof access.hit_count === "number") {
      details.push({ label: "Hit count", value: String(access.hit_count) })
    }
    if (access.last_seen) {
      details.push({ label: "Last seen", value: access.last_seen })
    }
    if (access.first_seen) {
      details.push({ label: "First seen", value: access.first_seen })
    }
  } else {
    details.push({ label: "Access hop", value: "unavailable on path DTO" })
  }
  return {
    kind: "data_operation",
    label: "Data operation",
    status: gateLabel(path.data_plane_gate),
    summary: access
      ? `${access.edge_type_from_prev ?? "ACCESS"} → ${shortName(access)} (${evidenceLabel(access.edge_evidence)}).`
      : `Data-plane gate ${gateLabel(path.data_plane_gate)}; access hop missing on DTO.`,
    details,
    evidence: access?.edge_evidence ?? path.evidence ?? path.confidence,
  }
}

function damageCheckpoint(path: ConvergencePath): DossierCheckpoint {
  const damage = Array.isArray(path.damage) ? path.damage.filter(Boolean) : []
  const details: DossierDetailRow[] = [
    {
      label: "Damage types",
      value: damage.length ? damage.join(", ") : "none listed",
    },
  ]
  if (path.impact_headline?.trim()) {
    details.push({ label: "Impact", value: path.impact_headline.trim() })
  }
  if (path.business_sentence?.trim()) {
    details.push({ label: "Business", value: path.business_sentence.trim() })
  }
  if (path.severity_label?.trim() || path.severity?.trim()) {
    details.push({
      label: "Severity",
      value: (path.severity_label ?? path.severity ?? "").trim(),
    })
  }
  return {
    kind: "damage",
    label: "Damage",
    status: damage.length ? damage.join(" · ") : "none listed",
    summary: path.impact_headline?.trim()
      || (damage.length
        ? `Reachable damage: ${damage.join(", ")}.`
        : "No damage types on this path DTO."),
    details,
    evidence: path.evidence ?? path.confidence,
  }
}

function cutCheckpoint(path: ConvergencePath): DossierCheckpoint {
  const cut = formatClosure(path.closure_recommendation)
  return {
    kind: "cut",
    label: "Cut",
    status: path.closure_recommendation ? "recommended" : "unavailable",
    summary: cut.summary,
    details: cut.details,
    evidence: path.evidence ?? path.confidence,
  }
}

/**
 * Build the pinned Current Access dossier from one convergence path.
 * Returns null only when path_id is missing.
 */
export function buildCurrentAccessDossier(
  path: ConvergencePath | null | undefined,
): CurrentAccessDossier | null {
  if (!path?.path_id) return null
  const hops = Array.isArray(path.hops) ? path.hops : []
  const evidence = evidenceLabel(path.evidence ?? path.confidence)
  const fromHop = hopByType(
    hops,
    (nt) =>
      nt.includes("ec2") ||
      nt.includes("instance") ||
      nt.includes("lambda") ||
      nt.includes("ecs") ||
      nt.includes("fargate"),
  ) ?? hops[0] ?? null
  const toHop = hops.find((hop) => hop.is_crown_jewel === true)
    ?? hopByType(
      hops,
      (nt, hop) =>
        nt.includes("s3") ||
        nt.includes("rds") ||
        nt.includes("dynamodb") ||
        nt.includes("secretsmanager") ||
        (hop.edge_type_from_prev ?? "").includes("ACCESSES"),
    )
    ?? hops[hops.length - 1]
    ?? null
  const sourceId = path.workload_arn ?? path.source ?? fromHop?.node_id ?? null
  const jewelId = path.cj_target_id ?? toHop?.node_id ?? null
  return {
    path_id: path.path_id,
    source_id: sourceId,
    jewel_id: jewelId,
    from: {
      id: sourceId,
      name: fromHop ? shortName(fromHop) : (path.source ?? "Source unavailable"),
      type: fromHop?.node_type ?? path.source_kind ?? null,
    },
    to: {
      id: jewelId,
      name: toHop ? shortName(toHop) : (path.cj_target_id ?? "Crown jewel"),
      type: toHop?.node_type ?? null,
    },
    headline:
      path.impact_headline?.trim() ||
      path.business_sentence?.trim() ||
      "Pinned Current Access",
    evidence,
    checkpoints: [
      credentialCheckpoint(path, hops),
      executionNetworkCheckpoint(path, hops),
      authorizationCheckpoint(path, hops),
      dataOperationCheckpoint(path, hops),
      damageCheckpoint(path),
      cutCheckpoint(path),
    ],
  }
}

/** Resolve pinned path from fan-in model (exact path_id match). */
export function findPinnedConvergencePath(
  paths: ConvergencePath[],
  pinnedPathId: string | null | undefined,
): ConvergencePath | null {
  const id = (pinnedPathId ?? "").trim()
  if (!id) return null
  return paths.find((p) => p.path_id === id) ?? null
}
