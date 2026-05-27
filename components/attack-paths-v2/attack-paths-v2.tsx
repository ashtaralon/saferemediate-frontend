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

import { useEffect, useMemo } from "react"
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
import { PathAnalysisPanel } from "./path-analysis-panel"
import { JewelExposurePanel } from "./jewel-exposure-panel"
import { AttackerViewPanel } from "./attacker-view-panel"
import { AttackerViewV3 } from "./attacker-view-v3"
import { ExfilViewV3 } from "./exfil-view-v3"
import { AttackerCanvasV2 } from "./attacker-canvas-v2"

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
  const systemName = searchParams?.get("system") ?? "alon-prod"
  const selectedJewelId = searchParams?.get("jewel") ?? null
  const selectedPathId = searchParams?.get("path") ?? null
  const expandMode = searchParams?.get("expand") ?? null
  // Canvas-expand toggle: hides columns 1+2 so the right-column view
  // (any mode) gets the full screen. Was originally gated to per-path
  // mode only; now available across every view via the toggle in the
  // shared ModeToggle bar. URL param name kept ("expand=path") for
  // bookmark back-compat.
  const isPathExpanded = expandMode === "path"
  // Slice 5 + 9: three-lens toggle.
  //   path     — per-path forensic view (legacy default)
  //   exposure — all-doors aggregate per jewel
  //   attacker — live Neo4j graph view with lateral moves per hop
  const modeParam = searchParams?.get("mode") ?? "path"
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
  // entry points). See components/attack-paths-v2/exfil-view-panel.tsx.
  const viewMode: "path" | "exposure" | "attacker" | "attacker_v2" | "phase" | "exfil" =
    modeParam === "exposure"
      ? "exposure"
      : modeParam === "attacker"
        ? "attacker"
        : modeParam === "attacker_v2"
          ? "attacker_v2"
          : modeParam === "phase"
            ? "phase"
            : modeParam === "exfil"
              ? "exfil"
              : "path"

  // Same fetch pattern as the legacy page — reusing the proxy +
  // useCachedFetch SWR layer so v2 inherits the cold-backend handling
  // that took several iterations to get right.
  const fetchUrl = systemName
    ? `/api/proxy/identity-attack-paths/${encodeURIComponent(systemName)}?envelope=true&enriched=true`
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
  const setUrl = (next: { jewel?: string | null; path?: string | null; expand?: string | null; mode?: string | null }) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (next.jewel !== undefined) {
      if (next.jewel === null) params.delete("jewel")
      else params.set("jewel", next.jewel)
    }
    if (next.path !== undefined) {
      if (next.path === null) params.delete("path")
      else params.set("path", next.path)
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

  const handleSetMode = (next: "path" | "exposure" | "attacker" | "attacker_v2" | "phase" | "exfil") => {
    // Switching to exposure or phase clears the path selection — both
    // aggregate ACROSS paths (phase shows every chain targeting the
    // selected jewel). Switching to attacker / attacker_v2 REQUIRES a
    // selected path — preserve it. Switching back to path-view
    // preserves jewel + path selection.
    setUrl({
      mode: next,
      path: next === "exposure" || next === "phase" ? null : undefined,
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
    setUrl({ jewel: jewelId, path: null })
  }

  const handleSelectPath = (pathId: string) => {
    setUrl({ path: pathId })
  }

  // ─── Loading / error states ────────────────────────────────────
  if (isLoading && !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="flex items-center gap-3 text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading attack paths for {systemName}…</span>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 max-w-md">
          <div className="flex items-center gap-2 text-red-300 mb-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-semibold">Could not load attack paths</span>
          </div>
          <div className="text-xs text-red-200/80 mb-3">{String(error)}</div>
          <button
            onClick={retry}
            className="inline-flex items-center gap-2 rounded-md bg-red-500/20 border border-red-500/40 px-3 py-1.5 text-xs text-red-100 hover:bg-red-500/30"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      </div>
    )
  }

  // ─── Main 3-column layout ──────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Column 1 — Crown jewels (hidden when path is maximized) */}
      <aside
        className={`${isPathExpanded ? "hidden" : "w-[260px]"} shrink-0 border-r border-slate-800 bg-slate-950 overflow-y-auto`}
      >
        <div className="px-4 py-3 border-b border-slate-800/60">
          <div className="flex items-start gap-2">
            <BackToDashboard
              className="p-1.5 -ml-1.5 rounded-md hover:bg-slate-800 transition-colors shrink-0"
              iconClassName="w-4 h-4 text-slate-300"
            />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                CYNTRO · ATTACK PATHS V2
              </div>
              <div className="text-sm font-semibold text-white mt-0.5">{systemName}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
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
        className={`${isPathExpanded || viewMode === "exposure" ? "hidden" : "w-[400px]"} shrink-0 border-r border-slate-800 overflow-y-auto bg-slate-950/60`}
      >
        {!selectedJewelId ? (
          <EmptyState
            title="Select a crown jewel"
            subtitle="Pick an asset on the left to see every path that reaches it."
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
      <main className="flex-1 overflow-y-auto bg-slate-950">
        {!selectedJewelId ? (
          <EmptyState
            title="No jewel selected"
            subtitle="Select a crown jewel on the left to see attack paths or exposure analysis."
            large
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
            />
            {viewMode === "exposure" ? (
              <JewelExposurePanel
                jewel={jewels.find((j) => j.id === selectedJewelId)!}
                systemName={systemName}
              />
            ) : viewMode === "attacker" ? (
              !selectedPath ? (
                <EmptyState
                  title="Select a path for attacker view"
                  subtitle="Attacker view renders the live Neo4j graph + lateral moves per hop. Pick a path on the left."
                  large
                />
              ) : (
                <AttackerViewPanel
                  path={selectedPath}
                  jewel={jewels.find((j) => j.id === selectedJewelId) ?? null}
                  systemName={systemName}
                />
              )
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
                />
              )
            ) : !selectedPath ? (
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
              <PathAnalysisPanel
                path={selectedPath}
                jewel={jewels.find((j) => j.id === selectedJewelId) ?? null}
                systemName={systemName}
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
}: {
  mode: "path" | "exposure" | "attacker" | "attacker_v2" | "phase" | "exfil"
  onChange: (next: "path" | "exposure" | "attacker" | "attacker_v2" | "phase" | "exfil") => void
  jewelName: string | null
  pathCount: number
  isExpanded: boolean
  onToggleExpand: () => void
}) {
  return (
    <div className="px-6 py-3 border-b border-slate-800/60 bg-slate-950/95 backdrop-blur sticky top-0 z-20 flex items-center gap-3">
      {/* Freshness pill — graph age from CollectorRun.finished_at.
          Lives in the shared tab bar so every view tab inherits an
          honest "Graph synced X min ago" signal. Replaces the
          implicit "live" framing the tab subtitles use. */}
      <FreshnessBanner variant="pill" />
      <div className="flex rounded-md border border-slate-700 overflow-hidden">
        <button
          onClick={() => onChange("path")}
          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors border-r border-slate-700 ${
            mode === "path"
              ? "bg-blue-500/15 text-blue-200"
              : "bg-slate-900 text-slate-400 hover:text-slate-200"
          }`}
          title="Explain one attack route — the path's full chain of hops, IAM, network, and damage."
        >
          Per-path view
        </button>
        <button
          onClick={() => onChange("exposure")}
          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors border-r border-slate-700 ${
            mode === "exposure"
              ? "bg-violet-500/15 text-violet-200"
              : "bg-slate-900 text-slate-400 hover:text-slate-200"
          }`}
          title="All doors view — aggregate every workload, role, and policy that exposes this jewel."
        >
          Exposure view
        </button>
        <button
          onClick={() => onChange("attacker")}
          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors border-r border-slate-700 ${
            mode === "attacker"
              ? "bg-red-500/15 text-red-200"
              : "bg-slate-900 text-slate-400 hover:text-slate-200"
          }`}
          title="Attacker view (v1) — live Neo4j graph + lateral inference. Has known inference bugs being phased out as Attack Map v2 proves correct."
        >
          Attacker view
        </button>
        <button
          onClick={() => onChange("attacker_v2")}
          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors border-r border-slate-700 ${
            mode === "attacker_v2"
              ? "bg-cyan-500/15 text-cyan-200"
              : "bg-slate-900 text-slate-400 hover:text-slate-200"
          }`}
          title="Attack Map v2 — typed, edge-proven canvas. Every node and edge comes from an explicit Neo4j relationship; renderer does zero inference. Beta — compare side-by-side with v1."
        >
          Attack Map <span className="text-[8px] opacity-60">v2</span>
        </button>
        <button
          onClick={() => onChange("phase")}
          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors border-r border-slate-700 ${
            mode === "phase"
              ? "bg-emerald-500/15 text-emerald-200"
              : "bg-slate-900 text-slate-400 hover:text-slate-200"
          }`}
          title="Phase view (v0.3) — 9-lane attacker-phase map (Entry → Reach → Land → Steal Creds → Become → Reach Data → Exfil + Persist + Defense). Reads materialized AttackPath nodes; every line is a real Neo4j edge."
        >
          Phase view <span className="text-[8px] opacity-60">v0.3</span>
        </button>
        {/* ATLAS is now an inline section at the bottom of the
            Attacker View canvas (atlas-inline-section.tsx, wired in
            attacker-view-panel.tsx) — derives foothold + target from
            the selected path, no search UI needed. The standalone tab
            was removed 2026-05-27 per the "in front of us in a very
            clear way" feedback. */}
        {/* EXFIL — Phase A 2026-05-25 PRD. The other tabs answer
            'how does the attacker reach this jewel?'. This one
            answers 'where does the data go from here?'. BFS
            direction inverts: jewel becomes SOURCE on the left,
            external destinations become SINKS on the right. */}
        <button
          onClick={() => onChange("exfil")}
          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
            mode === "exfil"
              ? "bg-amber-500/15 text-amber-200"
              : "bg-slate-900 text-slate-400 hover:text-slate-200"
          }`}
          title="Exfil view (Phase A) — BFS-forwards from the crown jewel: every door the data can leave through, with capable (amber) vs observed (red) color-coding. Identity-egress + data-propagation lanes are honest not-wired empty states until Phase B/C collectors land."
        >
          Exfil <span className="text-[8px] opacity-60">Phase A</span>
        </button>
      </div>
      <div className="text-[10px] text-slate-500 italic min-w-0 truncate flex-1">
        {mode === "path"
          ? `Showing ${pathCount} attack path${pathCount === 1 ? "" : "s"} to ${jewelName ?? "this jewel"}`
          : mode === "exposure"
            ? `Showing every door to ${jewelName ?? "this jewel"} (workloads, roles, policies, controls)`
            : mode === "attacker"
              ? `Live Neo4j graph + lateral moves per hop — the attacker's pivot tree`
              : mode === "attacker_v2"
                ? `Typed AttackCanvas DTO — every node/edge backed by an explicit Neo4j relationship · beta`
                : mode === "phase"
                  ? `9-lane attacker-phase view — all chains to ${jewelName ?? "this jewel"}, ranked by severity`
                  : `Exfil view — every door the data can leave through, capable (amber) vs observed (red)`}
      </div>
      <button
        onClick={onToggleExpand}
        title={isExpanded ? "Collapse — restore jewels + paths columns" : "Expand canvas — hide jewels + paths columns"}
        aria-label={isExpanded ? "Collapse canvas" : "Expand canvas"}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1 hover:bg-slate-800/60 transition-colors"
      >
        {isExpanded ? (
          <>
            <Minimize2 className="h-3 w-3 text-slate-300" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-300">Collapse</span>
          </>
        ) : (
          <>
            <Maximize2 className="h-3 w-3 text-slate-300" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-300">Expand</span>
          </>
        )}
      </button>
    </div>
  )
}

// ─── Helper: empty / placeholder state ──────────────────────────
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
        <div className={`${large ? "text-lg" : "text-sm"} font-semibold text-slate-300`}>
          {title}
        </div>
        <div className={`mt-1.5 ${large ? "text-sm" : "text-xs"} text-slate-500`}>
          {subtitle}
        </div>
      </div>
    </div>
  )
}
