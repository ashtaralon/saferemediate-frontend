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

  // Filter to paths for the selected jewel; if no jewel selected yet,
  // auto-pick the first crown jewel returned. Backend already sorts
  // crown_jewels by priority_score desc.
  const jewels: CrownJewelSummary[] = data?.crown_jewels ?? []
  const activeJewelId = selectedJewelId ?? jewels[0]?.id ?? null
  const jewelPaths: IdentityAttackPath[] = useMemo(() => {
    if (!data || !activeJewelId) return []
    return (data.paths ?? []).filter((p) => p.crown_jewel_id === activeJewelId)
  }, [data, activeJewelId])

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
                  {j.name} · {j.type} · {j.path_count} path{j.path_count === 1 ? "" : "s"}
                </option>
              ))}
            </select>
            {activeJewel ? (
              <div className="text-[10px] text-slate-500 mt-1">
                priority {activeJewel.priority_score?.toFixed?.(0) ?? "—"} · severity {activeJewel.severity}
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
            <AttackerFlowCanvas path={currentPath} onNodeClick={handleNodeClick} />
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
            <AllPathsGraph paths={jewelPaths} onNodeClick={handleNodeClick} />
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
