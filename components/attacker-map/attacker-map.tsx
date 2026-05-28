"use client"

import React, { useMemo, useState, useCallback } from "react"
import { Loader2, AlertTriangle, RefreshCw, Shield, ChevronLeft, ChevronRight, Target, Route, Workflow } from "lucide-react"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { AttackerFlowCanvas } from "./attacker-flow-canvas"
import { ThreePlaneRiskCard, ThreePlaneQuarantineCard, SshFlagCallout } from "./three-plane-cards"
import { AllPathsGraph } from "./all-paths-graph"
import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"
import { S3RemediationModal } from "@/components/s3-remediation-modal"
import { SGRemediationModal } from "@/components/sg-remediation-modal"
import { isTrustEnvelope } from "@/components/trust/trust-envelope-badge"
import type {
  IdentityAttackPathsResponse,
  IdentityAttackPath,
  PathNodeDetail,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"

// Attacker Map — Phase 1 canonical attacker view.
//
// Lives alongside the existing Attack Paths tab during the transition.
// Both consume the same /api/proxy/identity-attack-paths/{system} endpoint.
// Difference: Attacker Map is the opinionated three-plane experience
// (single canvas, real Neo4j data, Quarantine narrative). Attack Paths
// keeps the legacy lane/flow toggle UX until we're ready to deprecate.
//
// "no mock data" rule per docs/CYNTRO-PRODUCT-RULES.md — every number
// rendered comes from the live API response. Missing data surfaces
// explicitly as "not available yet" rather than as a plausible value.

interface AttackerMapProps {
  systemName: string
}

// Click-through routes per node type — same engines as Least Privilege.
type ModalKind = "iam" | "s3" | "sg" | null

// ── Crown jewel dedup ────────────────────────────────────────────────
//
// Why this exists: the collector layer emits the same logical AWS
// resource as multiple Neo4j nodes when different collectors disagree
// on shape — e.g. `SafeRemediate-Checkpoints` appears as 5 distinct
// nodes (CamelCase id, lowercase id, ARN id, id=null, mixed
// [Resource]/[Service] label sets, mixed system_name tags). The
// backend response carries those duplicates, the dropdown renders them
// verbatim, and the operator sees the same jewel listed 2-3 times.
//
// This canonicalization mirrors the (name.lower(), type.lower()) merge
// applied to nodes in all-paths-graph.tsx — single source of truth for
// the FE-side dedup until the collectors are fixed upstream. See the
// Neo4j data shape that motivated it: HANDOFF.md / session transcript.
//
// Picks the canonical id by preferring ARN-shaped ids (guaranteed
// unique + correctly parsed), then longest id as a tiebreaker. Merges
// path_count as a union (each variant's BFS slice is disjoint), takes
// max priority/severity, OR-aggregates is_internet_exposed. Returns
// an id-rewrite map so path-level filters can map merged-away variant
// ids forward to the canonical id without losing path associations.

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

function pickCanonicalJewelId(ids: string[]): string {
  if (ids.length === 1) return ids[0]
  const arnLike = ids.filter((i) => i.startsWith("arn:"))
  const candidates = arnLike.length > 0 ? arnLike : ids
  return [...candidates].sort((a, b) => b.length - a.length)[0]
}

interface JewelDedup {
  jewels: CrownJewelSummary[]
  // Map of any-variant-id → canonical-id. Used to map paths whose
  // crown_jewel_id points at a merged-away variant.
  idCanonical: Map<string, string>
}

function canonicalizeJewels(raw: CrownJewelSummary[]): JewelDedup {
  // Drop null/empty-id entries — id=null nodes are a collector data
  // quality bug. Without a real id the React <option key> prop fails
  // and the select can't read back the selection.
  const valid = raw.filter((j) => typeof j?.id === "string" && j.id.length > 0)

  const groups = new Map<string, CrownJewelSummary[]>()
  for (const j of valid) {
    const key = `${(j.name || "").toLowerCase().trim()}|${(j.type || "").toLowerCase().trim()}`
    const arr = groups.get(key) ?? []
    arr.push(j)
    groups.set(key, arr)
  }

  const merged: CrownJewelSummary[] = []
  const idCanonical = new Map<string, string>()

  for (const variants of groups.values()) {
    if (variants.length === 1) {
      const only = variants[0]
      idCanonical.set(only.id, only.id)
      merged.push(only)
      continue
    }
    const canonicalId = pickCanonicalJewelId(variants.map((v) => v.id))
    for (const v of variants) idCanonical.set(v.id, canonicalId)

    const canonical = variants.find((v) => v.id === canonicalId) ?? variants[0]
    const totalPaths = variants.reduce((s, v) => s + (v.path_count ?? 0), 0)
    const maxPriority = Math.max(...variants.map((v) => v.priority_score ?? 0))
    const maxRisk = Math.max(...variants.map((v) => v.highest_risk_score ?? 0))
    const anyExposed = variants.some((v) => v.is_internet_exposed === true)
    const sevWinner = variants.reduce<string>((maxSev, v) => {
      const r = SEVERITY_RANK[v.severity] ?? 0
      const m = SEVERITY_RANK[maxSev] ?? 0
      return r > m ? v.severity : maxSev
    }, "LOW")

    // crown_jewel_source resolution: if any variant is in-system
    // (no source or source === "default"), the jewel IS in-system —
    // the "reachable_only" variant is the duplicate that the
    // cross-system backend query happened to re-emit. Prefer the
    // in-system semantics so the UI doesn't show a misleading
    // cross-system glyph on something tagged here.
    const anyInSystem = variants.some(
      (v) => !((v as any).crown_jewel_source) || (v as any).crown_jewel_source === "default",
    )
    const sourceField: Record<string, string> = anyInSystem
      ? {}
      : { crown_jewel_source: "reachable_only" }

    merged.push({
      ...canonical,
      id: canonicalId,
      path_count: totalPaths,
      priority_score: maxPriority,
      highest_risk_score: maxRisk,
      is_internet_exposed: anyExposed,
      severity: sevWinner as CrownJewelSummary["severity"],
      ...sourceField,
    } as CrownJewelSummary)
  }

  merged.sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
  return { jewels: merged, idCanonical }
}

function classifyForModal(node: PathNodeDetail): ModalKind {
  const t = (node.type || "").toLowerCase()
  if (t.includes("s3") || t.includes("bucket")) return "s3"
  if (t.includes("securitygroup")) return "sg"
  if (t.includes("iam") || t.includes("role") || t.includes("instanceprofile")) return "iam"
  return null
}

function extractSgId(node: PathNodeDetail): string {
  if (node.id?.startsWith("sg-")) return node.id
  if (node.name?.startsWith("sg-")) return node.name
  const match = node.id?.match(/sg-[a-z0-9]+/)
  return match?.[0] ?? node.id
}

export function AttackerMap({ systemName }: AttackerMapProps) {
  const [selectedJewelId, setSelectedJewelId] = useState<string | null>(null)
  const [selectedPathIndex, setSelectedPathIndex] = useState(0)
  // View mode: "single" = one path drilled in with three-plane cards
  // (Phase 1, default). "all" = every path to the selected jewel
  // converging in one DAG (Phase 2 — choke point view).
  const [viewMode, setViewMode] = useState<"single" | "all">("single")

  // Click-through modal state — exactly the same modals as the legacy
  // Least Privilege sidebar so the operator never loses context.
  const [iamModalOpen, setIamModalOpen] = useState(false)
  const [s3ModalOpen, setS3ModalOpen] = useState(false)
  const [sgModalOpen, setSgModalOpen] = useState(false)
  const [modalResource, setModalResource] = useState<{ name: string; sgId?: string } | null>(null)

  // Stale-while-revalidate fetch — see use-cached-fetch.ts for rationale.
  const fetchUrl = systemName
    ? `/api/proxy/identity-attack-paths/${encodeURIComponent(systemName)}?envelope=true`
    : null
  const { data: rawData, loading, error, retry } = useCachedFetch<any>(fetchUrl, {
    cacheKey: `attacker-map:${systemName}`,
  })

  // Unwrap optional TrustEnvelope wrapper — same shape as the existing
  // Attack Paths tab.
  const data = useMemo<IdentityAttackPathsResponse | null>(() => {
    if (!rawData) return null
    return (isTrustEnvelope(rawData) ? rawData.result : rawData) as IdentityAttackPathsResponse
  }, [rawData])

  // Canonicalize the crown-jewel list FIRST — collapse collector-side
  // duplicates that would otherwise show e.g. "SafeRemediate-Checkpoints"
  // twice in the dropdown (in-system tagged copy + cross-system reach
  // copy of the same logical DynamoDB table). See canonicalizeJewels
  // for the full rationale.
  const { jewels, idCanonical } = useMemo(
    () => canonicalizeJewels(data?.crown_jewels ?? []),
    [data?.crown_jewels],
  )

  // activeJewelId resolves through the canonical map so a stale
  // selectedJewelId (pointing at a merged-away variant) still tracks
  // its surviving canonical entry instead of falling to null.
  const activeJewelId = useMemo(() => {
    if (selectedJewelId) {
      return idCanonical.get(selectedJewelId) ?? selectedJewelId
    }
    return jewels[0]?.id ?? null
  }, [selectedJewelId, idCanonical, jewels])

  const jewelPaths: IdentityAttackPath[] = useMemo(() => {
    if (!data || !activeJewelId) return []
    // Each path's crown_jewel_id may point at a merged-away variant
    // (the backend doesn't dedup before emitting paths). Resolve
    // through the canonical map so the path-to-jewel association
    // survives the dedup. Falls back to direct match for paths whose
    // crown_jewel_id isn't in the rewrite table (shouldn't happen but
    // keeps the filter conservative).
    return (data.paths ?? []).filter(
      (p) => (idCanonical.get(p.crown_jewel_id) ?? p.crown_jewel_id) === activeJewelId,
    )
  }, [data, activeJewelId, idCanonical])

  const currentPath = jewelPaths[selectedPathIndex] ?? null

  const handleNodeClick = useCallback((node: PathNodeDetail) => {
    const kind = classifyForModal(node)
    if (!kind) return
    if (kind === "iam") {
      setModalResource({ name: node.name })
      setIamModalOpen(true)
    } else if (kind === "s3") {
      setModalResource({ name: node.name })
      setS3ModalOpen(true)
    } else if (kind === "sg") {
      setModalResource({ name: node.name, sgId: extractSgId(node) })
      setSgModalOpen(true)
    }
  }, [])

  // ── Loading / error / empty branches ────────────────────────────

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <p className="text-sm text-slate-400">Loading attacker map…</p>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
          <p className="text-sm text-white font-medium">Failed to load attack paths</p>
          <p className="text-xs text-slate-400">{error}</p>
          <button
            onClick={() => retry()}
            className="mt-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data || (data.total_paths ?? 0) === 0 || jewels.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="flex flex-col items-center gap-3 text-center max-w-md px-6">
          <Shield className="w-10 h-10 text-green-400" />
          <p className="text-sm text-white font-medium">No attack paths to crown jewels</p>
          <p className="text-xs text-slate-400">
            No paths from entry points to S3 / RDS / DynamoDB / KMS / Secrets resources were detected for {systemName}.
          </p>
        </div>
      </div>
    )
  }

  if (!currentPath) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <p className="text-sm text-slate-400">Select a crown jewel to view its attack paths</p>
      </div>
    )
  }

  const activeJewel = jewels.find((j) => j.id === activeJewelId) ?? jewels[0]
  const totalPathsForJewel = jewelPaths.length

  // Provenance summary — count of observed edges on this path. Honest
  // about evidence quality per "no mock data" rule.
  const observedEdgeCount = (currentPath.edges ?? []).filter((e) => e.is_observed).length
  const totalEdgeCount = (currentPath.edges ?? []).length

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]" style={{ background: "rgb(15, 23, 42)" }}>
      {/* Header */}
      <div
        className="px-5 py-3 border-b"
        style={{
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)",
          borderColor: "rgba(148, 163, 184, 0.15)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Target className="w-4 h-4 text-emerald-400" />
              <h2 className="text-base font-semibold text-white">Attacker Map</h2>
              <span className="text-xs text-slate-400 truncate">{systemName}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              <span className="font-semibold text-slate-200 tabular-nums">{data.total_paths ?? 0}</span> paths to{" "}
              <span className="font-semibold text-slate-200 tabular-nums">{data.total_jewels ?? 0}</span> crown jewels
              {(data.exposed_jewels ?? 0) > 0 ? (
                <>
                  {" · "}
                  <span className="font-semibold text-red-400 tabular-nums">{data.exposed_jewels}</span> internet-exposed
                </>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle — single path (Phase 1) vs all paths (Phase 2) */}
            <div
              className="inline-flex items-center p-0.5 rounded-md"
              style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(148,163,184,0.15)" }}
            >
              <button
                onClick={() => setViewMode("single")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
                style={
                  viewMode === "single"
                    ? { background: "rgba(20,184,166,0.15)", color: "#5eead4", border: "1px solid rgba(20,184,166,0.35)" }
                    : { color: "#94a3b8", border: "1px solid transparent" }
                }
                title="Drill into one path with three-plane risk + Quarantine cards"
              >
                <Route className="w-3 h-3" />
                Single path
              </button>
              <button
                onClick={() => setViewMode("all")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
                style={
                  viewMode === "all"
                    ? { background: "rgba(20,184,166,0.15)", color: "#5eead4", border: "1px solid rgba(20,184,166,0.35)" }
                    : { color: "#94a3b8", border: "1px solid transparent" }
                }
                title="Every path to this jewel in one graph — shared nodes drawn once, choke points visible"
              >
                <Workflow className="w-3 h-3" />
                All paths
              </button>
            </div>
            <button
              onClick={() => retry()}
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
        {/* Path subheader: which jewel + path nav */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5" style={{ letterSpacing: "0.08em" }}>
              Crown jewel
            </div>
            <select
              value={activeJewelId ?? ""}
              onChange={(e) => {
                setSelectedJewelId(e.target.value)
                setSelectedPathIndex(0)
              }}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 font-medium"
            >
              {jewels.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.crown_jewel_source === "reachable_only" ? "↗ " : ""}
                  {j.name} · {j.type} · {j.path_count} path{j.path_count === 1 ? "" : "s"}
                </option>
              ))}
            </select>
            {activeJewel ? (
              <div className="text-[10px] text-slate-500 mt-1">
                priority {activeJewel.priority_score?.toFixed?.(0) ?? "—"} · severity {activeJewel.severity}
                {activeJewel.crown_jewel_source === "reachable_only" ? (
                  <>
                    {" · "}
                    <span className="text-emerald-400 font-medium">
                      ↗ reached by this system's roles · jewel tagged to another system
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          {viewMode === "single" && totalPathsForJewel > 1 ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedPathIndex((i) => Math.max(0, i - 1))}
                disabled={selectedPathIndex === 0}
                className="p-1 rounded text-slate-300 hover:bg-slate-700/50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous path"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-300 tabular-nums">
                path {selectedPathIndex + 1} of {totalPathsForJewel}
              </span>
              <button
                onClick={() => setSelectedPathIndex((i) => Math.min(totalPathsForJewel - 1, i + 1))}
                disabled={selectedPathIndex >= totalPathsForJewel - 1}
                className="p-1 rounded text-slate-300 hover:bg-slate-700/50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next path"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : viewMode === "all" ? (
            <div className="text-[10px] text-slate-400">
              <span className="font-semibold text-slate-200 tabular-nums">{totalPathsForJewel}</span> paths in one graph
            </div>
          ) : null}
        </div>

        {viewMode === "single" ? (
          <>
            {/* Flow canvas — Phase 1 single-path view */}
            <AttackerFlowCanvas
              path={currentPath}
              onNodeClick={handleNodeClick}
              jewelSource={activeJewel?.crown_jewel_source ?? null}
            />
            <ThreePlaneRiskCard path={currentPath} />
            <SshFlagCallout path={currentPath} />
            <ThreePlaneQuarantineCard path={currentPath} />
            <div
              className="flex justify-between items-center pt-3 text-[11px] text-slate-400"
              style={{ borderTop: "1px solid rgba(148, 163, 184, 0.15)" }}
            >
              <div>
                Evidence: <span className="tabular-nums">{observedEdgeCount}</span> of{" "}
                <span className="tabular-nums">{totalEdgeCount}</span> edges observed (rest config-derived) · path id{" "}
                <span className="font-mono text-[10px]">{currentPath.id?.slice(0, 12) ?? "—"}</span>
              </div>
              <div className="text-slate-500">click any node above to open the Least Privilege modal</div>
            </div>
          </>
        ) : (
          <>
            {/* All-paths fan-in DAG — Phase 2 choke-point view */}
            <AllPathsGraph
              paths={jewelPaths}
              onNodeClick={handleNodeClick}
              jewelSource={activeJewel?.crown_jewel_source ?? null}
            />
            <div
              className="flex justify-between items-center pt-3 text-[11px] text-slate-400"
              style={{ borderTop: "1px solid rgba(148, 163, 184, 0.15)" }}
            >
              <div>
                Shared nodes drawn once. <span className="text-emerald-300">×N</span> badge = number of distinct paths
                through that node — the choke points to fix first.
              </div>
              <div className="text-slate-500">click any node above to open the Least Privilege modal</div>
            </div>
          </>
        )}
      </div>

      {/* Click-through modals — same engines as Least Privilege */}
      <IAMPermissionAnalysisModal
        isOpen={iamModalOpen}
        onClose={() => {
          setIamModalOpen(false)
          setModalResource(null)
        }}
        roleName={modalResource?.name ?? ""}
        systemName={systemName}
        onRemediationSuccess={() => retry()}
        onRollbackSuccess={() => retry()}
      />
      <S3RemediationModal
        isOpen={s3ModalOpen}
        onClose={() => {
          setS3ModalOpen(false)
          setModalResource(null)
        }}
        bucketName={modalResource?.name ?? ""}
        systemName={systemName}
        onRemediationSuccess={() => retry()}
      />
      <SGRemediationModal
        isOpen={sgModalOpen}
        onClose={() => {
          setSgModalOpen(false)
          setModalResource(null)
        }}
        sgId={modalResource?.sgId ?? ""}
        sgName={modalResource?.name}
        systemName={systemName}
        onRemediate={() => retry()}
      />
    </div>
  )
}

export default AttackerMap
