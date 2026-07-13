"use client"

// Attack Paths v2 — 3-column redesign.
//
// Per the 2026-05-21 design discussion:
//   Column 1 (left)   — Crown jewel list, click selects a jewel
//   Column 2 (center) — Paths grouped by source type (Lambda / EC2 /
//                       Principal / External Account / etc.), click
//                       selects a path
//   Column 3 (right)  — Per-path analysis: embedded path-filtered
//                       flow map + (sprint 2+) network/identity/data
//                       plane panels + potential damage + hardening
//
// Slice 1 ships the shell + embedded map. Plane panels, damage
// narrative, and hardening land in later slices. The shell is
// deep-linkable via ?system + ?jewel + ?path URL params so operators
// can share links to specific paths.
//
// Data: reuses the existing /api/proxy/identity-attack-paths/{system}
// endpoint and the IdentityAttackPathsResponse shape — no new backend
// for Slice 1. Backend already emits damage_narrative,
// reduction_narrative, risk_reduction, and damage_capability per path;
// Slice 1 surfaces these directly in the right column header.

import { useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Loader2, AlertTriangle, RefreshCw, Maximize2, Minimize2 } from "lucide-react"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { FreshnessBanner } from "@/components/freshness-banner"
import { filterActivePaths, narrowActivePaths } from "@/lib/active-filters"
import type { ActivePathList } from "@/lib/active-filters"
import { CrownJewelListPanel } from "@/components/identity-attack-paths/crown-jewel-list-panel"
import type {
  IdentityAttackPathsResponse,
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"
import { BackToDashboard } from "@/components/back-to-dashboard"
import { PathListGrouped } from "./path-list-grouped"
import { ExfilPathListColumn } from "./exfil-path-list-column"
import type { ExfilPayload } from "./exfil-view-v3"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import { classifyIapResponse } from "@/lib/attack-paths/iap-response-health"
import { AttackPathPanel } from "./attack-path-panel"
import { ConvergenceMapLoader } from "./convergence-map-loader"
import { CrownJewelUnionViewLink } from "./crown-jewel-union-view-link"
import { JewelExposurePanel } from "./jewel-exposure-panel"
import { AttackerViewV3 } from "./attacker-view-v3"
// v4 was a wrong-direction experiment (cloned Phase View v0.3's 9-lane
// grid, but Alon meant PER-PATH VIEW's TrafficFlowMap — same renderer
// v3 already uses). Reverted 2026-05-27. v4 file kept parked for ref.
import { ExfilViewV3 } from "./exfil-view-v3"
import { AttackerCanvasV2 } from "./attacker-canvas-v2"
import TopologyView from "./topology-view"
import { TopologyAttackGraph } from "@/components/attack-map/topology-attack-graph"
import { LateralMovementPanel } from "./lateral-movement-panel"
import { ZoomMinus1Landing } from "./zoom-minus1-landing"
import {
  buildModeBarTabs,
  modeBarHighlight,
  type AttackPathsMode,
} from "./mode-bar-tabs"
// Explorer tab now renders the real Traffic Map (same TrafficFlowMap engine the
// Topology tab uses), per Alon 2026-07 — replaced the AttackExplorer
// graph/surface/scorecard lenses. Static import mirrors attacker-view-v3, which
// already pulls TrafficFlowMap into this bundle.
import { ConvergencePathList } from "./convergence-path-list"
import { CrownJewelConvergenceView } from "./crown-jewel-convergence-view"
import { Zoom0FanInPanel } from "./zoom0-fan-in-panel"
import { buildConvergenceFetchUrl } from "@/lib/attack-paths/convergence-fetch-url"
import type { CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
import {
  iapPathsToConvergence,
  matchConvergencePathId,
} from "@/lib/attack-paths/iap-to-convergence"
import { convergencePathsToIdentityAttackPaths } from "@/lib/attack-paths/convergence-to-iap"
import { useCrownJewelConvergence } from "@/lib/attack-paths/use-crown-jewel-convergence"

function isTrustEnvelope(x: any): x is { provenance: any; result: any } {
  return x && typeof x === "object" && "result" in x && "provenance" in x
}

export function AttackPathsV2({
  systemName: systemNameProp,
  embedded = false,
  defaultMode = "attack-path",
  showEmbeddedAttackMap = true,
  mapOnlyPanel = false,
  onOpenRoleSplit,
}: {
  // Embedded mode (dashboard ATTACK PATH tab): `systemName` is supplied by
  // the dashboard and wins over the ?system URL param; the shell renders at a
  // contained height (not full-screen), drops BackToDashboard, and locks the
  // system to the dashboard's selection. Defaults preserve the standalone
  // /attack-paths-v2 route behavior exactly.
  systemName?: string | null
  embedded?: boolean
  // Seeds the view mode when the URL has no explicit ?mode= param. An
  // explicit ?mode= always wins. Default attack-path = Zoom −1 blast-radius
  // landing (no jewel) → Zoom 0 fan-in → Zoom 1 investigation (S4).
  defaultMode?: string
  /** When false, PathAnalysisPanel hides the per-path Attack map block
   *  (AttackPathLaneFlowMap). Dashboard Attack Paths tab may set false;
   *  deep-link ?mode=attacker_map still forces the map-only panel. */
  showEmbeddedAttackMap?: boolean
  /** Deep-link / folded Attacker Map: right column is ONLY the embedded
   *  Attack map block — no mode chips, path report, or evidence. */
  mapOnlyPanel?: boolean
  /** Navigate to the per-resource role-split remediation view (owned by the
   *  page shell, which holds the section-switch state). Threaded to the
   *  attack-path panel's shared-role callout. */
  onOpenRoleSplit?: (roleName: string) => void
} = {}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // URL-driven state — four keys: system (which AWS account/system),
  // jewel (which crown jewel selected), path (which path selected),
  // expand ("path" → hide left+center columns, give path analysis the
  // full screen; null → standard 3-column layout). Deep-linkable so a
  // shared URL preserves the maximize state.
  // useSearchParams returns null on the server / before hydration; the
  // optional chain + ?? guard against that without a useEffect.
  // 2026-05-30 — dropped hardcoded "alon-prod" default. The page now
  // honestly degrades to an empty state when no system is selected
  // (see EmptyState rendering below), and the system picker upstream
  // is the entry point operators land on.
  const systemName = systemNameProp ?? searchParams?.get("system") ?? null
  // Contained height for the dashboard-embedded tab vs full-screen for the
  // standalone route. Used by every shell branch (empty/loading/error/main)
  // so the 3-column layout scrolls inside the tab instead of overflowing.
  const shellHeight = embedded ? "h-[78vh] min-h-[600px]" : "h-screen"
  const selectedJewelId = searchParams?.get("jewel") ?? null
  const selectedPathId = searchParams?.get("path") ?? null
  // Exfil tab uses its own per-path selection (orthogonal to attack-path
  // selection). 2026-05-31: lifted from inside ExfilViewV3 so the center
  // column can render the path list mirroring PathListGrouped.
  const selectedExfilPathId = searchParams?.get("exfil_path") ?? null
  const expandMode = searchParams?.get("expand") ?? null
  // Canvas-expand toggle: hides columns 1+2 so the right-column view
  // (any mode) gets the full screen. Was originally gated to per-path
  // mode only; now available across every view via the toggle in the
  // shared ModeToggle bar. URL param name kept ("expand=path") for
  // bookmark back-compat.
  const isPathExpanded = expandMode === "path"
  // 2026-05-31 (merge): single "Attack Path" mode replaces the legacy
  // "path" (Per-Path) + "attacker" (Attacker View) modes. The merged
  // panel reads from one facade endpoint and renders Per-Path's header
  // wrapper around Attacker View's canvas. Old ?mode=path and
  // ?mode=attacker URLs are redirected below (router.replace) so deep
  // links keep working. Other modes (exposure, attacker_v2, phase,
  // exfil, topology) are unchanged.
  const modeParam = searchParams?.get("mode") ?? defaultMode
  // v0.3 phase view = the 9-lane attacker-phase Attacker View built
  // 2026-05-22. Renders chains from materialized AttackPath nodes (hop-
  // reified per v0.2 §3) — every line on the canvas comes from a real
  // Neo4j edge, no checkpoint inference. Default route still "path" to
  // avoid disrupting existing operators; phase view opted in via URL.
  // 2026-05-24: added "attacker_v2" — the typed, edge-proven canvas
  // (api/attack_canvas_view.py + components/attack-paths-v2/
  // attacker-canvas-v2.tsx). Lives alongside V1 "attacker" for
  // side-by-side comparison; V1 stays the default until V2 is
  // proven correct + explicit deprecation sign-off.
  // 2026-05-25: added "exfil" — the EXFIL view (PRD same date) that
  // BFS-forwards from the crown jewel to surface every door the
  // data can leave through. Distinct mental model from the
  // attacker/per-path/exposure tabs (which BFS backwards toward
  // entry points). See components/attack-paths-v2/exfil-view-v3.tsx
  // (greenfield rebuild 2026-05-26 — single dynamic TFM, no static grid).
  const viewMode: "attack-path" | "exposure" | "attacker_v2" | "phase" | "exfil" | "topology" | "lateral" | "attacker_map" | "convergence" =
    // back-compat: mode renamed explorer -> attacker_map (2026-07) when the
    // Explorer traffic-map was replaced by the Attacker Map. Old deep links
    // still land here.
    modeParam === "attacker_map" || modeParam === "explorer"
      ? "attacker_map"
      : modeParam === "exposure"
      ? "exposure"
      : modeParam === "convergence"
        ? "convergence"
      : modeParam === "attacker_v2"
        ? "attacker_v2"
        : modeParam === "phase"
          ? "phase"
          : modeParam === "exfil"
            ? "exfil"
            : modeParam === "topology"
              ? "topology"
              : modeParam === "lateral"
                ? "lateral"
                : // Legacy "path" / "attacker" both collapse into the
                // merged "attack-path" (URL gets rewritten by the
                // useEffect below so deep links stop showing the old
                // param values).
                "attack-path"

  // Beta gate (2026-06-11) — the typed-DTO "Attack Map" canvas is an
  // engineering comparison surface, not an operator tab. Hidden from
  // the default tab bar; reachable via ?beta=1 (and kept visible when
  // a deep link already points at it so the URL doesn't strand).
  const showBeta = searchParams?.get("beta") === "1" || viewMode === "attacker_v2"

  // 2026-05-30 v3 — auto-resolve which system to load when no ?system=
  // param is in the URL. Precedence:
  //   1. localStorage["cyntro:lastSystem"] — the system the operator
  //      was on last time. Single biggest UX win — "click Attack Paths
  //      v2 from the sidebar, land on the system you were just on".
  //   2. First system in the systems API response.
  //   3. Inline picker below (operator picks manually).
  //
  // localStorage is also WRITTEN by the side-effect below whenever
  // systemName changes — so each successful visit updates the memory.
  //
  // Robust to backend field-name variants (name / SystemName /
  // system_name — all three have shipped over time).
  const [availableSystems, setAvailableSystems] = useState<string[]>([])
  const [autoRedirectDone, setAutoRedirectDone] = useState(false)

  // Write the current system to localStorage so the next visit
  // resumes here.
  useEffect(() => {
    if (!systemName) return
    try {
      localStorage.setItem("cyntro:lastSystem", systemName)
    } catch {
      /* private mode / quota */
    }
  }, [systemName])

  // Legacy mode-param redirect (2026-05-31 merge). Old deep links
  // (?mode=path or ?mode=attacker) silently rewrite to the unified
  // ?mode=attack-path so bookmarks keep working. router.replace so the
  // back-button doesn't trap the operator on the rewrite URL.
  useEffect(() => {
    if (modeParam === "path" || modeParam === "attacker") {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      params.set("mode", "attack-path")
      router.replace(`${pathname}?${params.toString()}`)
    }
  }, [modeParam, searchParams, router, pathname])

  useEffect(() => {
    // Always fetch the systems list — the switcher in the header
    // needs it even when systemName IS set, so the operator can
    // swap to a different system without leaving the page.
    let aborted = false
    ;(async () => {
      try {
        const r = await fetch("/api/proxy/systems")
        if (!r.ok) {
          if (!aborted) setAutoRedirectDone(true)
          return
        }
        const j = await r.json()
        if (aborted) return
        const rawArr = Array.isArray(j?.systems) ? j.systems : []
        const names: string[] = rawArr
          .map((s: any): string =>
            typeof s === "string"
              ? s
              : (s?.name as string) ?? (s?.SystemName as string) ?? (s?.system_name as string) ?? "",
          )
          .filter(Boolean)
          .sort()
        setAvailableSystems(names)
        // Auto-redirect only fires when no system is in the URL.
        if (systemName) {
          setAutoRedirectDone(true)
          return
        }

        // Pick the target system: last-used (if still in the list) →
        // first available. localStorage-resume is the dominant UX
        // expectation — operators don't want a different system every
        // time they refresh.
        let target: string | undefined
        try {
          const last = localStorage.getItem("cyntro:lastSystem")
          if (last && names.includes(last)) target = last
        } catch {
          /* private mode */
        }
        if (!target) target = names[0]

        if (target) {
          const params = new URLSearchParams(searchParams?.toString() ?? "")
          params.set("system", target)
          router.replace(`${pathname}?${params.toString()}`)
        } else {
          setAutoRedirectDone(true)
        }
      } catch {
        if (!aborted) setAutoRedirectDone(true)
      }
    })()
    return () => {
      aborted = true
    }
  }, [systemName, searchParams, router, pathname])

  // Progressive load (P0 perf):
  //   1. /jewels — fast materialized crown-jewel list → left rail + shell
  //   2. by-crown-jewel/summary per selected jewel → path rail (critical)
  //   3. full IAP 12×8 — background only; never bricks the path rail on 502
  // (Render wake happens via jewels fetch + keep-warm cron — don't fire the
  // full keep-warm sweep from the browser on every tab open.)
  const jewelsUrl = systemName
    ? `/api/proxy/identity-attack-paths/${encodeURIComponent(systemName)}/jewels`
    : null
  const {
    data: jewelsRaw,
    loading: jewelsLoading,
    error: jewelsError,
    isStale: jewelsIsStale,
    retry: retryJewels,
  } = useCachedFetch<{
    result?: { crown_jewels?: CrownJewelSummary[] }
    data?: { crown_jewels?: CrownJewelSummary[] }
    crown_jewels?: CrownJewelSummary[]
  }>(jewelsUrl, {
    cacheKey: `iap-v2-jewels:${systemName}`,
    maxStaleMs: 10 * 60 * 1000,
  })

  // Full IAP fan-out is OPTIONAL enrichment only — never gate the path rail.
  // Cold alon-prod routinely exceeds the Wave D proxy abort → computing
  // envelope / 502. Paths come from by-crown-jewel/summary (materialized
  // AttackPath rows). Keep a background 12×8 fetch for when it succeeds
  // (richer severity / damage), but do not block or hard-error on it.
  const fetchUrl = systemName
    ? `/api/proxy/identity-attack-paths/${encodeURIComponent(systemName)}?envelope=true&max_jewels=12&max_paths_per_jewel=8`
    : null
  const {
    data: rawData,
    loading: isLoading,
    error: _iapBackgroundError,
    isStale: iapIsStale,
    retry: retryFullIap,
  } = useCachedFetch<any>(fetchUrl, {
    cacheKey: `iap-v2:12x8:${systemName}`,
  })
  // Intentionally ignore _iapBackgroundError for the path rail UI.

  const retry = () => {
    retryJewels()
    retryFullIap()
  }

  const liteJewels: CrownJewelSummary[] = useMemo(() => {
    const cjs =
      jewelsRaw?.result?.crown_jewels ??
      jewelsRaw?.data?.crown_jewels ??
      jewelsRaw?.crown_jewels ??
      []
    return Array.isArray(cjs) ? cjs : []
  }, [jewelsRaw])

  // Envelope unwrap. Backend wraps in {provenance, result}; we want the
  // result. Proxy stale fallback may also stamp fromStaleCache on the
  // outer object — keep that visible for freshness UX.
  const data: IdentityAttackPathsResponse | null = useMemo(() => {
    if (!rawData) return null
    return isTrustEnvelope(rawData) ? rawData.result : rawData
  }, [rawData])

  // Soft auto-retry of background IAP only — never surfaces in the path rail.
  useEffect(() => {
    if (!_iapBackgroundError || rawData || isLoading) return
    if (
      !String(_iapBackgroundError).includes("502") &&
      !String(_iapBackgroundError).includes("504")
    )
      return
    const t = setTimeout(() => {
      retryFullIap()
    }, 8000)
    return () => clearTimeout(t)
  }, [_iapBackgroundError, rawData, isLoading, retryFullIap])

  // Wave D computing envelope (HTTP 200, empty jewels) — keep polling so
  // the rail doesn't stick on a false empty after peer_computing / 5s abort.
  useEffect(() => {
    if (isLoading || !rawData || typeof rawData !== "object") return
    const status = (rawData as { status?: unknown }).status
    if (status !== "computing") return
    const t = setTimeout(() => {
      retryFullIap()
      retryJewels()
    }, 6000)
    return () => clearTimeout(t)
  }, [rawData, isLoading, retryFullIap, retryJewels])

  const fromProxyStale =
    Boolean((rawData as { fromStaleCache?: boolean } | null)?.fromStaleCache) ||
    Boolean((data as { fromStaleCache?: boolean } | null)?.fromStaleCache)

  // Prefer full IAP jewels (accurate path_count + severity) when present;
  // otherwise show the lite list so the shell paints immediately.
  const jewels: CrownJewelSummary[] =
    data?.crown_jewels && data.crown_jewels.length > 0
      ? data.crown_jewels
      : liteJewels

  // Trust gate: distinguish a real "0 crown jewels" from a cold/failed
  // routing compute that returned HTTP 200 with an error envelope (jewels
  // are derived from the Neo4j graph, so an empty list is only meaningful
  // when the graph source was actually read). Prevents the false-empty
  // "No crown jewels defined for this system yet" on a slow/erroring
  // backend — CLAUDE.md rule #1. See lib/attack-paths/iap-response-health.
  const iapHealth = useMemo(
    () => classifyIapResponse(rawData, data),
    [rawData, data],
  )
  // Client-side stale-node gate. Runs on EVERY render — fresh AND
  // localStorage-SWR-cached. Drops paths whose nodes carry
  // is_active=false. The backend already filters on fresh responses;
  // this catches the case where useCachedFetch surfaces a stale IAP
  // response from before backend hardening landed (e.g. on a 502).
  // See lib/active-filters.ts and
  // feedback_frontend_cache_can_serve_stale_phantoms.md.
  const allPaths: ActivePathList<IdentityAttackPath> = useMemo(
    () => filterActivePaths(data?.paths ?? []),
    [data?.paths],
  )

  // Paths still loading for a selected jewel — center column spinner.
  // Prefer by-crown-jewel summary (fast, materialized) over waiting on the
  // full IAP fan-out that routinely 502s on alon-prod cold compute.
  const showingStale =
    fromProxyStale || iapIsStale || jewelsIsStale


  // Paths for the currently-selected jewel. Empty list = no jewel
  // selected or no paths to it. narrowActivePaths preserves the
  // ActivePathList brand through the filter so the downstream
  // PathListGrouped prop type still matches.
  const selectedJewel = useMemo(
    () =>
      jewels.find(
        (j) =>
          j.id === selectedJewelId ||
          (selectedJewelId != null && j.canonical_id === selectedJewelId),
      ) ?? null,
    [jewels, selectedJewelId],
  )

  const iapJewelPaths: ActivePathList<IdentityAttackPath> = useMemo(() => {
    if (!selectedJewelId) return filterActivePaths([])
    return narrowActivePaths(allPaths, (p) => {
      if (p.crown_jewel_id === selectedJewelId) return true
      if (selectedJewel?.id && p.crown_jewel_id === selectedJewel.id) return true
      if (selectedJewel?.canonical_id && p.crown_jewel_id === selectedJewel.canonical_id)
        return true
      return false
    })
  }, [selectedJewelId, selectedJewel, allPaths])

  // Always load materialized paths for the selected jewel — this is what
  // keeps the middle rail usable when full IAP returns HTTP 502.
  const {
    data: jewelSummaryConvergence,
    loading: jewelSummaryLoading,
    retrying: jewelSummaryRetrying,
    attempts: jewelSummaryAttempts,
    error: jewelSummaryError,
    retry: retryJewelSummary,
  } = useCrownJewelConvergence(
    selectedJewel ? systemName : null,
    selectedJewel,
    selectedPathId,
    [...allPaths],
  )

  const jewelPaths: ActivePathList<IdentityAttackPath> = useMemo(() => {
    if (iapJewelPaths.length > 0) return iapJewelPaths
    if (selectedJewel && jewelSummaryConvergence?.paths?.length) {
      return filterActivePaths(
        convergencePathsToIdentityAttackPaths(
          selectedJewel,
          jewelSummaryConvergence.paths,
        ),
      )
    }
    return filterActivePaths([])
  }, [iapJewelPaths, selectedJewel, jewelSummaryConvergence])

  const pathsPending =
    Boolean(selectedJewelId) &&
    jewelPaths.length === 0 &&
    (jewelSummaryLoading || jewelSummaryRetrying)

  const pathsHardError =
    Boolean(selectedJewelId) &&
    jewelPaths.length === 0 &&
    !pathsPending &&
    Boolean(jewelSummaryError) &&
    jewelSummaryAttempts >= 3

  const pathsFromMaterializedFallback =
    iapJewelPaths.length === 0 && jewelPaths.length > 0

  const pathsWarming =
    Boolean(selectedJewelId) &&
    jewelPaths.length === 0 &&
    !pathsHardError &&
    (jewelSummaryLoading || jewelSummaryRetrying || Boolean(jewelSummaryError))

  // ─── Exfil-paths fetch (parent-owned) ────────────────────────────
  // Single source of truth for both the center-column rail
  // (ExfilPathListColumn) and the canvas (ExfilViewV3 — receives via
  // props). Gated on viewMode === "exfil" + a jewel id: every other
  // mode skips the fetch (network savings — exfil costs include the
  // ATLAS chain enrichment, ~200-400ms).
  const exfilEnabled = viewMode === "exfil" && !!systemName && !!selectedJewelId
  const exfilRequestBody = useMemo(
    () =>
      JSON.stringify({
        system_name: systemName ?? "",
        jewel_id: selectedJewelId ?? "",
        include_capable: true,
        include_observed: true,
        max_destinations: 50,
        include_atlas: true,
        atlas_max_hops: 6,
      }),
    [systemName, selectedJewelId],
  )
  const exfilFetchInit = useMemo<RequestInit>(
    () => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: exfilRequestBody,
    }),
    [exfilRequestBody],
  )
  const {
    data: exfilData,
    loading: exfilLoading,
    error: exfilError,
    retry: exfilRetry,
    retrying: exfilRetrying,
    attempt: exfilAttempt,
  } = useRetryFetch<ExfilPayload>(
    exfilEnabled ? "/api/proxy/attack-chain/exfil-paths" : null,
    {
      fetchInit: exfilFetchInit,
      refetchKey: `exfil:${systemName}:${selectedJewelId ?? ""}`,
      maxRetries: 2,
      initialDelayMs: 1000,
    },
  )

  const convergenceFetchUrl = useMemo(() => {
    if (viewMode !== "convergence" || !systemName || !selectedJewel) return null
    return buildConvergenceFetchUrl(systemName, selectedJewel)
  }, [viewMode, systemName, selectedJewel])

  const {
    data: convergenceData,
    loading: convergenceLoading,
    error: convergenceError,
    retry: convergenceRetry,
  } = useCachedFetch<CrownJewelConvergence>(convergenceFetchUrl, {
    cacheKey: `cj-convergence:${systemName}:${selectedJewelId ?? ""}`,
  })

  const iapConvergenceFallback = useMemo(() => {
    if (!systemName || !selectedJewel || jewelPaths.length === 0) return null
    return iapPathsToConvergence(systemName, selectedJewel, jewelPaths)
  }, [systemName, selectedJewel, jewelPaths])

  const convergenceSource = useMemo((): "live" | "fallback" => {
    if (convergenceData?.paths?.length) return "live"
    if (jewelSummaryConvergence?.paths?.length) return "live"
    return "fallback"
  }, [convergenceData, jewelSummaryConvergence])

  const effectiveConvergenceData = useMemo((): CrownJewelConvergence | null => {
    if (convergenceData?.paths?.length) return convergenceData
    if (jewelSummaryConvergence?.paths?.length) return jewelSummaryConvergence
    return iapConvergenceFallback
  }, [convergenceData, jewelSummaryConvergence, iapConvergenceFallback])

  const convergencePathId = useMemo(
    () =>
      effectiveConvergenceData
        ? matchConvergencePathId(
            effectiveConvergenceData.paths,
            selectedPathId,
            jewelPaths,
          )
        : null,
    [effectiveConvergenceData, selectedPathId, jewelPaths],
  )

  // Auto-select first convergence path when entering the tab.
  useEffect(() => {
    if (viewMode !== "convergence") return
    if (!effectiveConvergenceData?.paths?.length) return
    if (convergencePathId) return
    const firstId = effectiveConvergenceData.paths[0]?.path_id
    if (firstId) setUrl({ path: firstId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, effectiveConvergenceData, convergencePathId])

  // Auto-select the first exfil path when data arrives + URL doesn't
  // already specify one (or specifies a stale id no longer in the
  // list). Backend pre-sorts paths[] highest-traffic first, so this
  // matches the auto-pick behavior ExfilViewV3 had internally before
  // 2026-05-31 when the fetch was lifted up here.
  useEffect(() => {
    if (viewMode !== "exfil") return
    if (!exfilData?.paths) return
    if (exfilData.paths.length === 0) return
    if (
      selectedExfilPathId &&
      exfilData.paths.some((p) => p.path_id === selectedExfilPathId)
    )
      return
    const firstId = exfilData.paths[0]?.path_id
    if (firstId) {
      setUrl({ exfilPath: firstId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setUrl
    // intentionally not in deps (would re-run every URL change and
    // re-pick when it shouldn't).
  }, [viewMode, exfilData, selectedExfilPathId])

  // S4: do NOT auto-select the first crown jewel. No ?jewel= = Zoom −1
  // system blast-radius landing. Operators pick a jewel deliberately
  // for Zoom 0 fan-in (Alon / PRD-attacker-lens-three-zoom).
  // Clear stale ?jewel= so a removed/renamed id doesn't blank Zoom −1.
  useEffect(() => {
    if (!selectedJewelId || jewels.length === 0) return
    const stillThere = jewels.some(
      (j) =>
        j.id === selectedJewelId ||
        (j.canonical_id != null && j.canonical_id === selectedJewelId),
    )
    if (stillThere) return
    setUrl({ jewel: null, path: null, exfilPath: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setUrl
  }, [jewels, selectedJewelId])

  // The selected path object, if any. We tolerate selectedPathId
  // pointing at a path that doesn't exist (e.g. operator deep-linked
  // an old path id that's since been removed) — UI shows "path not
  // found" rather than crashing.
  const selectedPath = useMemo(() => {
    if (!selectedPathId) return null
    const matches = jewelPaths.filter(
      (p) => p.id === selectedPathId || p.attack_path_id === selectedPathId,
    )
    if (matches.length === 0) return null
    // Prefer materialized / path-mat-* so Zoom 1 report hits a real :AttackPath.
    return (
      matches.find(
        (p) =>
          p.materialized === true ||
          Boolean(p.materialized_path?.id) ||
          p.id.startsWith("path-mat-"),
      ) ?? matches[0]
    )
  }, [selectedPathId, jewelPaths])

  // Auto-select the highest-observed-traffic path when a jewel is
  // Auto-select the highest-traffic path when a jewel is selected and no
  // path id is in the URL — EXCEPT on Attack Path mode, where Zoom 0
  // (jewel fan-in) is the default until the operator picks a path
  // (PRD-attacker-lens-three-zoom S1).
  useEffect(() => {
    if (viewMode === "convergence") return
    if (viewMode === "attack-path") return
    if (!selectedJewelId) return
    if (selectedPathId) return
    if (jewelPaths.length === 0) return
    // Rank by sum(hit_count) on observed edges. Ties broken by
    // severity score then hop count.
    const ranked = [...jewelPaths].sort((a, b) => {
      const ha = (a.edges ?? []).reduce(
        (s, e) => s + (e.is_observed ? e.hit_count ?? 0 : 0),
        0,
      )
      const hb = (b.edges ?? []).reduce(
        (s, e) => s + (e.is_observed ? e.hit_count ?? 0 : 0),
        0,
      )
      if (hb !== ha) return hb - ha
      const sa = a.severity?.overall_score ?? 0
      const sb = b.severity?.overall_score ?? 0
      if (sb !== sa) return sb - sa
      return (a.hop_count ?? 0) - (b.hop_count ?? 0)
    })
    if (ranked[0]) {
      // Use the URL setter so deep links + back-button restore work.
      setUrl({ path: ranked[0].id })
    }
    // setUrl intentionally excluded from deps — it closes over the
    // current URL params so its identity changes on every render; we
    // only want to trigger when jewel selection or path-set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJewelId, selectedPathId, jewelPaths, viewMode])

  // Selection helpers — write to URL so deep links work and the
  // browser back button restores state.
  const setUrl = (next: { jewel?: string | null; path?: string | null; exfilPath?: string | null; expand?: string | null; mode?: string | null }) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (next.jewel !== undefined) {
      if (next.jewel === null) params.delete("jewel")
      else params.set("jewel", next.jewel)
    }
    if (next.path !== undefined) {
      if (next.path === null) params.delete("path")
      else params.set("path", next.path)
    }
    if (next.exfilPath !== undefined) {
      if (next.exfilPath === null) params.delete("exfil_path")
      else params.set("exfil_path", next.exfilPath)
    }
    if (next.expand !== undefined) {
      if (next.expand === null) params.delete("expand")
      else params.set("expand", next.expand)
    }
    if (next.mode !== undefined) {
      if (next.mode === null || next.mode === "path") params.delete("mode")
      else params.set("mode", next.mode)
    }
    // Always preserve system param across navigations.
    if (!params.get("system") && systemName) params.set("system", systemName)
    router.replace(`${pathname}?${params.toString()}`)
  }

  const handleSetMode = (next: "attack-path" | "exposure" | "attacker_v2" | "phase" | "exfil" | "topology" | "lateral" | "attacker_map" | "convergence") => {
    // Switching to exposure / phase / topology clears the path
    // selection — those aggregate across paths (phase shows every
    // chain targeting the jewel; topology / exposure are jewel-scoped
    // not path-scoped). attack-path and attacker_v2 require a path —
    // preserve it.
    setUrl({
      mode: next,
      path:
        next === "exposure" || next === "phase" || next === "topology"
          ? null
          : undefined,
    })
  }

  const handleToggleExpand = () => {
    setUrl({ expand: isPathExpanded ? null : "path" })
  }

  // Esc key handler — diagnostic: temporarily removed pending hooks-
  // order investigation 2026-05-21. The Expand/Collapse button still
  // works; only the Esc-key shortcut is gone for now.

  const handleSelectJewel = (jewelId: string) => {
    // Selecting a new jewel resets the path selection — different
    // jewel = different path set, so an old path id wouldn't match.
    // Also clears exfil_path: exfil path ids are also per-jewel.
    setUrl({ jewel: jewelId, path: null, exfilPath: null })
  }

  const handleSelectPath = (pathId: string) => {
    setUrl({ path: pathId })
  }

  const handleSelectExfilPath = (pathId: string) => {
    setUrl({ exfilPath: pathId })
  }

  // ─── No-system-selected guard ──────────────────────────────────
  // 2026-05-30 v2: page used to default to "alon-prod" silently. The
  // useEffect above auto-redirects to the first available system on
  // mount; while that fetch is in flight (or if it fails / returns
  // 0 systems) we render an inline picker so the operator can pick
  // manually instead of staring at a spinner.
  if (!systemName) {
    return (
      <div className={`flex ${shellHeight} items-center justify-center bg-background p-6`}>
        <div className="rounded-xl border border-border bg-card p-6 max-w-md w-full">
          <div className="text-sm font-semibold text-foreground mb-1">
            Select a system
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Attack Paths v2 needs a system to render.
            {!autoRedirectDone && availableSystems.length === 0 && (
              <> Loading available systems…</>
            )}
          </p>
          {availableSystems.length > 0 && (
            <div className="space-y-1.5">
              {availableSystems.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams?.toString() ?? "")
                    params.set("system", s)
                    router.replace(`${pathname}?${params.toString()}`)
                  }}
                  className="w-full text-left rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {autoRedirectDone && availableSystems.length === 0 && (
            <div className="text-xs text-muted-foreground">
              No systems available. Run an AWS sync from the dashboard to
              populate this list.{" "}
              <a href="/?section=systems" className="underline hover:text-foreground">
                Open systems dashboard
              </a>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Loading / error states ────────────────────────────────────
  // Zoom −1 (default, no jewel) only needs systemName — blast-radius is
  // its own fetch. Do NOT block the whole tab on full IAP.
  const zoomMinus1Ready =
    viewMode === "attack-path" && !selectedJewelId && Boolean(systemName)
  const hasUsableJewels = jewels.length > 0
  // First-paint spinner only when we can't show Zoom −1 and still have
  // no jewel list from either endpoint.
  if (!zoomMinus1Ready && !hasUsableJewels && (jewelsLoading || isLoading) && !data) {
    return (
      <div className={`flex ${shellHeight} items-center justify-center bg-background`}>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading attack paths for {systemName}…</span>
        </div>
      </div>
    )
  }

  // Hard error only when both lite jewels and full IAP failed with nothing
  // to render (no Zoom −1 either, or Zoom −1 still allowed below).
  if (
    !zoomMinus1Ready &&
    !hasUsableJewels &&
    !data &&
    (( _iapBackgroundError && !isLoading) || (jewelsError && !jewelsLoading))
  ) {
    return (
      <div className={`flex ${shellHeight} items-center justify-center bg-background`}>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 max-w-md">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-semibold">Could not load attack paths</span>
          </div>
          <div className="text-xs text-muted-foreground mb-3">
            {String(_iapBackgroundError || jewelsError)}
          </div>
          <button
            onClick={retry}
            className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/20 transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      </div>
    )
  }

  // Errored / cold-compute envelope with no usable jewels — show an honest
  // "couldn't compute" state, NEVER the false "No crown jewels defined"
  // empty. Once the response is healthy (or has any jewels) this yields to
  // the normal layout. Any-system: gated on the response's own provenance.
  // Skip while Zoom −1 can still render, or while jewels lite is in flight.
  if (
    !zoomMinus1Ready &&
    jewels.length === 0 &&
    iapHealth.failed &&
    !jewelsLoading &&
    !isLoading
  ) {
    return (
      <div className={`flex ${shellHeight} items-center justify-center bg-background`}>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 max-w-md">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-semibold">Attack paths not computed yet</span>
          </div>
          <div className="text-xs text-muted-foreground mb-1">
            The crown-jewel routing compute didn&apos;t complete for {systemName}
            {" "}— this is not the same as &quot;no crown jewels.&quot; The backend
            was likely cold or the graph snapshot wasn&apos;t ready.
          </div>
          {iapHealth.reason && (
            <div className="text-[11px] font-mono text-muted-foreground/80 mb-3">
              {iapHealth.reason}
            </div>
          )}
          <button
            onClick={retry}
            className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      </div>
    )
  }

  // ─── Main 3-column layout ──────────────────────────────────────
  return (
    <div className={`flex ${shellHeight} bg-background text-foreground overflow-hidden${embedded ? " rounded-xl border border-border" : ""}`}>
      {/* Column 1 — Crown jewels (hidden when path is maximized) */}
      <aside
        className={`${isPathExpanded ? "hidden" : "w-[320px]"} shrink-0 border-r border-border bg-background overflow-y-auto`}
      >
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-start gap-2">
            {!embedded && (
              <BackToDashboard
                className="p-1.5 -ml-1.5 rounded-md hover:bg-accent transition-colors shrink-0"
                iconClassName="w-4 h-4 text-muted-foreground"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                CYNTRO · ATTACK PATHS V2
              </div>
              {/* Standalone route: switcher lets the operator swap system
                  without leaving the page. Embedded in the dashboard tab:
                  the system is fixed by the dashboard's selection (the prop
                  wins over ?system), so we render a static label instead of
                  a switcher that would desync from the dashboard. */}
              {embedded ? (
                <div className="text-sm font-semibold text-foreground truncate">
                  {systemName}
                </div>
              ) : (
              <SystemSwitcher
                currentSystem={systemName}
                availableSystems={availableSystems}
                onSwitch={(s) => {
                  const params = new URLSearchParams(searchParams?.toString() ?? "")
                  params.set("system", s)
                  // Drop jewel/path when switching system — those ids
                  // are per-system and won't resolve on a different one.
                  params.delete("jewel")
                  params.delete("path")
                  router.replace(`${pathname}?${params.toString()}`)
                }}
              />
              )}
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {data
                  ? `${allPaths.length} paths · ${jewels.length} crown jewels`
                  : jewelsLoading
                    ? "Loading crown jewels…"
                    : `${jewels.length} crown jewels${isLoading ? " · paths loading…" : ""}`}
                {showingStale ? " · showing cached" : ""}
              </div>
            </div>
          </div>
        </div>
        <CrownJewelListPanel
          jewels={jewels}
          selectedJewelId={selectedJewelId}
          onSelect={handleSelectJewel}
        />
      </aside>

      {/* Column 2 — Paths grouped by source type (hidden when maximized,
          and hidden in exposure mode since exposure aggregates across
          paths). Operator can still get back to per-path view via the
          mode toggle in the right-column header. */}
      <section
        className={`${isPathExpanded || viewMode === "exposure" || viewMode === "topology" ? "hidden" : "w-[400px]"} shrink-0 border-r border-border overflow-y-auto bg-muted/30`}
      >
        {!selectedJewelId ? (
          <EmptyState
            title="Select a crown jewel"
            subtitle="Pick an asset on the left to see every path that reaches it."
          />
        ) : pathsPending || pathsWarming ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
            <div className="text-center">
              <div className="font-medium text-foreground">
                {jewelSummaryRetrying || jewelSummaryAttempts > 1
                  ? "Backend warming up — loading paths…"
                  : "Loading paths for this jewel…"}
              </div>
              <div className="text-[11px] mt-1">
                {selectedJewel?.path_count
                  ? `${selectedJewel.path_count} materialized path${selectedJewel.path_count === 1 ? "" : "s"} expected`
                  : "Materialized attack paths for this crown jewel"}
                {jewelSummaryAttempts > 1
                  ? ` · attempt ${jewelSummaryAttempts}`
                  : ""}
              </div>
            </div>
          </div>
        ) : pathsHardError ? (
          <div className="m-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 mb-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Paths still warming
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              {jewelSummaryError ||
                "Backend was cold and didn’t answer in time. Retry — the next try is usually fast."}
            </div>
            <button
              onClick={() => {
                retryJewelSummary()
                retryFullIap()
              }}
              className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-500/25 transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Retry paths
            </button>
          </div>
        ) : (
          <>
            {pathsFromMaterializedFallback && _iapBackgroundError ? (
              <div className="mx-4 mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                Showing materialized paths for this jewel. Full system fan-out
                is still catching up in the background.
              </div>
            ) : null}
            {viewMode === "exfil" ? (
          // Exfil tab: channel-grouped exfil-path rail. Mirrors
          // PathListGrouped's role for the attack-path tab — same
          // mental model, same column slot. 2026-05-31.
          <ExfilPathListColumn
            paths={exfilData?.paths ?? []}
            selectedPathId={selectedExfilPathId}
            onSelectPath={handleSelectExfilPath}
            jewelName={selectedJewel?.name ?? null}
            loading={exfilLoading}
          />
        ) : viewMode === "convergence" ? (
          <ConvergencePathList
            paths={effectiveConvergenceData?.paths ?? []}
            selectedPathId={convergencePathId}
            onSelectPath={handleSelectPath}
            loading={convergenceLoading && !effectiveConvergenceData}
          />
        ) : (
          <PathListGrouped
            paths={jewelPaths}
            jewel={jewels.find((j) => j.id === selectedJewelId) ?? null}
            selectedPathId={selectedPathId}
            onSelectPath={handleSelectPath}
          />
        )}
          </>
        )}
      </section>

      {/* Column 3 — Per-path analysis OR Exposure view, gated by mode */}
      <main
        className={`flex-1 bg-background ${
          isPathExpanded && (viewMode === "attacker_map" || viewMode === "attack-path")
            ? "flex flex-col min-h-0 overflow-hidden"
            : "overflow-y-auto"
        }`}
      >
        {/* Topology view is system-level, not jewel-level — render it
            even when no jewel is selected. The mode toggle still
            renders so the user can switch back to a path view. */}
        {viewMode === "topology" ? (
          <>
            <ModeToggle
              mode={viewMode}
              onChange={handleSetMode}
              jewelName={jewels.find((j) => j.id === selectedJewelId)?.name ?? null}
              pathCount={jewelPaths.length}
              isExpanded={isPathExpanded}
              onToggleExpand={handleToggleExpand}
              showBeta={showBeta}
            />
            {jewels.length > 0 ? (
              <TopologyAttackGraph
                systemName={systemName}
                initialJewel={selectedJewel ?? jewels[0]}
                jewels={jewels}
              />
            ) : (
              <div className="flex h-[760px] items-center justify-center text-sm text-slate-400">
                No crown jewels on this system yet — connect collectors to populate.
              </div>
            )}
          </>
        ) : !selectedJewelId ? (
          // Zoom −1 (S4): system blast-radius landing. Pick a jewel on
          // the left → Zoom 0 fan-in. Attack Map / Lateral / Exfil chips
          // stay on the mode bar as alternate presentations.
          <>
            <ModeToggle
              mode={viewMode}
              onChange={handleSetMode}
              jewelName={null}
              pathCount={0}
              isExpanded={isPathExpanded}
              onToggleExpand={handleToggleExpand}
              showBeta={showBeta}
            />
            <ZoomMinus1Landing systemName={systemName} />
          </>
        ) : (
          <>
            <ModeToggle
              mode={viewMode}
              onChange={handleSetMode}
              jewelName={jewels.find((j) => j.id === selectedJewelId)?.name ?? null}
              pathCount={jewelPaths.length}
              isExpanded={isPathExpanded}
              onToggleExpand={handleToggleExpand}
              showBeta={showBeta}
            />
            {viewMode === "exposure" ? (
              <JewelExposurePanel
                jewel={jewels.find((j) => j.id === selectedJewelId)!}
                systemName={systemName}
              />
            ) : viewMode === "attacker_v2" ? (
              // V2 — typed, edge-proven canvas. Lives alongside V1
              // for side-by-side comparison until V2 is proven
              // correct + explicit deprecation sign-off.
              !selectedPath ? (
                <EmptyState
                  title="Select a path for V2 canvas"
                  subtitle="V2 renders the same path via the typed AttackCanvas DTO from POST /api/attack-chain/canvas — every node and edge backed by an explicit Neo4j relationship, no frontend inference."
                  large
                />
              ) : (
                <AttackerCanvasV2
                  systemName={systemName}
                  pathId={selectedPath.id}
                  path={selectedPath}
                  jewel={jewels.find((j) => j.id === selectedJewelId) ?? null}
                />
              )
            ) : viewMode === "phase" ? (
              // v0.3 — 9-lane attacker-phase view. Reads materialized
              // :AttackPath nodes (hop-reified per v0.2 §3) via the
              // chains-for-cj endpoint. Doesn't depend on a selected
              // path — it shows ALL chains targeting the selected jewel,
              // ranked by severity / freshness / foothold.
              !selectedJewelId ? (
                <EmptyState
                  title="Select a crown jewel for phase view"
                  subtitle="Phase view shows every attack chain targeting the selected jewel across 9 attacker-phase lanes (Entry → Reach → Land → Steal Creds → Become → Reach Data → Exfil + Persist + Defense)."
                  large
                />
              ) : (
                <AttackerViewV3
                  jewelId={selectedJewelId}
                  jewelName={jewels.find((j) => j.id === selectedJewelId)?.name ?? selectedJewelId}
                  systemName={systemName}
                />
              )
            ) : viewMode === "exfil" ? (
              // EXFIL view — Phase A 2026-05-25 PRD. BFS-forward from
              // the crown jewel to surface the data's escape routes.
              // Five-column canvas: SOURCE → ACCESSORS → EGRESS PLANES
              // → EXTERNAL GATES → DESTINATIONS. Phase A only fills the
              // NETWORK egress sub-lane + Internet destination from
              // existing data; IDENTITY and DATA-PROPAGATION sub-lanes
              // render NotWiredCards with the collector backlog inline.
              !selectedJewelId ? (
                <EmptyState
                  title="Select a crown jewel for exfil view"
                  subtitle="Exfil view answers 'where does the data go from this jewel?' — every door the data can leave through, plus which ones are actively exfiltrating right now."
                  large
                />
              ) : (
                <ExfilViewV3
                  systemName={systemName}
                  jewel={jewels.find((j) => j.id === selectedJewelId) ?? null}
                  data={exfilData ?? null}
                  loading={exfilLoading}
                  error={exfilError}
                  retry={exfilRetry}
                  retrying={exfilRetrying}
                  attempt={exfilAttempt}
                  selectedPathId={selectedExfilPathId}
                  onSelectPath={handleSelectExfilPath}
                />
              )
            ) : viewMode === "lateral" ? (
              // Lateral Movement — light blast-radius view: for each role on
              // the selected path, the OTHER resources it can also reach. The
              // panel fetches the per-path facade so it has the graph-view
              // canvas (real lateral fan-out), then derives the reach groups.
              !selectedPath || !selectedJewelId ? (
                <EmptyState
                  title="Select a path"
                  subtitle="Lateral movement shows where this path's identity can pivot next — sibling resources each role on the path can also touch. Pick a path on the left."
                  large
                />
              ) : (
                <LateralMovementPanel
                  systemName={systemName}
                  jewelId={selectedJewelId}
                  pathId={selectedPath.id}
                  pathFromPage={selectedPath}
                  jewelFromPage={selectedJewel}
                  siblingPathsFromPage={jewelPaths}
                />
              )
            ) : viewMode === "convergence" ? (
              selectedJewel ? (
                <CrownJewelConvergenceView
                  jewel={selectedJewel}
                  data={effectiveConvergenceData}
                  loading={convergenceLoading && !effectiveConvergenceData}
                  error={convergenceSource === "live" ? convergenceError : null}
                  retry={convergenceRetry}
                  selectedPathId={convergencePathId}
                  source={convergenceSource}
                />
              ) : (
                <EmptyState
                  title="Select a crown jewel"
                  subtitle="Convergence fans every materialized path to the jewel over real subnet and security-group placement."
                  large
                />
              )
            ) : viewMode === "attacker_map" ? (
              // Attacker Map — embedded per-path flow map only (same as the
              // former top-level Attacker Map tab). Sits next to Attack Path
              // in the mode bar; left + center columns stay for selection.
              !selectedPath || !selectedJewelId ? (
                <EmptyState
                  title="Select a path"
                  subtitle="Attacker Map shows the per-path VPC topology canvas. Pick a crown jewel and path on the left."
                  large
                />
              ) : (
                <AttackPathPanel
                  systemName={systemName}
                  jewelId={selectedJewelId}
                  pathId={selectedPath.id}
                  pathFromPage={selectedPath}
                  jewelFromPage={selectedJewel}
                  siblingPathsFromPage={jewelPaths}
                  isExpanded={isPathExpanded}
                  onToggleExpand={handleToggleExpand}
                  onOpenRoleSplit={onOpenRoleSplit}
                  showEmbeddedAttackMap={true}
                  mapOnlyPanel={true}
                />
              )
            ) : jewelPaths.length === 0 && selectedPathId && selectedJewel ? (
              // IAP has no synthesized paths for this jewel (e.g. materialized-only
              // convergence rows) — render the convergence spine directly.
              <div className="flex flex-col h-full overflow-auto">
                <div className="px-6 py-2 border-b border-border bg-background/95 flex items-center justify-between gap-3">
                  <span className="text-xs font-mono text-amber-700 dark:text-amber-300 truncate">
                    {selectedJewel.name}
                  </span>
                  <CrownJewelUnionViewLink systemName={systemName} jewel={selectedJewel} />
                </div>
                <ConvergenceMapLoader
                  systemName={systemName}
                  cjArn={
                    selectedJewel.canonical_id ??
                    (selectedJewel.id.startsWith("arn:") ? selectedJewel.id : null)
                  }
                  cjName={selectedJewel.name}
                  initialSelectedPathId={selectedPathId}
                  fallbackJewel={selectedJewel}
                  fallbackPaths={[]}
                />
              </div>
            ) : !selectedJewelId || (!selectedPath && !selectedPathId) ? (
              // Zoom 0 — jewel selected, no path: fan-in + triage list on the left.
              selectedJewel && systemName ? (
                <Zoom0FanInPanel
                  systemName={systemName}
                  jewel={selectedJewel}
                  paths={[...jewelPaths]}
                  selectedPathId={selectedPathId}
                  onRequestMode={handleSetMode}
                  isExpanded={isPathExpanded}
                />
              ) : (
                <EmptyState
                  title="Select a path"
                  subtitle={
                    jewelPaths.length === 0 && !selectedPathId
                      ? "No attack paths to this jewel today. Switch to Exposure view to see standing access."
                      : `Pick one of the ${jewelPaths.length} paths on the left to drill in.`
                  }
                  large
                />
              )
            ) : (
              // Merged "Attack Path" view (2026-05-31). One facade fetch
              // (/api/proxy/attack-path/<sys>/<jewel>?path_id=<id>),
              // Per-Path header/footer wrapper around Attacker-View 9-
              // lane canvas. Replaces both the legacy PathAnalysisPanel
              // (direct prop pass) and AttackerViewPanel (separate
              // graph-view fetch) renders.
              <AttackPathPanel
                systemName={systemName}
                jewelId={selectedJewelId}
                pathId={selectedPath?.id ?? selectedPathId!}
                pathFromPage={selectedPath}
                jewelFromPage={selectedJewel}
                siblingPathsFromPage={jewelPaths}
                isExpanded={isPathExpanded}
                onToggleExpand={handleToggleExpand}
                onOpenRoleSplit={onOpenRoleSplit}
                showEmbeddedAttackMap={showEmbeddedAttackMap}
                mapOnlyPanel={mapOnlyPanel}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ─── Helper: Per-path ↔ Exposure mode toggle ────────────────────
//
// Sticky bar above the right-column panel. Two pills, URL-driven via
// ?mode={path|exposure}. Switching to exposure clears any selected path
// (the URL handler in setUrl does that) so the operator can't end up in
// a state where the URL says ?mode=exposure but the panel still reads
// from a stale ?path id.
function ModeToggle({
  mode,
  onChange,
  jewelName,
  pathCount,
  isExpanded,
  onToggleExpand,
  showBeta = false,
}: {
  mode: AttackPathsMode
  onChange: (next: AttackPathsMode) => void
  jewelName: string | null
  pathCount: number
  isExpanded: boolean
  onToggleExpand: () => void
  /** Gate for beta engineering canvases (?beta=1). */
  showBeta?: boolean
}) {
  // Attack Map + Lateral Movement restored as primary chips (operator
  // asked for the previous presentation options after S4 folded them).
  const tabs = buildModeBarTabs(showBeta)
  const highlight = modeBarHighlight(mode)
  return (
    <div className="px-6 py-3 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-20 flex items-center gap-3 min-w-0 shrink-0">
      {/* Freshness pill — graph age from CollectorRun.finished_at.
          Lives in the shared tab bar so every view tab inherits an
          honest "Graph synced X min ago" signal. Replaces the
          implicit "live" framing the tab subtitles use. */}
      <FreshnessBanner variant="pill" className="shrink-0" />
      {/* ATLAS is an inline section at the bottom of the Attacker View
          canvas (atlas-inline-section.tsx). EXFIL inverts the BFS
          direction: jewel = SOURCE, external destinations = SINKS.
          Topology shows the customer's architecture, not the
          attacker's path. */}
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="flex rounded-md border border-border overflow-hidden w-max max-w-full">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            title={tab.title}
            className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors border-r border-border last:border-r-0 ${
              highlight === tab.key
                ? "bg-primary/10 text-primary"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
        </div>
      </div>
      {/* Quiet context — mode descriptions live in the tab tooltips. The
         path count is suppressed in topology mode because the canvas
         displays its own count from /by-crown-jewel (different endpoint,
         different number). Showing both invites confusion. */}
      <div className="text-[10px] text-muted-foreground min-w-0 truncate hidden md:block max-w-[220px] shrink">
        {jewelName
          ? mode === "topology"
            ? jewelName
            : `${jewelName} · ${pathCount} path${pathCount === 1 ? "" : "s"}`
          : null}
      </div>
      <button
        onClick={onToggleExpand}
        title={isExpanded ? "Collapse — restore jewels + paths columns" : "Expand canvas — hide jewels + paths columns"}
        aria-label={isExpanded ? "Collapse canvas" : "Expand canvas"}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        {isExpanded ? (
          <>
            <Minimize2 className="h-3 w-3" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Collapse</span>
          </>
        ) : (
          <>
            <Maximize2 className="h-3 w-3" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Expand</span>
          </>
        )}
      </button>
    </div>
  )
}

// ─── Helper: empty / placeholder state ──────────────────────────
/**
 * System switcher — sidebar header dropdown. Replaces the static
 * system-name label so operators can swap to a different system
 * without leaving the page. The localStorage-resume effect picks up
 * the new value on next visit.
 */
function SystemSwitcher({
  currentSystem,
  availableSystems,
  onSwitch,
}: {
  currentSystem: string
  availableSystems: string[]
  onSwitch: (s: string) => void
}) {
  const [open, setOpen] = useState(false)
  const hasOthers = availableSystems.filter((s) => s !== currentSystem).length > 0
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-left w-full mt-0.5 flex items-center gap-1.5 hover:opacity-80 transition-opacity"
        title={hasOthers ? "Switch system" : "Only system available"}
      >
        <span className="text-sm font-semibold text-foreground truncate">{currentSystem}</span>
        {hasOthers && (
          <span className="text-[9px] text-muted-foreground uppercase">▾</span>
        )}
      </button>
      {open && hasOthers && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[200px] max-h-[300px] overflow-y-auto rounded-md border border-border bg-card shadow-lg">
            <div className="px-3 py-2 text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border">
              Switch system
            </div>
            {availableSystems.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setOpen(false)
                  if (s !== currentSystem) onSwitch(s)
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors ${
                  s === currentSystem ? "text-primary font-semibold" : "text-foreground"
                }`}
              >
                {s === currentSystem ? "● " : "  "}
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function EmptyState({
  title,
  subtitle,
  large = false,
}: {
  title: string
  subtitle: string
  large?: boolean
}) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className={`text-center max-w-md ${large ? "py-20" : "py-12"}`}>
        <div className={`${large ? "text-lg" : "text-sm"} font-semibold text-foreground`}>
          {title}
        </div>
        <div className={`mt-1.5 ${large ? "text-sm" : "text-xs"} text-muted-foreground`}>
          {subtitle}
        </div>
      </div>
    </div>
  )
}
