// =============================================================================
// BRIDGE compiler — builds an AttackPathReport client-side from the fields the
// frontend already receives (path, closure-preview, jewel).
// =============================================================================
//
// ⚠ INTERIM. The canonical compiler lives in the BACKEND; once
// GET /api/attack-paths/<id>/report ships, use-attack-path-report.ts prefers
// it and this file becomes dead code to delete. It exists so the renderer can
// be a pure renderer TODAY, and so the contract's rules are executable + tested
// before the backend lands. It restructures REAL graph data only — no mock.
//
// Rules enforced here (same rules the backend compiler must enforce):
//   R1  Gate states are DERIVED from claims. identity = OPEN_OBSERVED only on
//       observed evidence touching the identity itself — an observed hop
//       elsewhere on the path does NOT prove the identity gate.
//   R2  INFERRED / UNKNOWN claims never set can_drive_damage /
//       can_drive_remediation.
//   R3  Damage cells map exact actions → damage class. s3:DeleteObject is
//       object-delete, never bucket-destroy (not_equivalent_to records it).
//   R4  Missing signal → missing_evidence entry, not silence, never prose.

import type {
  IdentityAttackPath,
  CrownJewelSummary,
  PathNodeDetail,
} from "@/components/identity-attack-paths/types"
import { isPrincipalNodeType } from "@/components/identity-attack-paths/types"
import type { ClosurePreview } from "./closure-outcome-types"
import type {
  AttackPathReport,
  Claim,
  DamageCell,
  EvidenceGrade,
  GateState,
  MissingEvidence,
} from "./attack-path-report-types"
import { pathSourceLabel, pathIdentityLabel } from "./path-damage-summary"

const COMPILER_VERSION = "bridge-0.1.0"

const PORT_NAMES: Record<number, string> = {
  22: "SSH", 80: "HTTP", 443: "HTTPS", 3306: "MySQL", 5432: "PostgreSQL",
  3389: "RDP", 6379: "Redis", 27017: "MongoDB", 1433: "MSSQL",
}
const fmtPort = (p: number) => (PORT_NAMES[p] ? `${PORT_NAMES[p]}(${p})` : String(p))

function grade(
  g: EvidenceGrade,
): Pick<Claim, "grade" | "can_drive_damage" | "can_drive_remediation"> {
  const authoritative = g === "OBSERVED" || g === "CONFIGURED" || g === "BLOCKED"
  return { grade: g, can_drive_damage: authoritative, can_drive_remediation: authoritative }
}

/** R1 — derive a gate from its required claims' grades. */
export function deriveGate(claims: Claim[]): GateState {
  if (claims.length === 0) return "UNKNOWN"
  if (claims.some((c) => c.grade === "BLOCKED")) return "CLOSED"
  if (claims.some((c) => c.grade === "OBSERVED")) return "OPEN_OBSERVED"
  if (claims.some((c) => c.grade === "CONFIGURED")) return "OPEN_CONFIG"
  return "UNKNOWN"
}

// R3 — exact-action → damage-class table (S3 slice; backend owns the full
// catalog). Each entry is one cell; an action appears in exactly one cell.
const S3_DAMAGE_CELLS: Array<
  Pick<DamageCell, "cell_id" | "category" | "label" | "not_equivalent_to"> & {
    match: (action: string) => boolean
  }
> = [
  {
    cell_id: "s3.object_read",
    category: "READ",
    label: "Read objects (exfil)",
    match: (a) => /^s3:Get(Object|ObjectVersion)/i.test(a) || /^s3:ListBucket/i.test(a),
  },
  {
    cell_id: "s3.object_write",
    category: "WRITE",
    label: "Write / tamper objects",
    match: (a) => /^s3:PutObject$/i.test(a),
  },
  {
    cell_id: "s3.object_delete",
    category: "DELETE",
    label: "Delete objects",
    not_equivalent_to: ["s3.bucket_delete"],
    match: (a) => /^s3:DeleteObject/i.test(a),
  },
  {
    cell_id: "s3.bucket_delete",
    category: "DELETE",
    label: "Delete the bucket",
    not_equivalent_to: ["s3.object_delete"],
    match: (a) => /^s3:DeleteBucket$/i.test(a),
  },
  {
    cell_id: "s3.posture_admin",
    category: "ADMIN",
    label: "Rewrite bucket posture (ACL / policy / logging / versioning)",
    match: (a) =>
      /^s3:Put(Bucket(Acl|Policy|Logging|Versioning|Notification|Cors)|ObjectAcl)/i.test(a),
  },
]

export function buildDamageMatrix(
  actions: string[],
  causedBy: string[],
  evidenceGrade: EvidenceGrade,
  scopeValues: string[],
): DamageCell[] {
  const cells: DamageCell[] = []
  for (const def of S3_DAMAGE_CELLS) {
    const matched = actions.filter((a) => def.match(a))
    if (matched.length === 0) continue
    cells.push({
      cell_id: def.cell_id,
      category: def.category,
      label: def.label,
      status: "ALLOWED",
      actions: matched,
      evidence_grade: evidenceGrade,
      scope: scopeValues.length
        ? { type: "prefix", values: scopeValues }
        : { type: "unknown", values: [] },
      not_equivalent_to: def.not_equivalent_to,
      caused_by_claim_ids: causedBy,
    })
  }
  return cells
}

export function compileAttackPathReport(
  path: IdentityAttackPath,
  jewel?: CrownJewelSummary | null,
  closure?: ClosurePreview | null,
): AttackPathReport {
  const nodes = path.nodes ?? []
  const dc = path.damage_capability
  const gates = dc?.gates

  const foothold: PathNodeDetail | undefined =
    nodes.find((n) => !isPrincipalNodeType(n.type)) ?? nodes[0]
  const roleNode = nodes.find((n) => n.type === "IAMRole")
  const jewelNode = nodes[nodes.length - 1]
  const sourceLabel = pathSourceLabel(path)
  const roleLabel = pathIdentityLabel(path)
  const targetLabel = jewel?.name ?? dc?.jewel_name ?? jewelNode?.name ?? "crown jewel"

  const claims: Claim[] = []
  const missing: MissingEvidence[] = []

  // ── Entry claims ───────────────────────────────────────────────────────
  const entryClaims: Claim[] = []
  if (foothold?.is_internet_exposed) {
    entryClaims.push({
      id: "entry.internet_exposed",
      text: `${foothold.name} is internet-facing`,
      source_refs: [
        { kind: "neo4j_node", id: foothold.id, property: "is_internet_exposed", value: true },
      ],
      ...grade("CONFIGURED"),
    })
  }
  const openPorts =
    foothold?.open_ports ?? foothold?.internet_exposure_alert?.open_ports ?? []
  if (openPorts.length > 0) {
    entryClaims.push({
      id: "entry.open_ports",
      text: `Security group opens ${openPorts.slice(0, 6).map(fmtPort).join(", ")}${
        openPorts.length > 6 ? ` (+${openPorts.length - 6})` : ""
      } to the internet`,
      source_refs: [
        { kind: "collector_property", id: foothold?.id, property: "open_ports", value: openPorts },
      ],
      ...grade("CONFIGURED"),
    })
  }
  if (!foothold?.open_ports && !foothold?.internet_exposure_alert) {
    missing.push({
      signal: "foothold ingress rules / open ports",
      why_it_matters: "names the front doors an attacker can knock on",
      collector_or_field: "PathNodeDetail.open_ports / internet_exposure_alert",
    })
  }
  claims.push(...entryClaims)

  // ── Identity claims (R1: observed only if evidence touches the identity) ─
  const identityClaims: Claim[] = []
  if (roleNode || dc?.role_name) {
    identityClaims.push({
      id: "identity.imds_chain",
      text: `If ${sourceLabel} is compromised, instance credentials via IMDS resolve to ${roleLabel}`,
      source_refs: [{ kind: "model_rule", id: "imds_instance_profile_chain" }],
      ...grade("INFERRED"), // modeled attacker primitive — narrative only (R2)
    })
    const roleIds = new Set(
      [roleNode?.id, ...nodes.filter((n) => isPrincipalNodeType(n.type)).map((n) => n.id)].filter(
        Boolean,
      ) as string[],
    )
    const observedIdentityEdge = (path.edges ?? []).find(
      (e) => e.is_observed && (roleIds.has(e.source) || roleIds.has(e.target)),
    )
    if (observedIdentityEdge) {
      identityClaims.push({
        id: "identity.observed_use",
        text: `CloudTrail shows ${roleLabel} actively used on this path${
          observedIdentityEdge.hit_count ? ` (${observedIdentityEdge.hit_count} observed calls)` : ""
        }`,
        source_refs: [
          {
            kind: "neo4j_edge",
            id: `${observedIdentityEdge.source}->${observedIdentityEdge.target}`,
            property: "is_observed",
            value: true,
          },
        ],
        ...grade("OBSERVED"),
      })
    } else {
      identityClaims.push({
        id: "identity.configured_grant",
        text: `${roleLabel} is attached to ${sourceLabel}; live use of this identity on this path is not observed`,
        source_refs: [{ kind: "neo4j_node", id: roleNode?.id, property: "type", value: "IAMRole" }],
        ...grade("CONFIGURED"),
      })
    }
  }
  claims.push(...identityClaims)

  // ── Network / route claims ────────────────────────────────────────────
  const networkClaims: Claim[] = []
  if (gates) {
    networkClaims.push({
      id: "network.route",
      text: gates.network_reachable
        ? (gates.network_reason ?? "The network path to the jewel is reachable")
        : (gates.network_reason ?? "Network controls break the route"),
      source_refs: [
        { kind: "collector_property", property: "gates.network_reachable", value: gates.network_reachable },
      ],
      ...grade(gates.network_reachable ? "CONFIGURED" : "BLOCKED"),
    })
  } else {
    missing.push({
      signal: "network route gate",
      why_it_matters: "without it, reachability is a verification gap, not a free pass",
      collector_or_field: "damage_capability.gates.network_reachable",
    })
  }
  claims.push(...networkClaims)

  // ── Data-plane claims ─────────────────────────────────────────────────
  const dataClaims: Claim[] = []
  if (gates) {
    dataClaims.push({
      id: "data_plane.gate",
      text: gates.data_plane_reachable
        ? (gates.data_plane_reason ?? "Data-plane access to the jewel is permitted")
        : (gates.data_plane_reason ?? "Data-plane controls block access"),
      source_refs: [
        { kind: "collector_property", property: "gates.data_plane_reachable", value: gates.data_plane_reachable },
      ],
      ...grade(gates.data_plane_reachable ? "CONFIGURED" : "BLOCKED"),
    })
  }
  const dataClass = jewelNode?.data_classification ?? jewel?.data_classification
  if (dataClass) {
    dataClaims.push({
      id: "data_plane.classification",
      text: `${targetLabel} holds ${dataClass} data`,
      source_refs: [
        { kind: "neo4j_node", id: jewelNode?.id, property: "data_classification", value: dataClass },
      ],
      ...grade("CONFIGURED"),
    })
  }
  // R4 — posture signals the frontend types don't carry yet.
  missing.push(
    {
      signal: "bucket policy present / restrictions",
      why_it_matters: "decides whether stolen creds work from anywhere on the internet",
      collector_or_field: "S3GetBucketPolicy (backend collector + PathNodeDetail field)",
    },
    {
      signal: "object-lock / versioning / replication status",
      why_it_matters: "decides whether delete = unrecoverable destruction",
      collector_or_field: "S3 bucket metadata collector",
    },
  )
  claims.push(...dataClaims)

  // ── GAP + damage matrix (driven ONLY by authoritative claims, R2) ──────
  const removed = closure?.diff.removed_actions ?? []
  const kept = closure?.diff.kept_actions ?? []
  const scoped = closure?.diff.scoped_to_prefixes ?? []
  let gapClaim: Claim | null = null
  if (removed.length > 0) {
    gapClaim = {
      id: "gap.unused_dangerous",
      text: `${roleLabel} is granted ${removed.length} dangerous actions it never used in the observation window`,
      source_refs: [{ kind: "closure_preview", property: "diff.removed_actions", value: removed }],
      ...grade("CONFIGURED"),
    }
    claims.push(gapClaim)
  }
  const damageDrivers = [...identityClaims, ...dataClaims, gapClaim]
    .filter((c): c is Claim => !!c && c.can_drive_damage)
    .map((c) => c.id)
  const allowedActions = [...new Set([...(dc?.direct_actions ?? []), ...removed, ...kept])]
  const damage_matrix = buildDamageMatrix(allowedActions, damageDrivers, "CONFIGURED", scoped)

  // ── Gates (derived, R1) ───────────────────────────────────────────────
  const derivedGates = {
    entry: deriveGate(entryClaims),
    identity: deriveGate(identityClaims.filter((c) => c.grade !== "INFERRED")),
    network: deriveGate(networkClaims),
    data_plane: deriveGate(dataClaims.filter((c) => c.id === "data_plane.gate")),
  }

  // ── Attacker steps (claim-grounded prose) ─────────────────────────────
  const attacker_steps: AttackPathReport["attacker_steps"] = []
  if (entryClaims.length > 0) {
    attacker_steps.push({
      phase: "LAND_ON_FOOTHOLD",
      title: "Land on the box",
      body: entryClaims.map((c) => c.text).join(". ") + ".",
      claim_ids: entryClaims.map((c) => c.id),
    })
  }
  if (identityClaims.length > 0) {
    attacker_steps.push({
      phase: "BECOME_IDENTITY",
      title: "Become the role",
      body: identityClaims.map((c) => c.text).join(". ") + ".",
      claim_ids: identityClaims.map((c) => c.id),
    })
  }
  if (networkClaims.length > 0) {
    attacker_steps.push({
      phase: "REACH_JEWEL",
      title: "Reach the jewel",
      body: networkClaims.map((c) => c.text).join(". ") + ".",
      claim_ids: networkClaims.map((c) => c.id),
    })
  }
  if (gapClaim) {
    attacker_steps.push({
      phase: "EXPLOIT_GAP",
      title: "Privilege escalation — the fix target",
      body: `${gapClaim.text}: ${removed.slice(0, 4).join(", ")}${
        removed.length > 4 ? ` (+${removed.length - 4} more)` : ""
      }.${kept.length ? ` In practice it only ${kept.slice(0, 2).join(" / ")}${scoped.length ? ` on ${scoped.join(", ")}` : ""}.` : ""}`,
      claim_ids: [gapClaim.id],
    })
  }
  if (dataClaims.length > 0) {
    attacker_steps.push({
      phase: "HIT_CROWN_JEWEL",
      title: "Hit the crown jewel",
      body: dataClaims.map((c) => c.text).join(". ") + ".",
      claim_ids: dataClaims.map((c) => c.id),
    })
  }

  // ── Assembled report ──────────────────────────────────────────────────
  const exposure = path.severity?.overall_score
  const chainOpen =
    derivedGates.network !== "CLOSED" && derivedGates.data_plane !== "CLOSED"

  return {
    report_id: `bridge-${path.id}`,
    report_version: "1",
    compiler_version: COMPILER_VERSION,
    path_id: path.attack_path_id ?? path.id,
    current_state: {
      status: chainOpen ? "OPEN_TODAY" : "BLOCKED",
      exposure_score: exposure,
      severity: (path.severity?.severity?.toUpperCase() as
        | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | undefined),
      source_label: sourceLabel,
      target_label: targetLabel,
      summary: path.damage_narrative ?? "",
    },
    claims,
    gates: derivedGates,
    attacker_steps,
    damage_matrix,
    gap:
      removed.length > 0 || kept.length > 0
        ? {
            observed_actions: kept,
            observed_scopes: scoped,
            unused_dangerous_actions: removed,
            claim_ids: gapClaim ? [gapClaim.id] : [],
          }
        : null,
    blast_radius: path.target_blast_radius
      ? {
          brs: path.target_blast_radius.brs,
          band: path.target_blast_radius.band,
          headline: path.target_blast_radius.rationale?.[0],
        }
      : null,
    remediation_diff: closure
      ? {
          diff_id: `closure-${path.id}`,
          // Backend must emit the canonical hash; the bridge cannot mint one.
          diff_hash: "",
          delivered_as: closure.diff.delivered_as,
          keep_actions: kept,
          remove_actions: removed,
          scope_to: scoped,
        }
      : null,
    safety_decision: closure
      ? {
          gate:
            closure.verdict === "auto_eligible"
              ? "AUTO_ELIGIBLE"
              : closure.verdict === "blocked"
                ? "BLOCKED"
                : "REVIEW_REQUIRED",
          reasons: closure.verdict_reasons,
        }
      : null,
    verification_target: closure
      ? {
          preserve: kept,
          remove_damage_cells: buildDamageMatrix(removed, [], "CONFIGURED", scoped).map(
            (c) => c.cell_id,
          ),
          expected_result: `worst case ${closure.after.worst_damage_before} → ${closure.after.worst_damage_after}; function preserved`,
        }
      : null,
    missing_evidence: missing,
  }
}
