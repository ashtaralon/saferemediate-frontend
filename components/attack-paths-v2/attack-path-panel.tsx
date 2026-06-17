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

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import { PathAnalysisPanel } from "./path-analysis-panel"
import { useAttackMapCyntro } from "@/lib/attack-map/feature-flag"
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
  /** When the page already fetched IAP, skip the facade's second full-system IAP round-trip. */
  pathFromPage?: IdentityAttackPath | null
  jewelFromPage?: CrownJewelSummary | null
  siblingPathsFromPage?: IdentityAttackPath[]
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
  pathFromPage,
  jewelFromPage,
  siblingPathsFromPage,
  isExpanded = false,
  onToggleExpand,
}: AttackPathPanelProps) {
  // Canvas v2 — visual polish layer (caption strip, severity halo,
  // ENTRY chip, lateral dimming, verb chips, palette consolidation).
  // Pure visual — no data/contract changes.
  //
  // Promoted to DEFAULT on 2026-05-31 after the 12/12 prod
  // verification on dpl_7R2Q1N4AKrtUbiAti7vaTGWjwk8H (full check
  // matrix in sprint_canvas_v2_polish.md). The legacy renderer
  // stays reachable via ?canvas=v1 — escape hatch for the rollback
  // window, same shape as the ?mode=path → ?mode=attack-path
  // legacy-redirect we used for the merge itself
  // (decision_url_mode_default_implicit_for_merged_tab.md).
  //
  // URL convention:
  //   - No ?canvas=  → v2 (the new default)
  //   - ?canvas=v2   → v2 (explicit canonical; same behavior, kept
  //                    so old bookmarks of the opt-in window keep
  //                    working without redirect)
  //   - ?canvas=v1   → legacy (rollback escape hatch)
  const searchParams = useSearchParams()
  const canvasV2 = searchParams?.get("canvas") !== "v1"
  // Map stack: default = Cyntro SVG; ?map=legacy rolls back to containment map.
  const attackMapCyntro = useAttackMapCyntro()

  const fetchUrl = useMemo(() => {
    if (!systemName || !jewelId || !pathId) return null
    return `/api/proxy/attack-path/${encodeURIComponent(systemName)}/${encodeURIComponent(jewelId)}?path_id=${encodeURIComponent(pathId)}`
  }, [systemName, jewelId, pathId])

  const fetchInit = useMemo<RequestInit | undefined>(() => {
    if (!pathFromPage || pathFromPage.id !== pathId) return undefined
    const sibling_paths = (siblingPathsFromPage ?? []).map((p) => ({
      id: p.id,
      hop_count: p.hop_count ?? p.nodes?.length ?? 0,
      evidence_type: p.evidence_type ?? "configured",
      severity:
        typeof (p.severity as { overall_score?: number })?.overall_score ===
        "number"
          ? (p.severity as { overall_score: number }).overall_score
          : null,
    }))
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path_id: pathId,
        path: pathFromPage,
        jewel: jewelFromPage
          ? {
              id: jewelFromPage.id,
              name: jewelFromPage.name,
              type: jewelFromPage.type,
              path_count: jewelFromPage.path_count,
            }
          : undefined,
        sibling_paths,
      }),
    }
  }, [
    pathFromPage,
    pathId,
    siblingPathsFromPage,
    jewelFromPage,
  ])

  const {
    data: payload,
    loading,
    error,
    retry,
    retrying,
    attempt,
  } = useRetryFetch<AttackPathPayload | AttackPathFacadeError>(fetchUrl, {
    refetchKey: `${systemName}:${jewelId}:${pathId}:${pathFromPage ? "page" : "iap"}`,
    fetchInit,
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
      // The facade payload carries no authoritative gate state; the backend's
      // materialized :AttackPath summary (identity/route/data_plane gates) only
      // rides on the IAP list path. Thread it through from pathFromPage so the
      // bridge compiler can trust it instead of re-deriving (and downgrading an
      // OPEN_OBSERVED identity gate to OPEN_CONFIG off a partial edges[]).
      materialized: pathFromPage?.materialized,
      materialized_stale: pathFromPage?.materialized_stale,
      materialized_path: pathFromPage?.materialized_path ?? null,
    }
  }, [payload, pathFromPage])

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

  // Honest progress messaging for cold-cache loads. The backend's
  // /api/proxy/attack-path + /api/proxy/identity-attack-paths handlers
  // return 200 in 47-53s on cold cache (warm: 2.4s). A bare
  // "Loading attack path…" spinner that sits for 50+ seconds reads as
  // a hang to operators — per pattern_distinguish_hang_from_slow_success
  // the cure for slow-success-misread-as-hang is honest progress
  // messaging, not silence. After 15s, swap the copy to explain the
  // wait. Stamp data-loading-stage for empirical spot-checks.
  const [extendedWait, setExtendedWait] = useState(false)
  useEffect(() => {
    if (!(loading || retrying)) {
      setExtendedWait(false)
      return
    }
    const timer = setTimeout(() => setExtendedWait(true), 15_000)
    return () => clearTimeout(timer)
  }, [loading, retrying])

  // ---- Loading / error states -------------------------------------------
  if (loading || retrying) {
    const stage = extendedWait ? "extended" : "initial"
    const label =
      retrying && attempt > 0
        ? `Backend was slow — retrying (attempt ${attempt + 1})…`
        : extendedWait
          ? "Still loading…"
          : "Loading attack path…"
    const subtitle = extendedWait && !(retrying && attempt > 0)
      ? "Cold-cache responses can take 30–60s on first request after a deploy. The backend returns 200 eventually."
      : null
    return (
      <div
        className="flex flex-col h-full items-center justify-center gap-3 text-sm text-muted-foreground"
        data-loading-stage={stage}
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        <div>{label}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground max-w-md text-center px-4">
            {subtitle}
          </div>
        )}
      </div>
    )
  }

  if (error || !payload || isFacadeError(payload)) {
    const errMsg = isFacadeError(payload)
      ? `${payload.error}${payload.detail ? `: ${payload.detail}` : ""}`
      : error ?? "Failed to load attack path."
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-sm text-muted-foreground">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <div className="max-w-md text-center">{errMsg}</div>
        <button
          onClick={retry}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-border hover:bg-accent transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    )
  }

  if (!identityPath) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
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
      canvasV2={canvasV2}
      attackMapCyntro={attackMapCyntro}
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
