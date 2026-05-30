"use client"

// =============================================================================
// AttackPathPanel — the merged "Attack Path" tab body.
// =============================================================================
//
// Replaces the dual Per-Path / Attacker-View rendering. ONE fetch from
// the strangler-pattern facade endpoint
//   GET /api/proxy/attack-path/<systemName>/<jewelId>?path_id=<id>
// → unified AttackPathPayload (severity + evidence + closure metadata
// AND graph-view canvas + lateral fan-outs in one payload).
//
// The header / breadcrumb / closure-card rendering is delegated to the
// existing PathAnalysisPanel (Per-Path's "irreplaceable" wrapper) with
// an `architecture` prop that swaps its embedded canvas from the sparse
// path-filter render to the full Attacker-View architecture render. The
// 9-lane layout, VPC boundary, lateral SGs with LATERAL badges,
// VPCE→Bucket dashed inferred edges, 3-state edge coloring, and hover
// provenance all come for free.
//
// Single source of truth: header, canvas, and footer all bind to the
// same `payload`. Sibling-path selector reads `payload.sibling_paths`.
// When a user clicks a different path in the selector, the parent
// updates `pathId` and this component re-fetches.
//
// When AttackerViewPanel is deleted in M5 of the merge, we move
// `buildAttackerArchitecture` to its own module — the import path is
// the only thing that changes here.
// =============================================================================

import { useMemo } from "react"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import { PathAnalysisPanel } from "./path-analysis-panel"
import {
  buildAttackerArchitecture,
  type GraphViewResponse,
} from "./build-attacker-architecture"
import type {
  AttackPathPayload,
  AttackPathFacadeError,
} from "./attack-path-types"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
  SeverityBreakdown,
} from "@/components/identity-attack-paths/types"

interface AttackPathPanelProps {
  systemName: string
  jewelId: string
  pathId: string
  isExpanded?: boolean
  onToggleExpand?: () => void
}

// Severity fields are all required on the IdentityAttackPath
// SeverityBreakdown type. When the backend payload omits them (older
// path types, partial breakdowns), fall back to a 0/UNKNOWN shape so
// PathAnalysisPanel's badge still renders without throwing.
function severityOrFallback(s: SeverityBreakdown | null): SeverityBreakdown {
  if (s) return s
  return {
    overall_score: 0,
    severity: "UNKNOWN",
    impact: 0,
    internet_exposure: 0,
    permission_breadth: 0,
    data_sensitivity: 0,
    identity_chain: 0,
    network_controls: 0,
    weights: {
      impact: 0,
      internet_exposure: 0,
      permission_breadth: 0,
      data_sensitivity: 0,
      identity_chain: 0,
      network_controls: 0,
    },
  }
}

export function AttackPathPanel({
  systemName,
  jewelId,
  pathId,
  isExpanded = false,
  onToggleExpand,
}: AttackPathPanelProps) {
  const fetchUrl = useMemo(() => {
    if (!systemName || !jewelId || !pathId) return null
    return `/api/proxy/attack-path/${encodeURIComponent(systemName)}/${encodeURIComponent(jewelId)}?path_id=${encodeURIComponent(pathId)}`
  }, [systemName, jewelId, pathId])

  const {
    data: payload,
    loading,
    error,
    retry,
    retrying,
    attempt,
  } = useRetryFetch<AttackPathPayload | AttackPathFacadeError>(fetchUrl, {
    refetchKey: `${systemName}:${jewelId}:${pathId}`,
    maxRetries: 2,
    initialDelayMs: 1000,
  })

  // Reconstruct the IdentityAttackPath shape PathAnalysisPanel + the
  // synthesis function expect, from the unified payload. We do this in
  // a memo so identity-stable references survive across renders, which
  // is what `buildAttackerArchitecture` needs to keep its cache hot.
  const identityPath = useMemo<IdentityAttackPath | null>(() => {
    if (!payload || isFacadeError(payload)) return null
    return {
      id: payload.path_id,
      crown_jewel_id: payload.jewel.id,
      nodes: payload.hops.nodes,
      edges: payload.hops.edges,
      severity: severityOrFallback(payload.severity),
      path_kind: payload.path_kind ?? "",
      evidence_type: payload.evidence_type ?? "configured",
      hop_count: payload.hop_count,
      risk_reduction: payload.risk_reduction,
      target_blast_radius: payload.target_blast_radius,
      path_kind_tag: payload.path_kind_tag ?? undefined,
      damage_capability: payload.damage_capability,
      damage_narrative: payload.damage_narrative,
      reduction_narrative: payload.reduction_narrative,
      reachable_neighbors: payload.reachable_neighbors ?? undefined,
    }
  }, [payload])

  const jewelSummary = useMemo<CrownJewelSummary | null>(() => {
    if (!payload || isFacadeError(payload)) return null
    return {
      id: payload.jewel.id,
      name: payload.jewel.name,
      type: payload.jewel.type,
      // The facade's lite jewel shape doesn't carry these; supply
      // safe defaults so the header doesn't try to read undefined.
      severity: "HIGH",
      path_count: payload.jewel.path_count,
      highest_risk_score: payload.severity?.overall_score ?? 0,
      is_internet_exposed: false,
      data_classification: null,
      priority_score: payload.severity?.overall_score ?? 0,
    }
  }, [payload])

  // Synthesize the 9-lane architecture from the canvas (graph-view)
  // data. This is the SAME synthesis the deleted AttackerViewPanel ran;
  // we just feed it from the unified payload instead of a separate
  // POST.
  const architecture = useMemo(() => {
    if (!payload || isFacadeError(payload) || !identityPath) return null
    // The facade's `canvas` field forwards the raw graph-view response
    // verbatim — cast to the synthesis function's input type.
    return buildAttackerArchitecture(
      payload.canvas as unknown as GraphViewResponse,
      identityPath,
    )
  }, [payload, identityPath])

  // ---- Loading / error states -------------------------------------------
  if (loading || retrying) {
    const label =
      retrying && attempt > 0
        ? `Backend was slow — retrying (attempt ${attempt + 1})…`
        : "Loading attack path…"
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-sm text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        {label}
      </div>
    )
  }

  if (error || !payload || isFacadeError(payload)) {
    const errMsg = isFacadeError(payload)
      ? `${payload.error}${payload.detail ? `: ${payload.detail}` : ""}`
      : error ?? "Failed to load attack path."
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-sm text-slate-400">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <div className="max-w-md text-center">{errMsg}</div>
        <button
          onClick={retry}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-slate-700 hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    )
  }

  if (!identityPath) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Empty path.
      </div>
    )
  }

  return (
    <PathAnalysisPanel
      path={identityPath}
      jewel={jewelSummary}
      systemName={systemName}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      architecture={architecture}
    />
  )
}

// Type guard — facade returns either AttackPathPayload (success) or
// AttackPathFacadeError ({error, detail?}) on a non-2xx response.
function isFacadeError(p: unknown): p is AttackPathFacadeError {
  return Boolean(
    p && typeof p === "object" && "error" in (p as Record<string, unknown>) && !("path_id" in (p as Record<string, unknown>)),
  )
}
