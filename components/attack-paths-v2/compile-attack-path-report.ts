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
  MicroEnforcement,
  MissingEvidence,
  RiskReduction,
} from "./attack-path-report-types"
import { pathSourceLabel, pathIdentityLabel } from "./path-damage-summary"
import { classifyPathShape, damageVerbPhrase, pathDamageTypes } from "./path-shape"

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

/** Map a backend gate string (materialized :AttackPath vocabulary) to the
 *  GateState enum. Returns undefined for absent/unrecognized values so the
 *  caller can fall back to FE claim-derivation. */
export function toGateState(s?: string | null): GateState | undefined {
  switch ((s ?? "").toUpperCase()) {
    case "OPEN_OBSERVED":
      return "OPEN_OBSERVED"
    case "OPEN_CONFIG":
      return "OPEN_CONFIG"
    case "CLOSED":
      return "CLOSED"
    case "BLOCKED":
      return "BLOCKED"
    case "UNKNOWN":
      return "UNKNOWN"
    default:
      return undefined
  }
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

  // Closure diff (the FE's authoritative "excess to strip" signal) and path
  // shape — needed up-front so the identity claims + narrative branch per shape
  // (spec §1.1) instead of always rendering the Shape-A compute-excess story.
  const removed = closure?.diff.removed_actions ?? []
  const kept = closure?.diff.kept_actions ?? []
  const scoped = closure?.diff.scoped_to_prefixes ?? []
  const shape = classifyPathShape(path, closure ? removed : undefined)
  const damageTypes = pathDamageTypes(path)
  const damageVerbs = damageVerbPhrase(damageTypes)

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
  // Branch by shape: the IMDS instance-credential chain is a COMPUTE primitive
  // — emit it only when a workload is actually on the path (Shape A / hybrid),
  // never on an identity-only assume path (Shape B) where it would assert a
  // compromise that isn't there. Shape B's identity story is the assume hop.
  const identityClaims: Claim[] = []
  if (shape.hasCompute && (roleNode || dc?.role_name)) {
    identityClaims.push({
      id: "identity.imds_chain",
      text: `If ${sourceLabel} is compromised, instance credentials via IMDS resolve to ${roleLabel}`,
      source_refs: [{ kind: "model_rule", id: "imds_instance_profile_chain" }],
      ...grade("INFERRED"), // modeled attacker primitive — narrative only (R2)
    })
  }
  if (shape.hasAssume && shape.assume) {
    // Shape B — the sts:AssumeRole pivot (entry → assumes → assumed). Observed
    // in CloudTrail → OPEN_OBSERVED; trust-policy-only → OPEN_CONFIG (spec §4.1).
    const a = shape.assume
    identityClaims.push({
      id: "identity.assume_hop",
      text: a.observed
        ? `An attacker holding \`${a.entryRole}\` can assume \`${a.assumedRole}\` — Cyntro observed this sts:AssumeRole call${
            a.hitCount ? ` (${a.hitCount}×)` : ""
          } in CloudTrail. No workload compromise is needed; the identity already has standing access`
        : `\`${a.entryRole}\` is permitted to assume \`${a.assumedRole}\` (sts:AssumeRole allowed by trust policy; not yet observed in CloudTrail)`,
      source_refs: [
        {
          kind: "neo4j_edge",
          property: "ASSUMES_ROLE_ACTUAL",
          value: a.observed,
        },
      ],
      ...grade(a.observed ? "OBSERVED" : "CONFIGURED"),
    })
  } else if (roleNode || dc?.role_name) {
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

  // ── Gates ─────────────────────────────────────────────────────────────
  // The backend's materialized :AttackPath node is AUTHORITATIVE for gate
  // state (it computed identity/route/data_plane against CloudTrail + config).
  // Trust it when present; only fall back to the FE claim-derivation (R1) for
  // pure-synthesis paths with no materialized node. Re-deriving over the FE's
  // partial `edges[]` was silently downgrading an observed identity gate to
  // OPEN_CONFIG (the serialized path doesn't always carry the observed edge,
  // but the backend already graded it OPEN_OBSERVED).
  const mp = path.materialized_path
  const derivedGates = {
    entry: deriveGate(entryClaims),
    identity:
      toGateState(mp?.identity_gate) ??
      deriveGate(identityClaims.filter((c) => c.grade !== "INFERRED")),
    network: toGateState(mp?.route_gate) ?? deriveGate(networkClaims),
    data_plane:
      toGateState(mp?.data_plane_gate) ??
      deriveGate(dataClaims.filter((c) => c.id === "data_plane.gate")),
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
      title: shape.hasAssume && !shape.hasCompute ? "Pivot via sts:AssumeRole" : "Become the role",
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
  // NOTE: the bridge does NOT emit exposure_score — that's the backend
  // compiler's R×I×X model (0–1). The IAP overall_score is a different
  // scorer on a /100 scale; passing it here once rendered "EXPOSURE 32.00".
  // The bridge only carries the IAP severity band as a fallback label.
  const chainOpen =
    derivedGates.network !== "CLOSED" && derivedGates.data_plane !== "CLOSED"

  // Shape-aware executive headline (spec §4). Composed from structured fields —
  // NEVER by string-splitting business_sentence. Shape A keeps the renderer's
  // existing diff-driven summary, so headline stays undefined there.
  let headline: string | undefined
  if (shape.kind === "B" && shape.assume) {
    const a = shape.assume
    headline =
      `\`${a.entryRole}\` already holds standing access and can ` +
      `${a.observed ? "assume" : "be permitted to assume"} \`${a.assumedRole}\`` +
      `${
        a.observed
          ? ` — Cyntro observed this sts:AssumeRole${a.hitCount ? ` ${a.hitCount}×` : ""} in CloudTrail`
          : " (allowed by trust policy, not yet observed)"
      }` +
      ` — to ${damageVerbs} in ${targetLabel}. No workload compromise is needed; the identity already has standing access.`
  } else if (shape.kind === "C") {
    headline =
      `\`${roleLabel}\` is already scoped to what it uses — there is no unused permission to remove. ` +
      `The exposure is the standing reach itself: it can ${damageVerbs} ${targetLabel}. ` +
      `Containment here is network/route restriction or a review of the standing grant, not a least-privilege trim.`
  }

  // ── Micro-enforcement (the fix, decomposed across planes) ─────────────
  // Built ONLY from real closure-diff signal — one plane per layer that has
  // backing, so the "fix you approve" strip never invents a plane:
  //   • micro_permissions (IAM) — strip the unused dangerous actions (closure)
  //   • micro_access (DATA)      — scope to the prefixes actually touched
  //   • micro_segmentation (NET) — only when a route gate exists; marked
  //     pending when per-port flow isn't collected (honest, not overclaimed)
  const micro_enforcement: MicroEnforcement[] = []
  if (closure) {
    const removedCats = new Set(
      buildDamageMatrix(removed, [], "CONFIGURED", scoped).map((c) => c.category),
    )
    const permReduces: RiskReduction[] = []
    if (removedCats.has("READ")) permReduces.push("DATA_READ_EXPOSURE")
    if (removedCats.has("DELETE")) permReduces.push("DATA_DELETE_DAMAGE")
    if (removedCats.has("ADMIN")) permReduces.push("DATA_ADMIN_DAMAGE")
    micro_enforcement.push({
      plane: "micro_permissions",
      title: "Micro-permission",
      layer: "IAM",
      evidence_grade: "CONFIGURED",
      summary:
        removed.length > 0
          ? `Strip the ${removed.length} IAM action${removed.length === 1 ? "" : "s"} never used in the observed window; keep the ${kept.length} it actually uses.`
          : `Keep the ${kept.length} action${kept.length === 1 ? "" : "s"} it actually uses — nothing unused to strip.`,
      remove: removed,
      keep: kept,
      scope_to: [],
      claim_ids: gapClaim ? [gapClaim.id] : [],
      reduces: permReduces,
    })
    if (scoped.length > 0) {
      micro_enforcement.push({
        plane: "micro_access",
        title: "Micro-access",
        layer: "DATA",
        evidence_grade: "CONFIGURED",
        summary: `Scope data access to ${scoped.join(", ")} — what the role actually touches.`,
        remove: [],
        keep: kept,
        scope_to: scoped,
        claim_ids: gapClaim ? [gapClaim.id] : [],
        reduces: ["DATA_READ_EXPOSURE"],
      })
    }
    if (gates) {
      micro_enforcement.push({
        plane: "micro_segmentation",
        title: "Micro-segmentation",
        layer: "NETWORK",
        evidence_grade: gates.network_reachable ? "CONFIGURED" : "BLOCKED",
        summary:
          gates.network_reason ??
          (gates.network_reachable
            ? "Keep the network blast radius contained to the route actually used."
            : "Network controls already break this route."),
        remove: [],
        keep: [],
        scope_to: [],
        claim_ids: networkClaims.map((c) => c.id),
        pending_signal: "per-port observed flow for this role",
        reduces: ["FOOTHOLD_EXPOSURE"],
      })
    }
  }

  // Humanize the closure's worst-damage tokens (e.g. "delete_object" → "delete
  // objects", "read" → "read-only") for the "after the safe fix" line — the raw
  // closure tokens are technical and read poorly in the plain-words card.
  const humanizeDamage = (s?: string | null): string => {
    const t = (s ?? "").toLowerCase()
    if (!t) return "standing access"
    if (/delete/.test(t)) return "delete objects"
    if (/admin|acl|policy|posture/.test(t)) return "change bucket posture"
    if (/write|put|tamper/.test(t)) return "write / tamper objects"
    if (/read|get|list/.test(t)) return "read-only"
    return t.replace(/_/g, " ")
  }

  return {
    report_id: `bridge-${path.id}`,
    report_version: "1",
    compiler_version: COMPILER_VERSION,
    path_id: path.attack_path_id ?? path.id,
    current_state: {
      status: chainOpen ? "OPEN_TODAY" : "BLOCKED",
      severity: (path.severity?.severity?.toUpperCase() as
        | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | undefined),
      source_label: sourceLabel,
      target_label: targetLabel,
      summary: path.damage_narrative ?? "",
      shape: shape.kind,
      headline,
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
          expected_result: `Keeps what it uses (worst case drops to ${humanizeDamage(
            closure.after.worst_damage_after,
          )}); function preserved.`,
        }
      : null,
    micro_enforcement,
    missing_evidence: missing,
  }
}
