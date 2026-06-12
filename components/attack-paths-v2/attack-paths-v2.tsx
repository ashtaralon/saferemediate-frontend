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
import { AttackPathPanel } from "./attack-path-panel"
import { JewelExposurePanel } from "./jewel-exposure-panel"
import { AttackerViewV3 } from "./attacker-view-v3"
// v4 was a wrong-direction experiment (cloned Phase View v0.3's 9-lane
// grid, but Alon meant PER-PATH VIEW's TrafficFlowMap — same renderer
// v3 already uses). Reverted 2026-05-27. v4 file kept parked for ref.
import { ExfilViewV3 } from "./exfil-view-v3"
import { AttackerCanvasV2 } from "./attacker-canvas-v2"
import TopologyView from "./topology-view"
import { AllCrownJewelsView } from "./all-crown-jewels-view"

function isTrustEnvelope(x: any): x is { provenance: any; result: any } {
  return x && typeof x === "object" && "result" in x && "provenance" in x
}

export function AttackPathsV2() {
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
  const systemName = searchParams?.get("system") ?? null
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
  const modeParam = searchParams?.get("mode") ?? "attack-path"
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
  const viewMode: "attack-path" | "exposure" | "attacker_v2" | "phase" | "exfil" | "topology" =
    modeParam === "exposure"
      ? "exposure"
      : modeParam === "attacker_v2"
        ? "attacker_v2"
        : modeParam === "phase"
          ? "phase"
          : modeParam === "exfil"
            ? "exfil"
            : modeParam === "topology"
              ? "topology"
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
        const r = await fetch("/api/proxy/systems/available", { cache: "no-store" })
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

  // Same fetch pattern as the legacy page — reusing the proxy +
  // useCachedFetch SWR layer so v2 inherits the cold-backend handling
  // that took several iterations to get right.
  // Enriched supplements run on the attack-path facade (map tab) only —
  // not here. Page load is jewel list + path graph shape; enriched=true
  // on this fetch doubled IAP cold time (~20–60s) before the map could start.
  const fetchUrl = systemName
    ? `/api/proxy/identity-attack-paths/${encodeURIComponent(systemName)}?envelope=true`
    : null
  const {
    data: rawData,
    loading: isLoading,
    error,
    retry,
  } = useCachedFetch<any>(fetchUrl, {
    cacheKey: `iap-v2:${systemName}`,
  })

  // Envelope unwrap. Backend wraps in {provenance, result}; we want the
  // result.
  const data: IdentityAttackPathsResponse | null = useMemo(() => {
    if (!rawData) return null
    return isTrustEnvelope(rawData) ? rawData.result : rawData
  }, [rawData])

  const jewels: CrownJewelSummary[] = data?.crown_jewels ?? []
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

  // Paths for the currently-selected jewel. Empty list = no jewel
  // selected or no paths to it. narrowActivePaths preserves the
  // ActivePathList brand through the filter so the downstream
  // PathListGrouped prop type still matches.
  const jewelPaths: ActivePathList<IdentityAttackPath> = useMemo(() => {
    if (!selectedJewelId) return filterActivePaths([])
    return narrowActivePaths(allPaths, (p) => p.crown_jewel_id === selectedJewelId)
  }, [selectedJewelId, allPaths])

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

  // The selected path object, if any. We tolerate selectedPathId
  // pointing at a path that doesn't exist (e.g. operator deep-linked
  // an old path id that's since been removed) — UI shows "path not
  // found" rather than crashing.
  const selectedPath = useMemo(() => {
    if (!selectedPathId) return null
    return jewelPaths.find((p) => p.id === selectedPathId) ?? null
  }, [selectedPathId, jewelPaths])

  // Auto-select the highest-observed-traffic path when a jewel is
  // selected and no path id is in the URL.
  //
  // 2026-05-22 audit fix: previously the operator had to click into
  // the center column to pick a path. With paths sorted by synthetic
  // severity score, they often landed on a low-hit path (Chain C, 2
  // hits) while the highest-traffic chain (Chain A, 11 hits) sat
  // un-selected lower in the list. Auto-selecting the most-observed
  // path means operators see the real attack first.
  useEffect(() => {
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
  }, [selectedJewelId, selectedPathId, jewelPaths])

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

  const handleSetMode = (next: "attack-path" | "exposure" | "attacker_v2" | "phase" | "exfil" | "topology") => {
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
      <div className="flex h-screen items-center justify-center bg-background p-6">
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
  if (isLoading && !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading attack paths for {systemName}…</span>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 max-w-md">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-semibold">Could not load attack paths</span>
          </div>
          <div className="text-xs text-muted-foreground mb-3">{String(error)}</div>
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

  // ─── Main 3-column layout ──────────────────────────────────────
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Column 1 — Crown jewels (hidden when path is maximized) */}
      <aside
        className={`${isPathExpanded ? "hidden" : "w-[260px]"} shrink-0 border-r border-border bg-background overflow-y-auto`}
      >
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-start gap-2">
            <BackToDashboard
              className="p-1.5 -ml-1.5 rounded-md hover:bg-accent transition-colors shrink-0"
              iconClassName="w-4 h-4 text-muted-foreground"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                CYNTRO · ATTACK PATHS V2
              </div>
              {/* System switcher — operator can swap to a different
                  system without leaving the page. Replaces the
                  static label that locked them in once auto-redirect
                  picked a wrong system. */}
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
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {allPaths.length} paths · {jewels.length} crown jewels
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
        className={`${isPathExpanded || viewMode === "exposure" ? "hidden" : "w-[400px]"} shrink-0 border-r border-border overflow-y-auto bg-muted/30`}
      >
        {!selectedJewelId ? (
          <EmptyState
            title="Select a crown jewel"
            subtitle="Pick an asset on the left to see every path that reaches it."
          />
        ) : viewMode === "exfil" ? (
          // Exfil tab: channel-grouped exfil-path rail. Mirrors
          // PathListGrouped's role for the attack-path tab — same
          // mental model, same column slot. 2026-05-31.
          <ExfilPathListColumn
            paths={exfilData?.paths ?? []}
            selectedPathId={selectedExfilPathId}
            onSelectPath={handleSelectExfilPath}
            jewelName={jewels.find((j) => j.id === selectedJewelId)?.name ?? null}
            loading={exfilLoading}
          />
        ) : (
          <PathListGrouped
            paths={jewelPaths}
            jewel={jewels.find((j) => j.id === selectedJewelId) ?? null}
            selectedPathId={selectedPathId}
            onSelectPath={handleSelectPath}
          />
        )}
      </section>

      {/* Column 3 — Per-path analysis OR Exposure view, gated by mode */}
      <main className="flex-1 overflow-y-auto bg-background">
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
            <TopologyView systemName={systemName} selectedPath={selectedPath ?? null} />
          </>
        ) : !selectedJewelId ? (
          // 2026-05-30: aggregated view replaces the old "select a
          // jewel" empty state. Shows every CJ + every path on the
          // system at once so the operator gets the full attack-
          // surface footprint at a glance. Click any CJ → drill in.
          <AllCrownJewelsView
            jewels={jewels}
            paths={allPaths}
            onSelectJewel={(jewelId) => setUrl({ jewel: jewelId })}
            onSelectPath={(jewelId, pathId) => setUrl({ jewel: jewelId, path: pathId })}
            currentSystem={systemName}
            otherSystems={availableSystems.filter((s) => s !== systemName)}
            onSwitchSystem={(s) => {
              const params = new URLSearchParams(searchParams?.toString() ?? "")
              params.set("system", s)
              params.delete("jewel")
              params.delete("path")
              router.replace(`${pathname}?${params.toString()}`)
            }}
          />
        ) : (
          <>
            {/* Mode toggle — sticky header above the per-mode panel. URL-driven
                so deep links to ?mode=exposure work, and switching is instant
                (no refetch of the jewels list). */}
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
            ) : !selectedPath || !selectedJewelId ? (
              <EmptyState
                title="Select a path"
                subtitle={
                  jewelPaths.length === 0
                    ? "No attack paths to this jewel today. Switch to Exposure view to see standing access."
                    : `Pick one of the ${jewelPaths.length} paths on the left to drill in.`
                }
                large
              />
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
                pathId={selectedPath.id}
                pathFromPage={selectedPath}
                jewelFromPage={
                  jewels.find((j) => j.id === selectedJewelId) ?? null
                }
                siblingPathsFromPage={jewelPaths}
                isExpanded={isPathExpanded}
                onToggleExpand={handleToggleExpand}
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
  mode: "attack-path" | "exposure" | "attacker_v2" | "phase" | "exfil" | "topology"
  onChange: (next: "attack-path" | "exposure" | "attacker_v2" | "phase" | "exfil" | "topology") => void
  jewelName: string | null
  pathCount: number
  isExpanded: boolean
  onToggleExpand: () => void
  /** Gate for the beta "Attack Map" (typed DTO canvas) tab — enabled
      via ?beta=1 or when a deep link already points at it. Keeps
      engineering-internal surfaces out of the default operator UI. */
  showBeta?: boolean
}) {
  type TabKey = "attack-path" | "exposure" | "attacker_v2" | "phase" | "exfil" | "topology"
  // Capability-named tabs — no version stamps in the operator UI.
  // Engineering context (DTO provenance, phase docs) lives in the
  // title tooltips, not the labels.
  const tabs: { key: TabKey; label: string; title: string }[] = [
    {
      key: "attack-path",
      label: "Attack Path",
      title:
        "Per-path analysis — severity, evidence, breadcrumb, and closure wrapped around the attacker-view canvas. One chain, one source of truth.",
    },
    {
      key: "exposure",
      label: "Exposure",
      title: "Aggregate view — every workload, role, and policy that exposes this jewel.",
    },
    ...(showBeta
      ? [
          {
            key: "attacker_v2" as TabKey,
            label: "Attack Map (beta)",
            title:
              "Typed, edge-proven canvas — every node and edge comes from an explicit Neo4j relationship; the renderer does zero inference.",
          },
        ]
      : []),
    {
      key: "phase",
      label: "Phases",
      title:
        "Attacker-phase map (Entry → Reach → Land → Steal Creds → Become → Reach Data → Exfil + Persist + Defense). Reads materialized AttackPath nodes; every line is a real Neo4j edge.",
    },
    {
      key: "exfil",
      label: "Exfiltration",
      title:
        "Where does the data go from here? Every door the data can leave through — capable vs actively observed.",
    },
    {
      key: "topology",
      label: "Topology",
      title:
        "AWS reference-architecture containment — VPC > AZ > Subnet > workloads, with Security Groups as boundaries. Every node sourced from Neo4j.",
    },
  ]
  return (
    <div className="px-6 py-3 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-20 flex items-center gap-3">
      {/* Freshness pill — graph age from CollectorRun.finished_at.
          Lives in the shared tab bar so every view tab inherits an
          honest "Graph synced X min ago" signal. Replaces the
          implicit "live" framing the tab subtitles use. */}
      <FreshnessBanner variant="pill" />
      {/* ATLAS is an inline section at the bottom of the Attacker View
          canvas (atlas-inline-section.tsx). EXFIL inverts the BFS
          direction: jewel = SOURCE, external destinations = SINKS.
          Topology shows the customer's architecture, not the
          attacker's path. */}
      <div className="flex rounded-md border border-border overflow-hidden">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            title={tab.title}
            className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors border-r border-border last:border-r-0 ${
              mode === tab.key
                ? "bg-primary/10 text-primary"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* Quiet context — mode descriptions live in the tab tooltips. */}
      <div className="text-[10px] text-muted-foreground min-w-0 truncate flex-1">
        {jewelName ? `${jewelName} · ${pathCount} path${pathCount === 1 ? "" : "s"}` : null}
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
