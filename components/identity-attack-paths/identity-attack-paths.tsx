"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Loader2, AlertTriangle, Shield, ShieldCheck, RefreshCw, ShieldAlert, ChevronDown, ChevronRight, ChevronLeft, Workflow, Maximize2, Minimize2 } from "lucide-react"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { filterActivePaths, narrowActivePaths } from "@/lib/active-filters"
import type { ActivePathList } from "@/lib/active-filters"
import { CrownJewelListPanel } from "./crown-jewel-list-panel"
import { CrownJewelSurfaceCard } from "./crown-jewel-surface-card"
import { AttackTreePanel } from "./attack-tree-panel"
import { PathListPanel } from "./path-list-panel"
import { AttackPathFlowViz } from "./attack-path-flow-viz"
import { PathKillerMap } from "./path-killer-map"
// Reuse the actual System Map (traffic-flow-map.tsx) — the Traffic Flow Map
// rendered behind the "System Map" tab in Topology. Same component, same
// data, same Stack Components sidebar / IAM / SG / NACL / API-Calls /
// Resources grouping the operator already knows. Per CISO ask "use the
// system map under the Topology tab".
import TrafficFlowMap from "@/components/dependency-map/traffic-flow-map"
import { AtlasInlineSection } from "@/components/attack-paths-v2/atlas-inline-section"
import { NodeDetailPanel } from "./node-detail-panel"
import { PathScoreHero } from "./path-score-hero"
import { PathExfilSummary } from "./path-exfil-summary"
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

type RemediationModalKind = "iam" | "instance_profile" | "s3" | "sg" | null

function classifyNodeForModal(node: PathNodeDetail): RemediationModalKind {
  const type = (node.type ?? "").toLowerCase()
  const lane = (node.lane ?? "").toLowerCase()
  if (type.includes("s3") || type.includes("bucket") || lane === "crown_jewel") {
    // Only route crown-jewel S3 buckets to the S3 modal
    if (type.includes("s3") || type.includes("bucket")) return "s3"
  }
  if (type.includes("security") || type.includes("sg") || lane === "security_group") return "sg"
  // InstanceProfile is in the identity tier but carries no permissions —
  // classify distinctly so the caller resolves the wrapped role.
  if (type.includes("instanceprofile") || type === "instance_profile") return "instance_profile"
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
  const [selectedJewelId, setSelectedJewelId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedPathIndex, setSelectedPathIndex] = useState(0)
  const [listMode, setListMode] = useState<"at-risk" | "safe">("at-risk")
  // 'list' shows the per-path triage list (default landing); 'detail'
  // drills into a single path's Flow Map + remediation plan.
  const [pathView, setPathView] = useState<"list" | "detail">("list")

  const [showFlowViz, setShowFlowViz] = useState(true)
  // "killer" = PathKillerMap (default 2026-05-20) — hero + chain +
  //            findings + actions + lateral, the operator-facing story.
  // "clean"  = TrafficFlowMap (legacy CISO view, topology + traffic).
  // "lanes"  = AttackPathFlowViz (legacy 5-column lane diagram).
  const [graphMode, setGraphMode] = useState<"killer" | "clean" | "lanes">("killer")
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
  const [modalResource, setModalResource] = useState<{ name: string; sgId?: string; viaInstanceProfile?: { name: string; arn: string } } | null>(null)
  // Historical-evidence toggle (2026-05-11). When on, the proxy passes
  // include_stale=true so the backend returns ACTUAL_S3_ACCESS edges
  // that fell outside the current collector window (annual DR drills,
  // quarterly compliance scans, etc.). Default off — live view only.
  const [includeStale, setIncludeStale] = useState(false)
  // Deleted-resources toggle (2026-05-11). When on, surfaces nodes
  // soft-deleted by the collector reconciliation pass (is_active=false:
  // resources confirmed absent from AWS during the last successful scan).
  // Default off — live view hides zombies.
  const [includeDeleted, setIncludeDeleted] = useState(false)
  // Enriched-evidence toggle (2026-05-20). When on, the proxy passes
  // enriched=true so the backend's Tier-1 Part 2 supplements attach
  // extra fields per path node — egress destinations, ENI count,
  // mitigation history, target groups, S3 prefixes, route tables,
  // LB targets, lambda invocation counts. Additive only — path graph
  // shape unchanged. Default off so the lighter payload stays the
  // norm and operators opt in when they want the deeper drill.
  const [enriched, setEnriched] = useState(false)

  // Stale-while-revalidate via useCachedFetch (localStorage SWR).
  // Replaced the raw fetch + AbortController + useState pattern because
  // the operator was hitting cold backend (47s+) after every deploy and
  // seeing either a 30s blank loading state OR a "Failed to load attack
  // paths" error. SWR shows the LAST cached response instantly on
  // revisit while a silent background refresh runs; if the refresh
  // fails (backend 502/504 cold), the stale data stays put with
  // isStale=true. Operator stays productive across deploy cycles.
  //
  // No AbortController on cleanup: the hook's internal epochRef
  // discards stale results so an in-flight fetch becoming irrelevant
  // is handled without surfacing a "(canceled)" row in DevTools. See
  // lib/use-cached-fetch.ts for the design rationale.
  //
  // Cache key includes the include_stale + include_deleted toggles so
  // toggling them serves the correct prior snapshot and re-caches
  // independently — without that, the two snapshots would clobber
  // each other.
  const fetchUrl = systemName
    ? `/api/proxy/identity-attack-paths/${encodeURIComponent(systemName)}?envelope=true${includeStale ? "&include_stale=true" : ""}${includeDeleted ? "&include_deleted=true" : ""}${enriched ? "&enriched=true" : ""}`
    : null
  const {
    data: rawData,
    loading: isLoading,
    error,
    retry,
  } = useCachedFetch<any>(fetchUrl, {
    cacheKey: `iap:${systemName}:${includeStale}:${includeDeleted}:${enriched}`,
  })

  // Envelope unwrap. Backend optionally wraps responses in a
  // TrustEnvelope ({provenance, result}); useCachedFetch returns the
  // raw JSON so we normalize here. Also surface any in-body error
  // field as a hook-level error so the retry path triggers.
  const { data, provenance, dataError } = useMemo(() => {
    if (!rawData) return { data: null, provenance: null, dataError: null }
    const json: IdentityAttackPathsResponse = isTrustEnvelope(rawData)
      ? (rawData.result as IdentityAttackPathsResponse)
      : (rawData as IdentityAttackPathsResponse)
    const prov = isTrustEnvelope(rawData) ? rawData.provenance : null
    const bodyErr = (json as any)?.error ?? null
    return { data: bodyErr ? null : json, provenance: prov, dataError: bodyErr }
  }, [rawData])

  // Combined error — surface either the fetch error or any in-body
  // error the backend returned. Both should drive the same retry UX.
  const displayError = error || dataError

  // Manual refresh — used by the Retry button and by remediation
  // success/rollback handlers that need to repull post-mutation.
  // Fire-and-forget; the UI updates reactively when the hook's
  // setData fires inside fetchFresh.
  const fetchData = useCallback(() => {
    retry()
  }, [retry])

  // Client-side stale-node gate. See lib/active-filters.ts —
  // drops paths where any node carries is_active=false. Applied at the
  // single read site so EVERY downstream useMemo / render gets a
  // pre-filtered array. Catches localStorage-SWR-cached responses
  // from before backend hardening landed.
  const activePaths: ActivePathList<IdentityAttackPath> = useMemo(
    () => filterActivePaths(data?.paths ?? []),
    [data?.paths],
  )

  // narrowActivePaths preserves the ActivePathList brand through the
  // crown-jewel filter so downstream components requiring the brand
  // type-check correctly.
  const jewelPaths: ActivePathList<IdentityAttackPath> = useMemo(() => {
    if (!selectedJewelId) return filterActivePaths([])
    return narrowActivePaths(activePaths, (p) => p.crown_jewel_id === selectedJewelId)
  }, [activePaths, selectedJewelId])

  // ── Partition jewels + paths by "safe" definition: no actionable remediation ──
  const { atRiskJewels, safeJewels, atRiskPathCount, safePathCount } = useMemo(() => {
    if (!data) return { atRiskJewels: [], safeJewels: [], atRiskPathCount: 0, safePathCount: 0 }
    const jewels = data.crown_jewels ?? []
    const paths = activePaths
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
    if (modalKind === "instance_profile") {
      // Resolve the wrapped IAMRole via the USES_ROLE edge and open the
      // IAM modal on the role with the InstanceProfile pedigree attached.
      const wrappedEdge = currentPath.edges?.find(
        (e: any) => e.source === node.id && (e.type === "USES_ROLE" || e.type === "uses_role"),
      )
      let wrappedRoleName = node.name
      if (wrappedEdge) {
        const wn = currentPath.nodes.find((n: any) => n.id === wrappedEdge.target) as any
        if (wn?.name) wrappedRoleName = wn.name
      }
      setModalResource({
        name: wrappedRoleName,
        viaInstanceProfile: { name: node.name, arn: node.id },
      })
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

  // chunk #1.5: per-workload exfil-risk summaries for the current
  // path's compute nodes. Lifted into the parent so both the strip
  // (PathExfilSummary, rendered above the graph) and the Path Flow
  // Map (TrafficFlowMap, decorating each compute node with a chip)
  // consume the same data without double-fetching. Refetches when
  // the selected path changes.
  const [pathExfilSummaries, setPathExfilSummaries] = useState<
    Record<
      string,
      {
        tier: "high" | "medium" | "low" | "none"
        score: number
        total_bytes_out: number
        unknown_ip: number
        internet: number
        cloud_service: number
        saas: number
        cross_system: number
        strong_observations: number
      }
    >
  >({})

  useEffect(() => {
    if (!systemName || !currentPathPreReturn) {
      setPathExfilSummaries({})
      return
    }
    const nodes = currentPathPreReturn.nodes ?? []
    const isCompute = (n: any) => {
      if (n?.tier === "compute") return true
      const t = (n?.type ?? "").toLowerCase()
      return (
        t.includes("ec2") ||
        t.includes("lambda") ||
        t.includes("ecs") ||
        t.includes("eks") ||
        t.includes("fargate") ||
        t === "compute"
      )
    }
    const seen = new Set<string>()
    const targets: Array<{ id: string }> = []
    for (const n of nodes) {
      if (!isCompute(n) || !n.id || seen.has(n.id)) continue
      seen.add(n.id)
      targets.push({ id: n.id })
    }
    if (targets.length === 0) {
      setPathExfilSummaries({})
      return
    }
    let cancelled = false
    Promise.all(
      targets.map(async (t) => {
        try {
          const url = `/api/proxy/egress/system/${encodeURIComponent(
            systemName,
          )}/external-inventory?workload_id=${encodeURIComponent(t.id)}&summary=true`
          const res = await fetch(url, { cache: "no-store" })
          if (!res.ok) return null
          const j = await res.json()
          return { id: t.id, risk: j.exfil_risk }
        } catch {
          return null
        }
      }),
    ).then((results) => {
      if (cancelled) return
      const next: Record<string, any> = {}
      for (const r of results) {
        if (r?.risk) next[r.id] = r.risk
      }
      setPathExfilSummaries(next)
    })
    return () => {
      cancelled = true
    }
  }, [systemName, currentPathPreReturn])

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

  // Loading state — useCachedFetch `loading` is true ONLY on the
  // first-ever load with no localStorage cache. After the first
  // successful fetch in this browser, even cold-backend deploys
  // render the stale data instantly (isStale=true) and surface no
  // loading indicator — operator never sees a 30s blank stall.
  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <p className="text-sm text-slate-400">Analyzing identity attack paths...</p>
        </div>
      </div>
    )
  }

  // Error state — only when there's no cached fallback to render.
  // useCachedFetch keeps stale data visible on refresh failure, so
  // this branch only fires for the brand-new first visit on cold
  // backend. Existing data + backend error = quietly stale UI, not
  // a red error screen.
  if (displayError && !data) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
          <p className="text-sm text-white font-medium">Failed to load attack paths</p>
          <p className="text-xs text-slate-400">{displayError}</p>
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
            {/* Historical-evidence toggle: when ON, the API returns
                observed-behavior edges that fell outside the current
                collector window (annual DR drills, quarterly compliance
                scans, monthly batches that just missed this window).
                Default OFF so the live attack surface stays clean. */}
            <button
              onClick={() => setIncludeStale((v) => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold transition-colors"
              style={
                includeStale
                  ? {
                      background: "rgba(168, 85, 247, 0.15)",
                      color: "#d8b4fe",
                      border: "1px solid rgba(168, 85, 247, 0.35)",
                    }
                  : {
                      background: "rgba(15, 23, 42, 0.8)",
                      color: "#94a3b8",
                      border: "1px solid rgba(148, 163, 184, 0.15)",
                    }
              }
              title={
                includeStale
                  ? "Historical evidence ON — showing edges last seen outside the current collector window (annual DR drills, quarterly batches). Click to switch to live-only view."
                  : "Live-only view. Click to also show historical evidence (yearly / quarterly access patterns preserved as stale but available)."
              }
            >
              <span className="text-[10px]">
                {includeStale ? "● Historical" : "○ Live only"}
              </span>
            </button>
            {/* Deleted-resources toggle: when ON, surfaces nodes flagged
                is_active=false by the soft-delete reconciliation. The
                node still exists in Neo4j with a 'was deleted' badge,
                preserving forensic context. Default OFF so the live
                attack-path view doesn't show zombies. */}
            <button
              onClick={() => setIncludeDeleted((v) => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold transition-colors"
              style={
                includeDeleted
                  ? {
                      background: "rgba(244, 114, 182, 0.15)",
                      color: "#fbcfe8",
                      border: "1px solid rgba(244, 114, 182, 0.35)",
                    }
                  : {
                      background: "rgba(15, 23, 42, 0.8)",
                      color: "#94a3b8",
                      border: "1px solid rgba(148, 163, 184, 0.15)",
                    }
              }
              title={
                includeDeleted
                  ? "Showing soft-deleted resources (is_active=false). Useful for forensic 'what was the path before this EC2 was terminated?' analysis."
                  : "Hiding soft-deleted resources. Click to surface zombies with 'was deleted' context."
              }
            >
              <span className="text-[10px]">
                {includeDeleted ? "● Show deleted" : "○ Hide deleted"}
              </span>
            </button>
            {/* Enriched-evidence toggle (2026-05-20): when ON, each path
                node carries the Tier-1 Part 2 supplement fields (egress
                destinations, ENI count, mitigation history, target
                groups, S3 prefixes, route tables, LB targets, lambda
                invocations). The node detail panel renders these as
                additional evidence sections — additive only, never
                changes the path graph. Default off so the lighter
                payload stays the norm. */}
            <button
              onClick={() => setEnriched((v) => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold transition-colors"
              style={
                enriched
                  ? {
                      background: "rgba(56, 189, 248, 0.15)",
                      color: "#7dd3fc",
                      border: "1px solid rgba(56, 189, 248, 0.35)",
                    }
                  : {
                      background: "rgba(15, 23, 42, 0.8)",
                      color: "#94a3b8",
                      border: "1px solid rgba(148, 163, 184, 0.15)",
                    }
              }
              title={
                enriched
                  ? "Enriched evidence ON — showing route tables, egress destinations, ENI counts, target groups, prior mitigations, and more per node. Click to switch to the standard view."
                  : "Standard view — click to attach Tier-1 evidence (route tables, egress destinations, ENI counts, target groups, prior mitigations) to each path node."
              }
            >
              <span className="text-[10px]">
                {enriched ? "● Enriched" : "○ Standard"}
              </span>
            </button>
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

          {/* Attack Tree — structural "every door to this bucket" view for
              S3 jewels. Sits between the surface card and the per-path list
              so the operator gets the cross-path picture (which roles +
              workloads reach this bucket, multi-role pivots, default-SG
              exposure) before drilling into any single path. Suppressed for
              non-S3 jewels until the backend Cypher generalises. */}
          {selectedJewelId && (() => {
            const sel = (data?.crown_jewels ?? []).find((j) => j.id === selectedJewelId)
            if (!sel) return null
            const isS3 =
              (sel.type || "").toLowerCase().includes("s3") ||
              sel.id.includes(":s3:::") ||
              sel.id.startsWith("arn:aws:s3:")
            if (!isS3) return null
            // Prefer the bucket name (matches Neo4j b.name); fall back to ARN.
            // Backend accepts name / id / arn — name is the most readable.
            const identifier = sel.name || sel.id
            return <AttackTreePanel bucketIdentifier={identifier} bucketLabel={sel.name || sel.id} />
          })()}

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

          {/* Exfil-channel strip — per-workload exfil chips + narrative
              under the path. Decorates the attack path with the
              External Egress Inventory's risk signal without modifying
              the System Map / TrafficFlowMap (which has wider blast).
              Hidden when graph is maximized to give the graph the full
              viewport. */}
          {pathView === "detail" && currentPath && !isGraphMaximized && (
            <PathExfilSummary
              systemName={systemName}
              path={currentPath}
              externalSummaries={pathExfilSummaries}
              onNodeClick={(workloadId) => {
                // Reuse the existing node-click flow so the operator
                // lands in the node detail panel for the workload,
                // which (per chunk #1.5 wiring) shows its egress
                // inventory filtered to workload_id.
                handleNodeClick(workloadId)
              }}
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
                  {/* View toggle: Story (default) | Flow | Lanes.
                      Story is the operator-facing PathKillerMap — hero +
                      chain + findings + actions + lateral. Flow is the
                      shared TrafficFlowMap topology view. Lanes is the
                      5-column lateral diagram with enrichment badges. */}
                  <div className="inline-flex items-center bg-slate-800/60 rounded p-0.5 border border-slate-700">
                    <button
                      onClick={() => setGraphMode("killer")}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                        graphMode === "killer"
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                      title="Story view — severity, attack chain, every active finding, and the prioritized fix queue, on one screen."
                    >
                      Story
                    </button>
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
                graphMode === "killer" ? (
                  // Story view (default 2026-05-20). Hero + chain +
                  // findings + actions + lateral. The chain section
                  // embeds the *Lanes* view (AttackPathFlowViz, the
                  // 5-column attack-aware diagram) — the one that
                  // carries the Tier-1 enrichments: AssumedRole chain
                  // strip, finding pills, MFA badges, KMS/DDB/RDS
                  // type labels, posture ring, ALSO REACHES.
                  // Swapped from TrafficFlowMap (2026-05-20 #2) per
                  // operator feedback: Flow has no Tier-1 badges; the
                  // narrative wrapper deserves the lane-aware diagram.
                  // mapNode is just JSX; PathKillerMap renders it in
                  // a fixed-height container.
                  <PathKillerMap
                    path={currentPath}
                    systemPosture={data?.system_posture ?? null}
                    systemName={systemName}
                    onRemediateNode={(nodeId, dryRun) =>
                      handleNodeRemediate(nodeId, dryRun)
                    }
                    onRemediateAll={handleRemediateAll}
                    mapNode={
                      <AttackPathFlowViz
                        paths={jewelPaths}
                        selectedPathIndex={selectedPathIndex}
                        onNodeClick={handleNodeClick}
                        selectedNodeId={selectedNodeId}
                        systemPosture={data?.system_posture ?? null}
                      />
                    }
                  />
                ) : graphMode === "clean" ? (
                  // Reuse the actual System Map (TrafficFlowMap), but
                  // pass it the CURRENT path's nodes as a filter so each
                  // crown jewel renders its own real data flow — not the
                  // whole system map. Switching the selected path
                  // re-renders with that path's filtered architecture.
                  <div style={{ height: isGraphMaximized ? "calc(100vh - 180px)" : 720 }}>
                    <TrafficFlowMap
                      systemName={systemName}
                      pathFilter={trafficFlowPathFilter}
                      exfilByWorkloadId={pathExfilSummaries}
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
                        if (kind === "instance_profile") {
                          // IP carries no permissions — open the modal
                          // on the WRAPPED role. Resolve via the current
                          // path's USES_ROLE edge (authoritative), with
                          // a same-name-in-architecture fallback. Name
                          // lookup against the backend is then unambiguous
                          // because we send the role's real name.
                          const ipId = node.id
                          const wrappedEdge = currentPath?.edges?.find(
                            (e: any) => e.source === ipId && (e.type === "USES_ROLE" || e.type === "uses_role"),
                          )
                          let wrappedRoleId = wrappedEdge?.target as string | undefined
                          let wrappedRoleName: string | undefined
                          if (wrappedRoleId) {
                            const wn = currentPath?.nodes?.find((n: any) => n.id === wrappedRoleId) as any
                            wrappedRoleName = wn?.name
                          }
                          // Fallback: same name in the current architecture,
                          // skipping the IP itself (handles paths missing the
                          // USES_ROLE edge in this slice).
                          if (!wrappedRoleName) wrappedRoleName = node.name
                          setModalResource({
                            name: wrappedRoleName,
                            viaInstanceProfile: { name: node.name, arn: ipId },
                          })
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
                    systemPosture={data?.system_posture ?? null}
                  />
                )
              )}

              {/* ATLAS — Phase 3.2.3 (2026-05-27). Inline catalog-driven
                  chain search for the currently-selected path. Sits in
                  the empty space below the canvas (visible in BOTH the
                  maximized and non-maximized layouts) so the operator
                  always sees what the v0.1 primitive catalog says about
                  this path. Auto-derives foothold (EC2/Lambda) + target
                  (jewel) from the path itself — no inputs. */}
              {currentPath && (
                <AtlasInlineSection
                  systemName={systemName}
                  path={currentPath as any}
                  jewel={
                    (filteredJewels.find((j) => j.id === selectedJewelId) ?? null) as any
                  }
                />
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
            systemName={systemName}
          />
        )}
      </div>

      <IAMPermissionAnalysisModal
        isOpen={iamModalOpen}
        onClose={() => { setIamModalOpen(false); setModalResource(null) }}
        roleName={modalResource?.name ?? ""}
        systemName={systemName}
        viaInstanceProfile={modalResource?.viaInstanceProfile}
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

