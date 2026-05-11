"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Loader2, AlertTriangle, Shield, ShieldCheck, RefreshCw, ShieldAlert, ChevronDown, ChevronRight, ChevronLeft, Workflow, Maximize2, Minimize2 } from "lucide-react"
import { CrownJewelListPanel } from "./crown-jewel-list-panel"
import { CrownJewelSurfaceCard } from "./crown-jewel-surface-card"
import { PathListPanel } from "./path-list-panel"
import { AttackPathFlowViz } from "./attack-path-flow-viz"
// Reuse the actual System Map (traffic-flow-map.tsx) — the Traffic Flow Map
// rendered behind the "System Map" tab in Topology. Same component, same
// data, same Stack Components sidebar / IAM / SG / NACL / API-Calls /
// Resources grouping the operator already knows. Per CISO ask "use the
// system map under the Topology tab".
import TrafficFlowMap from "@/components/dependency-map/traffic-flow-map"
import { NodeDetailPanel } from "./node-detail-panel"
import { PathScoreHero } from "./path-score-hero"
import { PathRemediationPlan } from "./path-remediation-plan"
import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"
// Legacy modals replaced by v4.4 §11E-style cards. Aliased imports
// keep JSX call sites unchanged.
import { S3RemediationModal as S3PolicyAnalysisModal } from "@/components/s3-remediation-modal"
import { SGRemediationModal as SGLeastPrivilegeModal } from "@/components/sg-remediation-modal"
import {
  TrustEnvelopeBadge,
  isTrustEnvelope,
  type Provenance,
} from "@/components/trust/trust-envelope-badge"
import type {
  IdentityAttackPathsResponse,
  IdentityAttackPath,
  PathNodeDetail,
  RemediationStatus,
  RemediationPreview,
  RemediationResult,
} from "./types"

type RemediationModalKind = "iam" | "s3" | "sg" | null

function classifyNodeForModal(node: PathNodeDetail): RemediationModalKind {
  const type = (node.type ?? "").toLowerCase()
  const lane = (node.lane ?? "").toLowerCase()
  if (type.includes("s3") || type.includes("bucket") || lane === "crown_jewel") {
    // Only route crown-jewel S3 buckets to the S3 modal
    if (type.includes("s3") || type.includes("bucket")) return "s3"
  }
  if (type.includes("security") || type.includes("sg") || lane === "security_group") return "sg"
  if (type.includes("iam") || type.includes("role") || node.tier === "identity") return "iam"
  return null
}

function extractSgId(node: PathNodeDetail): string {
  if (node.id?.startsWith("sg-")) return node.id
  if (node.name?.startsWith("sg-")) return node.name
  const match = node.id?.match(/sg-[a-z0-9]+/)
  return match?.[0] ?? node.id
}

interface IdentityAttackPathsProps {
  systemName: string
}

export function IdentityAttackPaths({ systemName }: IdentityAttackPathsProps) {
  const [data, setData] = useState<IdentityAttackPathsResponse | null>(null)
  const [provenance, setProvenance] = useState<Provenance | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedJewelId, setSelectedJewelId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedPathIndex, setSelectedPathIndex] = useState(0)
  const [listMode, setListMode] = useState<"at-risk" | "safe">("at-risk")
  // 'list' shows the per-path triage list (default landing); 'detail'
  // drills into a single path's Flow Map + remediation plan.
  const [pathView, setPathView] = useState<"list" | "detail">("list")

  const [showFlowViz, setShowFlowViz] = useState(true)
  // "clean" = new reactflow DAG (default, the polished CISO view).
  // "lanes" = legacy 5-column lane view (kept for back-compat).
  const [graphMode, setGraphMode] = useState<"clean" | "lanes">("clean")
  // Maximize the attack graph: hides the hero + Damage Reduction Plan
  // so the graph gets the full viewport. Per operator feedback the
  // static analysis takes too much screen — the dynamic graph is the
  // working content.
  const [isGraphMaximized, setIsGraphMaximized] = useState(false)

  // Remediation state
  const [remediationStatus, setRemediationStatus] = useState<RemediationStatus>("idle")
  const [remediationPreview, setRemediationPreview] = useState<RemediationPreview | null>(null)
  const [remediationResult, setRemediationResult] = useState<RemediationResult | null>(null)
  const [activeRemediationNodeId, setActiveRemediationNodeId] = useState<string | null>(null)
  const [remediateAllStatus, setRemediateAllStatus] = useState<"idle" | "previewing" | "executing" | "done">("idle")
  const [remediateAllResults, setRemediateAllResults] = useState<RemediationResult[]>([])

  // Remediation modals — same engine/UI as the Least Privilege tab
  const [iamModalOpen, setIamModalOpen] = useState(false)
  const [s3ModalOpen, setS3ModalOpen] = useState(false)
  const [sgModalOpen, setSgModalOpen] = useState(false)
  const [modalResource, setModalResource] = useState<{ name: string; sgId?: string } | null>(null)

  // AbortController-aware fetch. The user reported feeling "stuck" on
  // the Attack Paths tab and unable to switch sections — most likely
  // because the underlying /api/proxy/identity-attack-paths endpoint
  // can take 30s+ on cold-start, and the previous fetch had no
  // AbortController, so:
  //   1. user clicks Attack Paths → fetch starts, takes 30s
  //   2. user clicks Issues mid-fetch
  //   3. React unmounts this component
  //   4. the leaked fetch keeps running, eventually setState's into a
  //      detached component (React warns but no-ops)
  //   5. if user clicks back to Attack Paths, ANOTHER 30s fetch starts
  //
  // Now: each mount installs an AbortController; unmount aborts the
  // in-flight request so cancellation is immediate. The "Retry"
  // button still calls fetchData, which auto-replaces any in-flight
  // controller via the same useEffect cleanup.
  const fetchData = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/proxy/identity-attack-paths/${encodeURIComponent(systemName)}?envelope=true`,
          { signal }
        )
        if (signal?.aborted) return
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const raw = await res.json()
        if (signal?.aborted) return
        const json: IdentityAttackPathsResponse = isTrustEnvelope(raw)
          ? (raw.result as IdentityAttackPathsResponse)
          : (raw as IdentityAttackPathsResponse)
        if ((json as any).error) throw new Error((json as any).error)
        setProvenance(isTrustEnvelope(raw) ? raw.provenance : null)
        setData(json)
      } catch (e: any) {
        // AbortError is expected when the user navigates away mid-
        // fetch — don't surface it as a render-able error.
        if (e?.name === "AbortError" || signal?.aborted) return
        setError(e?.message ?? "Failed to load attack paths")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [systemName]
  )

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  const jewelPaths = useMemo(() => {
    if (!data || !selectedJewelId) return []
    return (data.paths ?? []).filter((p) => p.crown_jewel_id === selectedJewelId)
  }, [data, selectedJewelId])

  // ── Partition jewels + paths by "safe" definition: no actionable remediation ──
  const { atRiskJewels, safeJewels, atRiskPathCount, safePathCount } = useMemo(() => {
    if (!data) return { atRiskJewels: [], safeJewels: [], atRiskPathCount: 0, safePathCount: 0 }
    const jewels = data.crown_jewels ?? []
    const paths = data.paths ?? []
    const pathHasAction = (p: IdentityAttackPath) =>
      (p.risk_reduction?.top_actions?.length ?? 0) > 0

    let atRiskPC = 0
    let safePC = 0
    const jewelAtRisk = new Map<string, boolean>()
    for (const p of paths) {
      const has = pathHasAction(p)
      if (has) atRiskPC++
      else safePC++
      jewelAtRisk.set(p.crown_jewel_id, (jewelAtRisk.get(p.crown_jewel_id) ?? false) || has)
    }
    const atRisk = jewels.filter((j) => jewelAtRisk.get(j.id) === true)
    const safe = jewels.filter((j) => jewelAtRisk.get(j.id) !== true)
    return {
      atRiskJewels: atRisk,
      safeJewels: safe,
      atRiskPathCount: atRiskPC,
      safePathCount: safePC,
    }
  }, [data])

  const filteredJewels = listMode === "at-risk" ? atRiskJewels : safeJewels

  // ── Auto-select first jewel in the active list when data loads or mode flips ──
  useEffect(() => {
    if (!data) return
    const stillValid = selectedJewelId && filteredJewels.some((j) => j.id === selectedJewelId)
    if (!stillValid) {
      setSelectedJewelId(filteredJewels[0]?.id ?? null)
      setSelectedPathIndex(0)
      setSelectedNodeId(null)
      setRemediationStatus("idle")
      setRemediationPreview(null)
      setRemediationResult(null)
      setActiveRemediationNodeId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, listMode])

  const selectedNode = useMemo((): PathNodeDetail | null => {
    if (!selectedNodeId) return null
    const currentPath = jewelPaths?.[selectedPathIndex]
    if (!currentPath) return null
    return (currentPath.nodes ?? []).find((n) => n.id === selectedNodeId) ?? null
  }, [selectedNodeId, jewelPaths, selectedPathIndex])

  // ── Single-node remediation handler ──
  const handleNodeRemediate = useCallback(async (nodeId: string, dryRun: boolean) => {
    const currentPath = jewelPaths?.[selectedPathIndex]
    if (!currentPath) return
    const node = currentPath.nodes.find((n) => n.id === nodeId)
    if (!node) return

    // Route to the Least Privilege tab's modal — same engine, same rollback,
    // same Simulate/Apply controls. Apply and Simulate both open it.
    const modalKind = classifyNodeForModal(node)
    if (modalKind === "iam") {
      setModalResource({ name: node.name })
      setIamModalOpen(true)
      return
    }
    if (modalKind === "s3") {
      setModalResource({ name: node.name })
      setS3ModalOpen(true)
      return
    }
    if (modalKind === "sg") {
      setModalResource({ name: node.name, sgId: extractSgId(node) })
      setSgModalOpen(true)
      return
    }

    // Fallback: inline preview for node types with no LP modal (NACL, VPC, subnet)
    if (dryRun) {
      // If we're already in confirming state for THIS node and user clicks cancel, reset
      if (remediationStatus === "confirming" && activeRemediationNodeId === nodeId) {
        setRemediationStatus("idle")
        setRemediationPreview(null)
        setActiveRemediationNodeId(null)
        return
      }

      setRemediationStatus("previewing")
      setRemediationPreview(null)
      setRemediationResult(null)
      setActiveRemediationNodeId(nodeId)
      try {
        const res = await fetch("/api/proxy/attack-path-remediate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            node_id: node.id,
            node_type: node.type,
            node_name: node.name,
            dry_run: true,
          }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setRemediationPreview(data)
        setRemediationStatus("confirming")
      } catch (err: any) {
        setRemediationResult({ success: false, node_id: nodeId, message: err.message ?? "Preview failed" })
        setRemediationStatus("error")
      }
    } else {
      // Execute real remediation
      setRemediationStatus("executing")
      try {
        const res = await fetch("/api/proxy/attack-path-remediate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            node_id: node.id,
            node_type: node.type,
            node_name: node.name,
            dry_run: false,
            create_snapshot: true,
            permissions_to_remove: remediationPreview?.permissions_to_remove,
          }),
        })
        const data = await res.json()
        if (data.blocked) {
          setRemediationResult({ success: false, node_id: nodeId, message: data.block_reason ?? "Blocked", blocked: true, block_reason: data.block_reason })
          setRemediationStatus("error")
        } else if (data.success === false || data.error) {
          setRemediationResult({ success: false, node_id: nodeId, message: data.error ?? data.message ?? "Failed" })
          setRemediationStatus("error")
        } else {
          setRemediationResult(data)
          setRemediationStatus("success")
        }
      } catch (err: any) {
        setRemediationResult({ success: false, node_id: nodeId, message: err.message ?? "Remediation failed" })
        setRemediationStatus("error")
      }
    }
  }, [jewelPaths, selectedPathIndex, remediationStatus, remediationPreview, activeRemediationNodeId])

  // ── Cancel single-node preview ──
  const handleCancelNodeRemediation = useCallback(() => {
    setRemediationStatus("idle")
    setRemediationPreview(null)
    setActiveRemediationNodeId(null)
  }, [])

  // ── Rollback handler — routes to the right snapshot endpoint ──
  const handleRollback = useCallback(async (snapshotId: string, nodeId: string) => {
    const currentPath = jewelPaths?.[selectedPathIndex]
    if (!currentPath) return
    const node = currentPath.nodes.find((n) => n.id === nodeId)
    if (!node) return

    const nodeType = (node.type ?? "").toLowerCase()
    // Choose the matching rollback proxy — all exist today
    let rollbackUrl: string
    if (nodeType.includes("iam")) {
      rollbackUrl = `/api/proxy/iam-snapshots/${encodeURIComponent(snapshotId)}/rollback`
    } else if (nodeType.includes("securitygroup") || nodeType.includes("security_group") || nodeType === "sg") {
      // Security-group rollback needs the SG id + snapshot body
      rollbackUrl = `/api/proxy/security-groups/${encodeURIComponent(node.id)}/rollback`
    } else if (nodeType.includes("s3") || nodeType.includes("bucket")) {
      rollbackUrl = `/api/proxy/s3-buckets/rollback`
    } else {
      // Generic snapshot rollback
      rollbackUrl = `/api/proxy/snapshots/${encodeURIComponent(snapshotId)}/rollback`
    }

    setRemediationStatus("executing") // reuse executing state for rollback spinner
    try {
      const res = await fetch(rollbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot_id: snapshotId, resource_id: node.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.success === false) {
        setRemediationResult({
          success: false,
          node_id: nodeId,
          message: data.error ?? data.message ?? `Rollback failed (${res.status})`,
        })
        setRemediationStatus("error")
        return
      }
      // Reset row + refetch to pick up restored scores
      setRemediationStatus("idle")
      setRemediationPreview(null)
      setRemediationResult(null)
      setActiveRemediationNodeId(null)
      await fetchData()
    } catch (err: any) {
      setRemediationResult({
        success: false,
        node_id: nodeId,
        message: err?.message ?? "Rollback failed",
      })
      setRemediationStatus("error")
    }
  }, [jewelPaths, selectedPathIndex, fetchData])

  // ── Remediate All handler ──
  const handleRemediateAll = useCallback(async (dryRun: boolean) => {
    const currentPath = jewelPaths?.[selectedPathIndex]
    if (!currentPath) return

    if (dryRun) {
      setRemediateAllStatus("previewing")
      // We just show a confirmation prompt
      setRemediateAllStatus("previewing")
      return
    }

    setRemediateAllStatus("executing")
    const results: RemediationResult[] = []
    for (const node of currentPath.nodes) {
      try {
        const res = await fetch("/api/proxy/attack-path-remediate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            node_id: node.id,
            node_type: node.type,
            node_name: node.name,
            dry_run: false,
            create_snapshot: true,
          }),
        })
        const data = await res.json()
        results.push({
          success: data.success !== false && !data.error,
          node_id: node.id,
          message: data.message ?? (data.error ? `Error: ${data.error}` : "Done"),
          snapshot_id: data.snapshot_id,
          rollback_available: data.rollback_available,
          permissions_removed: data.permissions_removed,
        })
      } catch (err: any) {
        results.push({ success: false, node_id: node.id, message: err.message ?? "Failed" })
      }
    }
    setRemediateAllResults(results)
    setRemediateAllStatus("done")
  }, [jewelPaths, selectedPathIndex])

  const handleJewelSelect = useCallback((id: string) => {
    setSelectedJewelId(id)
    setSelectedPathIndex(0)
    setSelectedNodeId(null)
    // Always land in the per-jewel path list. Operator clicks a card to
    // drill into a specific path's Flow Map + remediation.
    setPathView("list")
    setRemediationStatus("idle")
    setRemediationPreview(null)
    setRemediationResult(null)
    setActiveRemediationNodeId(null)
    setRemediateAllStatus("idle")
    setRemediateAllResults([])
  }, [])

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (nodeId === prev ? null : nodeId))
    // Reset node-level remediation when switching nodes (unless the row clicked is the active one)
    if (nodeId !== activeRemediationNodeId) {
      setRemediationStatus("idle")
      setRemediationPreview(null)
      setRemediationResult(null)
      setActiveRemediationNodeId(null)
    }
  }, [activeRemediationNodeId])

  const currentPathPreReturn = jewelPaths?.[selectedPathIndex] ?? null

  // Stable filter object for TrafficFlowMap — without this the inline
  // pathFilter prop changes identity on every render and TrafficFlowMap's
  // loadData useEffect refetches in a tight loop. Must be declared BEFORE
  // any conditional early-return below or the hook order changes between
  // renders.
  //
  // Union ALL paths to the currently-selected crown jewel into one map
  // (instead of just path 1/N), so the operator sees every compute /
  // role / SG / NACL that can reach this jewel in a single view.
  // Per-path navigation (1/N arrows) is still used to scope the
  // remediation plan and the Lanes view below.
  const trafficFlowPathFilter = useMemo(() => {
    if (!jewelPaths || jewelPaths.length === 0) return undefined
    // In detail mode, scope to the single selected path. In list mode the
    // map isn't rendered, but we still build a union filter so the
    // hook ordering and TrafficFlowMap memoization stay stable.
    const sourcePaths =
      pathView === "detail" && currentPathPreReturn ? [currentPathPreReturn] : jewelPaths
    const idSet = new Set<string>()
    const nodes: Array<{ id: string; name: string; type: string; tier?: string; lane?: string }> = []
    const edges: Array<{
      source: string
      target: string
      type?: string
      label?: string
      port?: number | null
      protocol?: string | null
      bytes?: number
      hits?: number
      is_observed?: boolean
    }> = []
    const edgeSet = new Set<string>()
    const crownJewelIds = new Set<string>()
    let jewelName: string | undefined = undefined
    // For each path node, fan out a NARROW slice of its 1-hop infra
    // context — only buckets that are gating/access-relevant for the
    // path. Excludes wide reverse-lookup buckets (vpcs, subnets,
    // iam_roles, security_groups when the node itself IS an SG) that
    // would otherwise pull in every co-located peer and bloat the
    // diagram.
    const FORWARD_BUCKETS: Array<keyof NonNullable<PathNodeDetail["infra_context"]>> = [
      "iam_policies",
      "instance_profiles",
      "kms_keys",
      "bucket_policies",
      "load_balancers",
      "target_groups",
      "log_groups",
      "monitors",
    ]
    // Only fan out compute → SG (forward attachment), skip SG → other compute.
    const COMPUTE_TYPES = /ec2|lambda|fargate|ecs|instance/i
    // Dedupe by lowercased name+type — catches the role-vs-instance-profile
    // case where both share a name but have different IDs.
    const seenNameType = new Set<string>()
    const nameTypeKey = (n: { name?: string; type?: string }) =>
      `${(n.name || "").toLowerCase()}|${(n.type || "").toLowerCase()}`

    sourcePaths.forEach((p) => {
      ;(p.nodes ?? []).forEach((n) => {
        if (n.tier === "crown_jewel") crownJewelIds.add(n.id)
        const ntKey = nameTypeKey({ name: n.name, type: n.type })
        if (!idSet.has(n.id) && !seenNameType.has(ntKey)) {
          idSet.add(n.id)
          seenNameType.add(ntKey)
          nodes.push({ id: n.id, name: n.name, type: n.type, tier: n.tier, lane: n.lane })
        }
        if (n.tier === "crown_jewel" && !jewelName) jewelName = n.name

        // Forward-only fan-out — don't expand from container nodes
        // (VPC/Subnet/SG/NACL) whose buckets are reverse-lookups.
        const isContainer = /vpc|subnet|securitygroup|nacl|networkacl/i.test(n.type || "")
        if (isContainer) return
        const ic = n.infra_context
        if (!ic) return

        // Compute nodes also get their attached SG / NACL (one each
        // typically — this is the "the SG this EC2 is in", not the
        // reverse-lookup of "every EC2 in this SG").
        const buckets: Array<keyof NonNullable<PathNodeDetail["infra_context"]>> = [
          ...FORWARD_BUCKETS,
        ]
        if (COMPUTE_TYPES.test(n.type || "")) {
          buckets.push("security_groups", "nacls")
        }

        for (const bucket of buckets) {
          const neighbors = ic[bucket]
          if (!Array.isArray(neighbors)) continue
          // Cap per-bucket fan-out to 3 to keep the diagram readable.
          // A path with 30 attached policies isn't more informative than
          // a path with 3 attached policies — the operator drills in
          // via the role detail panel if they need the full list.
          for (const nb of neighbors.slice(0, 3)) {
            if (!nb?.id) continue
            const nbKey = nameTypeKey(nb)
            if (idSet.has(nb.id) || seenNameType.has(nbKey)) continue
            idSet.add(nb.id)
            seenNameType.add(nbKey)
            nodes.push({
              id: nb.id,
              name: nb.name || nb.id,
              type: nb.type || "",
            })
          }
        }
      })
      ;(p.edges ?? []).forEach((e) => {
        const k = `${e.source}->${e.target}|${e.type}`
        if (edgeSet.has(k)) return
        edgeSet.add(k)
        edges.push({
          source: e.source,
          target: e.target,
          type: e.type,
          label: e.label,
          port: e.port,
          protocol: e.protocol,
          bytes: e.traffic_bytes,
          hits: e.hit_count,
          is_observed: e.is_observed,
        })
      })
    })
    const isDetail = pathView === "detail" && currentPathPreReturn
    return {
      nodeIds: [...idSet],
      pathNodes: nodes,
      pathEdges: edges,
      crownJewelIds: [...crownJewelIds],
      jewelName,
      pathLabel: isDetail
        ? `path #${selectedPathIndex + 1} of ${jewelPaths.length} → ${jewelName ?? "this jewel"}`
        : `${jewelPaths.length} ${jewelPaths.length === 1 ? "path" : "paths"} to ${jewelName ?? "this jewel"}`,
    }
  }, [jewelPaths, pathView, currentPathPreReturn, selectedPathIndex])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <p className="text-sm text-slate-400">Analyzing identity attack paths...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
          <p className="text-sm text-white font-medium">Failed to load attack paths</p>
          <p className="text-xs text-slate-400">{error}</p>
          <button
            onClick={() => fetchData()}
            className="mt-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Empty state
  if (!data || (data.total_paths ?? 0) === 0) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="flex flex-col items-center gap-3">
          <Shield className="w-10 h-10 text-green-400" />
          <p className="text-sm text-white font-medium">No identity attack paths found</p>
          <p className="text-xs text-slate-400">No paths from entry points to crown jewels were detected</p>
        </div>
      </div>
    )
  }

  const currentPath = currentPathPreReturn

  return (
    <div
      className="flex flex-col h-[calc(100vh-4rem)]"
      style={{ background: "rgb(15, 23, 42)" }}  // slate-900: unified dark surface for the whole tab
    >
      {/* Header — compact single-row title + right-aligned tabs, then one summary sentence */}
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
              <h2 className="text-base font-semibold text-white">Identity Attack Paths</h2>
              <span className="text-xs text-slate-400 truncate">{systemName}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              <span className="font-semibold text-slate-200 tabular-nums">{data.total_paths ?? 0}</span> paths expose{" "}
              <span className="font-semibold text-slate-200 tabular-nums">{data.total_jewels ?? 0}</span> crown jewels
              {(data.exposed_jewels ?? 0) > 0 ? (
                <>
                  {" · "}
                  <span className="font-semibold text-red-400 tabular-nums">{data.exposed_jewels}</span>{" "}
                  internet-exposed
                </>
              ) : (
                <> · <span className="text-slate-500">no internet-exposed jewels</span></>
              )}
              {(data.critical_paths ?? 0) > 0 ? (
                <> · <span className="font-semibold text-red-400 tabular-nums">{data.critical_paths}</span> critical</>
              ) : null}
              {(data.high_paths ?? 0) > 0 ? (
                <> · <span className="font-semibold text-amber-400 tabular-nums">{data.high_paths}</span> high</>
              ) : null}
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* At Risk / Safe tab pills — dark mode */}
            <div
              className="flex items-center p-0.5 rounded-md"
              style={{ background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.15)" }}
            >
              <button
                onClick={() => setListMode("at-risk")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
                style={
                  listMode === "at-risk"
                    ? {
                        background: "rgba(239, 68, 68, 0.15)",
                        color: "#fca5a5",
                        border: "1px solid rgba(239, 68, 68, 0.35)",
                      }
                    : { color: "#94a3b8", border: "1px solid transparent" }
                }
                title="Paths where the scoring engine found at least one action that reduces the score"
              >
                <ShieldAlert className="w-3 h-3" />
                At Risk
                <span
                  className="px-1 rounded text-[10px] font-mono tabular-nums"
                  style={{
                    background: listMode === "at-risk" ? "rgba(239,68,68,0.25)" : "rgba(148,163,184,0.1)",
                    color: listMode === "at-risk" ? "#fecaca" : "#94a3b8",
                  }}
                >
                  {atRiskPathCount}
                </span>
              </button>
              <button
                onClick={() => setListMode("safe")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
                style={
                  listMode === "safe"
                    ? {
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "#6ee7b7",
                        border: "1px solid rgba(16, 185, 129, 0.35)",
                      }
                    : { color: "#94a3b8", border: "1px solid transparent" }
                }
                title="Paths where no further remediation action was found (already hardened)"
              >
                <ShieldCheck className="w-3 h-3" />
                Safe
                <span
                  className="px-1 rounded text-[10px] font-mono tabular-nums"
                  style={{
                    background: listMode === "safe" ? "rgba(16,185,129,0.25)" : "rgba(148,163,184,0.1)",
                    color: listMode === "safe" ? "#a7f3d0" : "#94a3b8",
                  }}
                >
                  {safePathCount}
                </span>
              </button>
            </div>
            <button
              onClick={() => fetchData()}
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {/* TrustEnvelopeBadge moved to a compact info-tooltip on the
            refresh button — was eating ~40px of full-width space at top
            of every page load showing operator-irrelevant provenance. */}
      </div>

      {/* 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        <CrownJewelListPanel
          jewels={filteredJewels}
          selectedJewelId={selectedJewelId}
          onSelect={handleJewelSelect}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Phase 3: Crown Jewel Attack Surface — aggregated card that
              shows worst-case damage, entry breakdown, and highest-leverage
              fixes (sorted by paths-broken). Sits above the per-path hero so
              the CISO sees the whole picture before drilling into one path. */}
          {selectedJewelId && (
            <CrownJewelSurfaceCard systemName={systemName} jewelId={selectedJewelId} />
          )}

          {/* PATH LIST — default landing per jewel. Operator picks one
              path's risk/damage to drill into. Skip in detail mode. */}
          {pathView === "list" && jewelPaths.length > 0 && (
            <PathListPanel
              paths={jewelPaths}
              jewelName={currentPath?.nodes?.find((n) => n.tier === "crown_jewel")?.name}
              onSelectPath={(idx) => {
                setSelectedPathIndex(idx)
                setPathView("detail")
                setSelectedNodeId(null)
                setRemediationStatus("idle")
                setRemediationPreview(null)
                setRemediationResult(null)
                setActiveRemediationNodeId(null)
              }}
            />
          )}

          {/* Detail-mode header: Back to list + per-path hero score */}
          {pathView === "detail" && currentPath && (
            <div className="px-4 pt-3">
              <button
                type="button"
                onClick={() => setPathView("list")}
                className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2.5 py-1.5 rounded-md border border-slate-700 hover:border-slate-500 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back to {jewelPaths.length} {jewelPaths.length === 1 ? "path" : "paths"}
              </button>
            </div>
          )}

          {/* Hero banner — only in detail mode (per-path score is meaningless in list view).
              Hidden when the operator maximizes the attack graph so the
              graph gets full vertical room. */}
          {pathView === "detail" && currentPath && !isGraphMaximized && (
            <PathScoreHero
              path={currentPath}
              pathIndex={selectedPathIndex}
              totalPaths={jewelPaths.length}
              onPrev={() => setSelectedPathIndex(Math.max(0, selectedPathIndex - 1))}
              onNext={() => setSelectedPathIndex(Math.min(jewelPaths.length - 1, selectedPathIndex + 1))}
            />
          )}

          {pathView === "detail" && jewelPaths.length > 0 && currentPath ? (
            <div className="flex-1 overflow-auto">
              {/* Attack graph — full width, on top so it's visible without scrolling past the plan */}
              <div
                className="px-4 py-2 border-b flex items-center justify-between shrink-0"
                style={{
                  background: "rgba(10, 16, 30, 0.6)",
                  borderColor: "rgba(148, 163, 184, 0.1)",
                }}
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <Workflow className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-200 uppercase tracking-wider">
                    Attack graph
                  </span>
                  <span className="text-slate-500">
                    · {(currentPath?.nodes?.length ?? 0)} nodes across{" "}
                    {(currentPath?.nodes ? new Set(currentPath.nodes.map((n) => n.lane ?? n.tier ?? "other")).size : 0)} lanes
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* View toggle: clean DAG (default) vs legacy 5-lane columns */}
                  <div className="inline-flex items-center bg-slate-800/60 rounded p-0.5 border border-slate-700">
                    <button
                      onClick={() => setGraphMode("clean")}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                        graphMode === "clean"
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                      title="The actual System Map (TrafficFlowMap) — same animated Traffic Flow Map the operator sees behind the 'System Map' tab in Topology, with Stack Components sidebar."
                    >
                      Flow
                    </button>
                    <button
                      onClick={() => setGraphMode("lanes")}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                        graphMode === "lanes"
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                      title="Legacy 5-column lane layout: Entry · Compute · Identity · Pivot · Crown Jewel"
                    >
                      Lanes
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setIsGraphMaximized((v) => !v)
                      // Make sure the graph is visible if we're maximizing
                      if (!isGraphMaximized) setShowFlowViz(true)
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors"
                    title={isGraphMaximized ? "Restore (show analysis + plan)" : "Maximize — hide analysis to give the graph full screen"}
                  >
                    {isGraphMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                    {isGraphMaximized ? "Restore" : "Maximize"}
                  </button>
                  <button
                    onClick={() => setShowFlowViz((v) => !v)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors"
                    title={showFlowViz ? "Hide the attack graph" : "Show the attack graph"}
                  >
                    {showFlowViz ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {showFlowViz ? "Hide graph" : "Show graph"}
                  </button>
                </div>
              </div>

              {showFlowViz && (
                graphMode === "clean" ? (
                  // Reuse the actual System Map (TrafficFlowMap), but
                  // pass it the CURRENT path's nodes as a filter so each
                  // crown jewel renders its own real data flow — not the
                  // whole system map. Switching the selected path
                  // re-renders with that path's filtered architecture.
                  <div style={{ height: isGraphMaximized ? "calc(100vh - 180px)" : 720 }}>
                    <TrafficFlowMap
                      systemName={systemName}
                      pathFilter={trafficFlowPathFilter}
                      onPathNodeAction={(kind, node) => {
                        // Route per-node clicks on the Path Flow Map to
                        // the right remediation modal instead of the
                        // internal "service details" popup. The user
                        // expects clicking an SG to open the SG LP
                        // modal, an IAM role to open the IAM modal,
                        // the jewel resource to open the S3 modal.
                        if (kind === "security_group") {
                          const sgId = node.id.startsWith("sg-")
                            ? node.id
                            : node.name.startsWith("sg-")
                              ? node.name
                              : node.id.match(/sg-[a-z0-9]+/)?.[0] ?? node.id
                          setModalResource({ name: node.name, sgId })
                          setSgModalOpen(true)
                          return
                        }
                        if (kind === "iam_role") {
                          setModalResource({ name: node.name })
                          setIamModalOpen(true)
                          return
                        }
                        if (kind === "resource") {
                          const t = (node.type ?? "").toLowerCase()
                          if (t.includes("s3") || t.includes("bucket")) {
                            setModalResource({ name: node.name })
                            setS3ModalOpen(true)
                            return
                          }
                        }
                        // compute / nacl / api_call — no LP modal yet,
                        // fall through silently so the click is a no-op
                        // rather than opening the legacy generic popup.
                      }}
                    />
                  </div>
                ) : (
                  <AttackPathFlowViz
                    paths={jewelPaths}
                    selectedPathIndex={selectedPathIndex}
                    onNodeClick={handleNodeClick}
                    selectedNodeId={selectedNodeId}
                  />
                )
              )}

              {/* Remediation plan — full width, below the graph. Hidden
                  when graph is maximized so the operator has the full
                  viewport for the dynamic diagram. */}
              {!isGraphMaximized && (
                <PathRemediationPlan
                  path={currentPath}
                  activeNodeId={activeRemediationNodeId}
                  remediationStatus={remediationStatus}
                  remediationPreview={remediationPreview}
                  remediationResult={remediationResult}
                  onRemediate={handleNodeRemediate}
                  onRollback={handleRollback}
                  onCancel={handleCancelNodeRemediation}
                  isSafe={listMode === "safe"}
                  remediateAllStatus={listMode === "at-risk" ? remediateAllStatus : undefined}
                  remediateAllResultsCount={remediateAllResults.length}
                  remediateAllSuccessCount={remediateAllResults.filter((r) => r.success).length}
                  onRemediateAll={listMode === "at-risk" ? handleRemediateAll : undefined}
                  onResetRemediateAll={() => { setRemediateAllStatus("idle"); setRemediateAllResults([]); }}
                />
              )}
            </div>
          ) : filteredJewels.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center max-w-md px-6">
                {listMode === "safe" ? (
                  <>
                    <Shield className="w-10 h-10 text-slate-500" />
                    <p className="text-sm text-slate-300 font-medium">No fully-hardened paths yet</p>
                    <p className="text-xs text-slate-500">
                      Every crown jewel still has at least one remediation the scoring engine can apply.
                      Work through the <span className="text-red-400">At Risk</span> tab to move jewels here.
                    </p>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-10 h-10 text-emerald-400" />
                    <p className="text-sm text-white font-medium">All crown jewels are hardened</p>
                    <p className="text-xs text-slate-400">
                      No active attack paths need remediation. Check the{" "}
                      <span className="text-emerald-300">Safe</span> tab to confirm.
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-slate-400">Select a crown jewel to view attack paths</p>
            </div>
          )}
        </div>

        {selectedNode && currentPath && (
          <NodeDetailPanel
            node={selectedNode}
            path={currentPath}
            onClose={() => setSelectedNodeId(null)}
            onRemediate={handleNodeRemediate}
            remediationStatus={remediationStatus}
            remediationPreview={remediationPreview}
            remediationResult={remediationResult}
          />
        )}
      </div>

      <IAMPermissionAnalysisModal
        isOpen={iamModalOpen}
        onClose={() => { setIamModalOpen(false); setModalResource(null) }}
        roleName={modalResource?.name ?? ""}
        systemName={systemName}
        onRemediationSuccess={() => { fetchData() }}
        onRollbackSuccess={() => { fetchData() }}
      />

      <S3PolicyAnalysisModal
        isOpen={s3ModalOpen}
        onClose={() => { setS3ModalOpen(false); setModalResource(null) }}
        bucketName={modalResource?.name ?? ""}
        systemName={systemName}
        onRemediationSuccess={() => { fetchData() }}
      />

      <SGLeastPrivilegeModal
        isOpen={sgModalOpen}
        onClose={() => { setSgModalOpen(false); setModalResource(null) }}
        sgId={modalResource?.sgId ?? ""}
        sgName={modalResource?.name}
        systemName={systemName}
        onRemediate={() => { fetchData() }}
      />
    </div>
  )
}

