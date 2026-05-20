"use client"

// PathKillerMap — the operator-facing path narrative.
//
// Tier-1 enrichment shipped finding badges, MFA pills, assume-role chain
// strips, KMS/DDB/RDS distinct icons, and the per-system posture ring —
// but spread them across the existing 5-column lanes diagram. The
// information was there; the story wasn't.
//
// This view is the story. One screen, three sections, plain English:
//
//   1. HERO         — severity, verbs reaching the jewel, 1-line "what
//                     this is" sentence built from the chain + damage.
//                     LLM narrative when ENABLE_DAMAGE_NARRATIVE=true on
//                     the backend; deterministic fallback otherwise.
//   2. CHAIN        — single horizontal row: Principal → Role(s) →
//                     Crown Jewel, with edge labels (AssumedRole /
//                     USES_ROLE / ACCESSES_RESOURCE), observed dots,
//                     finding pills inline on each card, per-node
//                     posture ring.
//   3. WHAT'S WRONG — every SecurityFinding on the path, expanded with
//                     description + remediation + [Apply] button.
//   4. WHAT TO DO   — risk_reduction.top_actions as a numbered priority
//                     queue with the projected score delta per action
//                     and an [Apply] / [Apply all] CTA.
//   5. LATERAL REACH (collapsed) — "Role X also touches N other
//                     resources" chip per IAM role, click to expand.
//
// Designed to REPLACE the lateral diagram for the default detail-mode
// view. The legacy Flow (TrafficFlowMap) and Lanes (AttackPathFlowViz)
// toggles remain available for operators who want the topology / lateral
// movement diagrams.

import React, { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  Crown,
  Database,
  Globe,
  Key,
  KeyRound,
  Lock,
  Server,
  Shield,
  ShieldOff,
  Table2,
  UserCheck,
  Zap,
} from "lucide-react"
import type {
  IdentityAttackPath,
  NodeFinding,
  PathNodeDetail,
  SystemPosture,
} from "./types"

interface PathKillerMapProps {
  path: IdentityAttackPath
  systemPosture?: SystemPosture | null
  systemName: string
  onRemediateNode: (nodeId: string, dryRun: boolean) => void
  onRemediateAll?: (dryRun: boolean) => void
}

// ─── Type-aware icon for a node card (Identity, Compute, Crown Jewel) ──
function nodeIcon(node: PathNodeDetail): React.ReactNode {
  const t = String(node.type || "").toLowerCase()
  if (t.includes("kms")) return <KeyRound className="w-4 h-4 text-amber-300" />
  if (t.includes("dynamo")) return <Table2 className="w-4 h-4 text-cyan-300" />
  if (t.includes("rds") || t.includes("aurora") || t.includes("redshift")) {
    return <Database className="w-4 h-4 text-violet-300" />
  }
  if (t.includes("secret")) return <Lock className="w-4 h-4 text-rose-300" />
  if (t.includes("s3") || t.includes("bucket")) {
    return <Database className="w-4 h-4 text-emerald-300" />
  }
  if (t === "iamuser") return <UserCheck className="w-4 h-4 text-pink-300" />
  if (t === "iamrole") return <Key className="w-4 h-4 text-purple-300" />
  if (t === "instanceprofile") return <Key className="w-4 h-4 text-amber-300" />
  if (t === "stssession" || t === "accesskey") return <Key className="w-4 h-4 text-fuchsia-300" />
  if (t.includes("cloudtrailprincipal") || t.includes("awsprincipal") || t.includes("principal")) {
    return <UserCheck className="w-4 h-4 text-pink-300" />
  }
  if (t.includes("lambda") || t.includes("function")) return <Zap className="w-4 h-4 text-amber-400" />
  if (t.includes("ec2") || t.includes("instance")) return <Server className="w-4 h-4 text-blue-300" />
  if (t.includes("networkendpoint") || t.includes("networknode") || t.includes("endpoint")) {
    return <Globe className="w-4 h-4 text-cyan-300" />
  }
  return <Shield className="w-4 h-4 text-slate-300" />
}

// ─── Type label sits above the card (e.g. "DYNAMODB TABLE", "IAM ROLE") ──
function nodeTypeLabel(node: PathNodeDetail): string {
  const t = String(node.type || "").toLowerCase()
  if (t.includes("kms")) return "KMS key"
  if (t.includes("dynamo")) return "DynamoDB table"
  if (t.includes("rds") || t.includes("aurora")) return "RDS database"
  if (t.includes("redshift")) return "Redshift cluster"
  if (t.includes("secret")) return "Secret"
  if (t.includes("s3") || t.includes("bucket")) return "S3 bucket"
  if (t === "iamuser") return "IAM user"
  if (t === "iamrole") return "IAM role"
  if (t === "instanceprofile") return "Instance profile"
  if (t === "stssession") return "STS session"
  if (t === "accesskey") return "Access key"
  if (t.includes("cloudtrailprincipal")) return "Principal"
  if (t.includes("awsprincipal")) return "AWS principal"
  if (t.includes("networkendpoint")) return "Network endpoint"
  if (t.includes("lambda")) return "Lambda"
  if (t.includes("ec2instance") || t === "ec2") return "EC2 instance"
  if (t.includes("securitygroup")) return "Security group"
  if (t.includes("nacl") || t.includes("networkacl")) return "Network ACL"
  if (t.includes("subnet")) return "Subnet"
  if (t.includes("vpc")) return "VPC"
  return node.type || "Resource"
}

// Severity → palette (palette matches existing SeverityBadge component)
function severityPalette(sev: string) {
  const s = (sev || "").toUpperCase()
  if (s === "CRITICAL") return { bg: "bg-red-600/20", text: "text-red-100", border: "border-red-500/60", ring: "ring-red-500/70" }
  if (s === "HIGH") return { bg: "bg-red-500/20", text: "text-red-200", border: "border-red-500/40", ring: "ring-red-500/50" }
  if (s === "MEDIUM") return { bg: "bg-amber-500/20", text: "text-amber-200", border: "border-amber-500/40", ring: "ring-amber-500/40" }
  return { bg: "bg-emerald-500/20", text: "text-emerald-200", border: "border-emerald-500/40", ring: "ring-emerald-500/40" }
}

// Posture ring colour from the system-wide PostureRecord score.
// >=75 = green, 55-74 = amber, <55 = red. null = no ring (not-wired).
function postureRingClass(score: number | null | undefined): string {
  if (score == null) return ""
  if (score >= 75) return "ring-2 ring-emerald-400/40"
  if (score >= 55) return "ring-2 ring-amber-400/50"
  return "ring-2 ring-red-500/60"
}

// ─── Chain extraction ──────────────────────────────────────────────────
// Returns the principal → identity → crown-jewel storyline as a linear
// list. Skips compute / SG / NACL / VPC / Subnet detail (those belong in
// the lateral diagram). Order is preserved from the backend's lane sort,
// which already arranged nodes Entry → Compute → Identity → Pivot → Jewel.
function extractStoryNodes(path: IdentityAttackPath): PathNodeDetail[] {
  const wanted = new Set([
    "entry", // CloudTrailPrincipal, IAMUser-as-entry, NetworkEndpoint
    "iam",
    "pivot",
    "crown_jewel",
  ])
  const seen = new Set<string>()
  const out: PathNodeDetail[] = []
  for (const n of path.nodes || []) {
    if (!wanted.has(String(n.lane || ""))) continue
    if (seen.has(n.id)) continue
    seen.add(n.id)
    out.push(n)
  }
  return out
}

// Edge label between two consecutive chain nodes — picks the most
// informative type observed between them in path.edges.
function edgeLabelBetween(
  source: PathNodeDetail,
  target: PathNodeDetail,
  edges: IdentityAttackPath["edges"],
): { label: string; observed: boolean } {
  const PRIORITY: Record<string, number> = {
    ASSUMES_ROLE_ACTUAL: 10,
    ASSUMES_ROLE: 9,
    USED_IDENTITY: 9,
    ACTUAL_API_CALL: 8,
    ACTUAL_S3_ACCESS: 8,
    ACCESSES_RESOURCE: 7,
    USES_ROLE: 6,
    HAS_ROLE: 5,
    HAS_ACCESS_KEY: 5,
  }
  const candidates = (edges || []).filter(
    (e) =>
      (e.source === source.id && e.target === target.id) ||
      (e.source === target.id && e.target === source.id),
  )
  const best = candidates.sort(
    (a, b) => (PRIORITY[b.type] || 0) - (PRIORITY[a.type] || 0),
  )[0]
  if (!best) {
    return { label: "reaches", observed: false }
  }
  const type = String(best.type || "")
  const observed = Boolean(best.is_observed)
  if (type === "ASSUMES_ROLE" || type === "ASSUMES_ROLE_ACTUAL" || type === "USED_IDENTITY") {
    return { label: "AssumedRole", observed }
  }
  if (type === "USES_ROLE") return { label: "uses role", observed }
  if (type === "ACCESSES_RESOURCE" || type === "ACTUAL_API_CALL" || type === "ACTUAL_S3_ACCESS") {
    return { label: "accesses", observed }
  }
  if (type === "HAS_ROLE") return { label: "has role", observed }
  if (type === "HAS_ACCESS_KEY") return { label: "has key", observed }
  return { label: type.toLowerCase().replace(/_/g, " "), observed }
}

// ─── 1-line plain-English story ────────────────────────────────────────
// Uses the LLM narrative when the backend emits one
// (ENABLE_DAMAGE_NARRATIVE=true). Falls back to a deterministic sentence
// built from the chain + verb counts.
function buildStory(path: IdentityAttackPath, story: PathNodeDetail[]): string {
  if (path.damage_narrative) return path.damage_narrative

  const entry = story[0]
  const jewel = story[story.length - 1]
  if (!entry || !jewel) {
    return "Attack path between system resources — drill into the chain below for detail."
  }

  const dc = path.damage_capability
  const verbs = (dc?.direct_verbs ?? dc?.verbs) || { read: 0, write: 0, delete: 0, admin: 0 }
  const verbParts: string[] = []
  if ((verbs.admin || 0) > 0) verbParts.push(`${verbs.admin} admin`)
  if ((verbs.delete || 0) > 0) verbParts.push(`${verbs.delete} delete`)
  if ((verbs.write || 0) > 0) verbParts.push(`${verbs.write} write`)
  if ((verbs.read || 0) > 0) verbParts.push(`${verbs.read} read`)
  const verbsClause = verbParts.length > 0 ? verbParts.join(", ") + " action(s)" : "no observed actions yet"

  const observed = (path.edges || []).some((e) => e.is_observed)
  const evidenceClause = observed ? "CloudTrail-observed" : "configured"

  return `An attacker holding ${entry.name} can perform ${verbsClause} on ${jewel.name} via ${evidenceClause} ${path.hop_count || story.length}-hop path.`
}

// ─── Findings collection (deduped across nodes) ────────────────────────
interface FindingWithNode {
  finding: NodeFinding
  node: PathNodeDetail
}
function collectFindings(path: IdentityAttackPath): FindingWithNode[] {
  const seen = new Set<string>()
  const out: FindingWithNode[] = []
  for (const n of path.nodes || []) {
    for (const f of n.findings || []) {
      const k = `${n.id}|${f.id}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ finding: f, node: n })
    }
  }
  // Severity order: critical → high → medium → low
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  return out.sort(
    (a, b) =>
      (order[a.finding.severity] ?? 9) - (order[b.finding.severity] ?? 9),
  )
}

// ─── Component ─────────────────────────────────────────────────────────
export function PathKillerMap({
  path,
  systemPosture,
  onRemediateNode,
  onRemediateAll,
}: PathKillerMapProps) {
  const [showLateral, setShowLateral] = useState(false)

  const storyNodes = useMemo(() => extractStoryNodes(path), [path])
  const story = useMemo(() => buildStory(path, storyNodes), [path, storyNodes])
  const findings = useMemo(() => collectFindings(path), [path])
  const sev = severityPalette(path.severity?.severity || "LOW")
  const ringClass = postureRingClass(systemPosture?.overall_score ?? null)

  const topActions = (path.risk_reduction?.top_actions || []).slice(0, 5)
  const reduction = path.risk_reduction
    ? Math.max(
        0,
        Math.round(
          ((reduction_current(path) - (path.risk_reduction.achievable_score ?? 0)) /
            Math.max(1, reduction_current(path))) *
            100,
        ),
      )
    : 0

  const verbs =
    path.damage_capability?.direct_verbs ?? path.damage_capability?.verbs ?? null
  const verbCells: { letter: string; count: number; color: string; tip: string }[] = []
  if (verbs) {
    if ((verbs.admin || 0) > 0)
      verbCells.push({ letter: "A", count: verbs.admin, color: "text-red-300", tip: "Admin-equivalent actions reaching this jewel" })
    if ((verbs.delete || 0) > 0)
      verbCells.push({ letter: "D", count: verbs.delete, color: "text-red-300", tip: "Delete actions reaching this jewel" })
    if ((verbs.write || 0) > 0)
      verbCells.push({ letter: "W", count: verbs.write, color: "text-amber-300", tip: "Write/Modify actions reaching this jewel" })
    if ((verbs.read || 0) > 0)
      verbCells.push({ letter: "R", count: verbs.read, color: "text-slate-300", tip: "Read/List actions reaching this jewel" })
  }

  return (
    <div
      className="flex flex-col gap-3 p-4"
      style={{ background: "rgba(2, 6, 23, 0.95)" }}
    >
      {/* ─── HERO ──────────────────────────────────────────────────── */}
      <div
        className={`rounded-xl border ${sev.border} ${sev.bg} px-4 py-3`}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`flex flex-col items-center justify-center w-14 h-14 rounded-lg ${sev.bg} ${sev.text} border ${sev.border}`}
              title="Path severity score (0-100)"
            >
              <span className="text-2xl font-bold tabular-nums leading-none">
                {Math.round(path.severity?.overall_score ?? 0)}
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-wider">
                {path.severity?.severity || "LOW"}
              </span>
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400">
                <span>{path.hop_count ?? storyNodes.length} hops</span>
                <span>·</span>
                <span className={path.evidence_type === "observed" ? "text-emerald-300" : "text-slate-500"}>
                  {path.evidence_type || "configured"}
                </span>
                {path.path_kind_tag && path.path_kind_tag !== "configured" && (
                  <>
                    <span>·</span>
                    <span className="text-indigo-300">{path.path_kind_tag}</span>
                  </>
                )}
              </div>
              <p className="text-sm text-white leading-snug mt-0.5">
                {story}
              </p>
              {path.reduction_narrative ? (
                <p className="text-[12px] text-emerald-300 leading-snug mt-1">
                  → {path.reduction_narrative}
                </p>
              ) : path.risk_reduction?.reduction_summary ? (
                <p className="text-[12px] text-emerald-300 leading-snug mt-1">
                  → {path.risk_reduction.reduction_summary}
                </p>
              ) : null}
            </div>
          </div>

          {/* Verb tile + reduction tile */}
          <div className="flex items-stretch gap-2 shrink-0">
            {verbCells.length > 0 && (
              <div
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700"
                title="Damage capability — concrete actions an attacker reaches on this jewel."
              >
                {verbCells.map((v) => (
                  <div key={v.letter} className="flex flex-col items-center">
                    <span className={`text-[10px] font-bold tabular-nums ${v.color}`}>
                      {v.letter}
                      {v.count}
                    </span>
                  </div>
                ))}
                <span className="text-[9px] text-slate-500 ml-1">damage</span>
              </div>
            )}
            {reduction > 0 && (
              <div
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30"
                title={`Cyntro can reduce this path's score from ${reduction_current(path)} to ${path.risk_reduction?.achievable_score ?? 0}.`}
              >
                <span className="text-[10px] font-bold tabular-nums text-emerald-300">-{reduction}%</span>
                <span className="text-[9px] text-emerald-300/80">fixable</span>
              </div>
            )}
            {systemPosture && systemPosture.overall_score != null && (
              <div
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border ${ringClass.replace("ring-2", "border")}`}
                style={{ background: "rgba(15, 23, 42, 0.6)" }}
                title={`System posture: ${systemPosture.grade ?? "n/a"} (score ${systemPosture.overall_score}). Last observed ${systemPosture.last_observed ?? ""}.`}
              >
                <span className="text-[10px] font-bold text-slate-200">
                  Posture {systemPosture.grade ?? "?"}
                </span>
                <span className="text-[9px] text-slate-500 tabular-nums">
                  {Math.round(systemPosture.overall_score)}/100
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── CHAIN ─────────────────────────────────────────────────── */}
      <div
        className="rounded-xl border border-slate-700/60 px-4 py-4"
        style={{ background: "rgba(15, 23, 42, 0.6)" }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Attack chain
        </div>
        <div className="flex items-stretch gap-2 flex-wrap">
          {storyNodes.map((n, i) => (
            <React.Fragment key={n.id}>
              <ChainCard
                node={n}
                ringClass={ringClass}
                isJewel={n.lane === "crown_jewel"}
                onClick={() => onRemediateNode(n.id, true)}
              />
              {i < storyNodes.length - 1 && (
                <ChainArrow
                  source={n}
                  target={storyNodes[i + 1]}
                  edges={path.edges || []}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ─── WHAT'S WRONG ─────────────────────────────────────────── */}
      {findings.length > 0 && (
        <div
          className="rounded-xl border border-red-500/30 px-4 py-3"
          style={{ background: "rgba(239, 68, 68, 0.06)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-300" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-red-200">
              What's wrong ({findings.length})
            </span>
            <span className="text-[10px] text-slate-500">
              · live SecurityFindings annotating this path
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {findings.map(({ finding, node }) => (
              <FindingRow
                key={`${node.id}|${finding.id}`}
                finding={finding}
                node={node}
                onApply={() => onRemediateNode(node.id, false)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ─── WHAT TO DO ───────────────────────────────────────────── */}
      {topActions.length > 0 && (
        <div
          className="rounded-xl border border-emerald-500/30 px-4 py-3"
          style={{ background: "rgba(16, 185, 129, 0.06)" }}
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-300" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-200">
                What to do
              </span>
              <span className="text-[10px] text-slate-500">
                · priority order — top action first
              </span>
            </div>
            {onRemediateAll && (
              <button
                onClick={() => onRemediateAll(false)}
                className="px-3 py-1 rounded-md text-[11px] font-semibold bg-emerald-600/30 text-emerald-100 border border-emerald-500/50 hover:bg-emerald-600/50 transition-colors"
              >
                Apply all
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {topActions.map((a, i) => (
              <ActionRow
                key={i}
                index={i + 1}
                action={a}
                onApply={() => {
                  // best effort: route to remediation modal for the node carrying this action
                  // by name. The plan panel already does this; here we just hand off.
                  if (a.node_name) {
                    const target = (path.nodes || []).find((n) => n.name === a.node_name)
                    if (target) onRemediateNode(target.id, false)
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ─── LATERAL REACH (collapsed) ────────────────────────────── */}
      {path.reachable_neighbors && path.reachable_neighbors.length > 0 && (
        <div
          className="rounded-xl border border-slate-700/60 px-4 py-2.5"
          style={{ background: "rgba(15, 23, 42, 0.6)" }}
        >
          <button
            onClick={() => setShowLateral((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <div className="flex items-center gap-2">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">
                Lateral reach
              </span>
              <span className="text-[10px] text-slate-500">
                ·{" "}
                {path.reachable_neighbors.length} role
                {path.reachable_neighbors.length === 1 ? "" : "s"} on this path
                touch{" "}
                {path.reachable_neighbors.reduce(
                  (s, r) => s + (r.neighbor_count || 0),
                  0,
                )}{" "}
                other resources
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              {showLateral ? "Hide ▾" : "Show ▸"}
            </span>
          </button>
          {showLateral && (
            <div className="mt-2 flex flex-col gap-1.5">
              {path.reachable_neighbors.map((rn) => (
                <div
                  key={rn.role_id}
                  className="rounded border border-slate-700/60 bg-slate-900/40 p-1.5"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <UserCheck className="w-3 h-3 text-purple-300" />
                    <span className="text-[11px] font-semibold text-slate-200 truncate">
                      {rn.role_name ?? rn.role_id}
                    </span>
                    <span className="text-[10px] text-amber-400 font-bold tabular-nums ml-auto">
                      {rn.neighbor_count}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(rn.by_type)
                      .slice(0, 10)
                      .map(([t, c]) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300"
                        >
                          <span className="font-bold tabular-nums">{c}</span>
                          <span className="opacity-70">{t}</span>
                        </span>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Risk reduction header uses path.severity.overall_score as the "current"
// floor — the plan panel already does this and we mirror so the user
// sees the same -% delta in both places.
function reduction_current(path: IdentityAttackPath): number {
  return (
    path.risk_reduction?.current_score ??
    path.severity?.overall_score ??
    0
  )
}

// ─── Chain card ────────────────────────────────────────────────────────
function ChainCard({
  node,
  ringClass,
  isJewel,
  onClick,
}: {
  node: PathNodeDetail
  ringClass: string
  isJewel: boolean
  onClick?: () => void
}) {
  const findings = node.findings ?? []
  const hasMfa = node.has_mfa
  const isUser = String(node.type || "") === "IAMUser"
  const perms = node.permissions

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-1 min-w-[180px] max-w-[220px] text-left rounded-xl border px-3 py-2 transition-colors ${
        isJewel
          ? "bg-red-500/10 border-red-500/40 hover:bg-red-500/20"
          : "bg-slate-800/70 border-slate-700 hover:bg-slate-800"
      } ${ringClass}`}
      title={`${nodeTypeLabel(node)} · ${node.name}\nClick to open remediation modal.`}
    >
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-400">
        {nodeIcon(node)}
        <span className="font-semibold">{nodeTypeLabel(node)}</span>
      </div>
      <div className="text-[12px] font-semibold text-white truncate w-full" title={node.name}>
        {shortName(node.name)}
      </div>
      {/* Metric line — different per node kind */}
      {perms && (
        <div className="text-[10px] text-slate-400 tabular-nums">
          {perms.used}/{perms.total} perms · <span className="text-amber-400">{perms.unused} unused</span>
        </div>
      )}
      {isJewel && node.access_summary?.total_accessors != null && (
        <div className="text-[10px] text-slate-400 tabular-nums">
          {node.access_summary.total_accessors} accessor{node.access_summary.total_accessors === 1 ? "" : "s"}
        </div>
      )}
      {/* Badge strip — MFA (IAMUser only) + finding count */}
      <div className="flex items-center gap-1 flex-wrap">
        {isUser && (
          <span
            className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold border ${
              hasMfa === true
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : hasMfa === false
                  ? "bg-red-500/20 text-red-200 border-red-500/40"
                  : "bg-slate-700/40 text-slate-400 border-slate-600"
            }`}
            title={
              hasMfa === true
                ? "MFA enabled"
                : hasMfa === false
                  ? "MFA disabled — credential compromise = direct API access"
                  : "MFA status unknown for this user"
            }
          >
            {hasMfa === false ? (
              <ShieldOff className="w-2.5 h-2.5" />
            ) : (
              <Shield className="w-2.5 h-2.5" />
            )}
            {hasMfa === true ? "MFA on" : hasMfa === false ? "MFA off" : "MFA ?"}
          </span>
        )}
        {findings.length > 0 && (
          <span
            className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold bg-red-500/20 text-red-200 border border-red-500/40"
            title={findings.map((f) => `[${f.severity.toUpperCase()}] ${f.title}`).join("\n")}
          >
            <AlertTriangle className="w-2.5 h-2.5" />
            {findings.length} {findings.length === 1 ? "finding" : "findings"}
          </span>
        )}
        {node.is_internet_exposed && (
          <span
            className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold bg-rose-500/20 text-rose-200 border border-rose-500/40"
            title="Internet-exposed"
          >
            <Globe className="w-2.5 h-2.5" />
            public
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Chain arrow with edge label ──────────────────────────────────────
function ChainArrow({
  source,
  target,
  edges,
}: {
  source: PathNodeDetail
  target: PathNodeDetail
  edges: IdentityAttackPath["edges"]
}) {
  const { label, observed } = edgeLabelBetween(source, target, edges)
  const isAssumeRole = label === "AssumedRole"
  return (
    <div
      className="flex flex-col items-center justify-center text-[9px] font-semibold uppercase tracking-wider"
      style={{ minWidth: 90 }}
      title={
        observed
          ? `${label} — observed in CloudTrail`
          : `${label} — configured only, no recent observed event`
      }
    >
      <div className="flex items-center gap-1">
        <span
          className={`inline-block w-10 ${
            isAssumeRole ? "border-t-2 border-dashed" : "border-t"
          } ${observed ? "border-indigo-400 animate-pulse" : "border-slate-600"}`}
        />
        <ArrowRight
          className={`w-3 h-3 ${observed ? "text-indigo-300" : "text-slate-500"}`}
        />
      </div>
      <span className={observed ? "text-indigo-300" : "text-slate-500"}>{label}</span>
    </div>
  )
}

// ─── Finding row (with Apply CTA) ─────────────────────────────────────
function FindingRow({
  finding,
  node,
  onApply,
}: {
  finding: NodeFinding
  node: PathNodeDetail
  onApply: () => void
}) {
  const palette: Record<string, string> = {
    critical: "border-red-500/60 bg-red-500/10",
    high: "border-orange-500/50 bg-orange-500/10",
    medium: "border-amber-500/40 bg-amber-500/10",
    low: "border-slate-600 bg-slate-800/60",
  }
  return (
    <div
      className={`rounded-md border px-3 py-2 ${palette[finding.severity] ?? palette.low}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider font-bold text-slate-300">
              {finding.severity}
            </span>
            <span className="text-[11px] font-semibold text-white">
              {finding.title}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            on <span className="text-slate-300">{node.name}</span>
            {" · "}
            <span className="text-slate-500">{nodeTypeLabel(node)}</span>
          </div>
          {finding.description && (
            <p className="text-[11px] text-slate-200 mt-1 leading-snug">
              {finding.description}
            </p>
          )}
          {finding.remediation && (
            <p className="text-[11px] text-emerald-300 mt-1 leading-snug">
              <span className="font-semibold">Fix:</span> {finding.remediation}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {finding.can_auto_remediate && (
            <span className="text-[9px] text-emerald-300 font-semibold uppercase tracking-wider">
              Auto-fixable
            </span>
          )}
          <button
            onClick={onApply}
            className="px-2.5 py-1 rounded-md text-[10px] font-semibold bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 transition-colors"
            title="Open the remediation modal for this resource"
          >
            Open fix
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Action row (numbered priority queue) ─────────────────────────────
function ActionRow({
  index,
  action,
  onApply,
}: {
  index: number
  action: NonNullable<IdentityAttackPath["risk_reduction"]>["top_actions"][number]
  onApply: () => void
}) {
  const planeColor: Record<string, string> = {
    iam: "text-purple-300",
    network: "text-cyan-300",
    data: "text-emerald-300",
    other: "text-slate-400",
  }
  const locked = action.not_remediable === true
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-900/60 border border-slate-700/50">
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-700 text-[10px] font-bold text-slate-200 shrink-0">
        {index}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-white leading-snug">{action.action}</div>
        <div className="flex items-center gap-2 text-[9px] mt-0.5">
          {action.plane && (
            <span className={`uppercase tracking-wider font-semibold ${planeColor[action.plane] ?? "text-slate-400"}`}>
              {action.plane}
            </span>
          )}
          {action.node_name && (
            <span className="text-slate-500 truncate">
              · {action.node_name}
            </span>
          )}
          {locked && action.not_remediable_reason && (
            <span className="text-amber-400">· {action.not_remediable_reason}</span>
          )}
        </div>
      </div>
      <span className="text-[11px] font-bold text-emerald-300 tabular-nums shrink-0">
        -{Math.abs(action.impact)}
      </span>
      <button
        onClick={onApply}
        disabled={locked}
        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors shrink-0 ${
          locked
            ? "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed"
            : "bg-emerald-600/30 text-emerald-100 border-emerald-500/50 hover:bg-emerald-600/50"
        }`}
        title={locked ? action.not_remediable_reason ?? "Locked" : "Open the remediation modal for this action"}
      >
        {locked ? "Locked" : "Apply"}
      </button>
    </div>
  )
}

// Shorten name for chain card display — strip common prefixes + clip.
function shortName(name: string, maxLen = 22): string {
  if (!name) return "Unknown"
  let short = name
    .replace("arn:aws:s3:::", "")
    .replace("arn:aws:iam::", "")
    .replace(/^arn:aws:[a-z0-9-]+:[a-z0-9-]*:[0-9]+:/, "")
    .replace("aws-service-role/", "")
  if (short.includes("/")) short = short.split("/").pop() || short
  if (short.length > maxLen) short = short.substring(0, maxLen) + "…"
  return short
}
