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
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { CrownJewelListPanel } from "@/components/identity-attack-paths/crown-jewel-list-panel"
import type {
  IdentityAttackPathsResponse,
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"
import { PathListGrouped } from "./path-list-grouped"
import { PathAnalysisPanel } from "./path-analysis-panel"

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
  const isPathExpanded = expandMode === "path" && !!selectedPathId

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
  const allPaths: IdentityAttackPath[] = data?.paths ?? []

  // Paths for the currently-selected jewel. Empty list = no jewel
  // selected or no paths to it.
  const jewelPaths = useMemo(() => {
    if (!selectedJewelId) return []
    return allPaths.filter((p) => p.crown_jewel_id === selectedJewelId)
  }, [selectedJewelId, allPaths])

  // The selected path object, if any. We tolerate selectedPathId
  // pointing at a path that doesn't exist (e.g. operator deep-linked
  // an old path id that's since been removed) — UI shows "path not
  // found" rather than crashing.
  const selectedPath = useMemo(() => {
    if (!selectedPathId) return null
    return jewelPaths.find((p) => p.id === selectedPathId) ?? null
  }, [selectedPathId, jewelPaths])

  // Selection helpers — write to URL so deep links work and the
  // browser back button restores state.
  const setUrl = (next: { jewel?: string | null; path?: string | null; expand?: string | null }) => {
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
    // Always preserve system param across navigations.
    if (!params.get("system") && systemName) params.set("system", systemName)
    router.replace(`${pathname}?${params.toString()}`)
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
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            CYNTRO · ATTACK PATHS V2
          </div>
          <div className="text-sm font-semibold text-white mt-0.5">{systemName}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {allPaths.length} paths · {jewels.length} crown jewels
          </div>
        </div>
        <CrownJewelListPanel
          jewels={jewels}
          selectedJewelId={selectedJewelId}
          onSelect={handleSelectJewel}
        />
      </aside>

      {/* Column 2 — Paths grouped by source type (hidden when maximized) */}
      <section
        className={`${isPathExpanded ? "hidden" : "w-[400px]"} shrink-0 border-r border-slate-800 overflow-y-auto bg-slate-950/60`}
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

      {/* Column 3 — Per-path analysis */}
      <main className="flex-1 overflow-y-auto bg-slate-950">
        {!selectedJewelId ? (
          <EmptyState
            title="No jewel selected"
            subtitle="Select a crown jewel and a specific path to see the full attack analysis."
            large
          />
        ) : !selectedPath ? (
          <EmptyState
            title="Select a path"
            subtitle={
              jewelPaths.length === 0
                ? "No attack paths to this jewel today. Nothing to fix here."
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
      </main>
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
