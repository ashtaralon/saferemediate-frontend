"use client"

/**
 * Crown Jewel Spotlight Strip — renders ABOVE the System Map TFM when an
 * operator clicks a CJ-tagged Resource node. Reads /api/proxy/attack-paths/
 * <system>/by-crown-jewel via the canonical lib hook — no fabrication, no
 * mock. Honest loading / error / empty / populated states per CLAUDE.md
 * rule #1.
 *
 * Behavior (per the 2026-06-22 PRD with Alon):
 *   - Aggregate state: shows path count + observed count + path dropdown.
 *   - Drill state (URL has ?path=…): the dropdown auto-selects that path
 *     and the strip renders its hop chain inline.
 *   - Ranking: damage_scope.priority_score DESC (the backend already
 *     sorts the response this way).
 *   - Hover/click on a path row: endpoints-only chip (origin → CJ ·
 *     hop_count · severity). Operator clicks to drill.
 *
 * State ownership lives in the parent (dependency-map-tab.tsx). This
 * component is pure: receives jewel + selectedPathId, calls hook,
 * renders, reports selection up. URL sync is the parent's job.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Crown, AlertTriangle, RefreshCw, ShieldCheck, ShieldOff, Server, Key, Database, Globe, Network, Cloud, Flame } from "lucide-react"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type { ConvergenceHop, ConvergencePath, CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
import { selectSpotlightPaths } from "@/lib/attack-paths/build-spotlight-active-node-ids"
import {
  SEVERITY_ACCENT,
  rankedInitialAccessForPath,
} from "@/lib/attack-paths/initial-access-labels"

interface CJSpotlightStripProps {
  jewel: CrownJewelSummary
  selectedPathId: string | null
  onSelectPath: (pathId: string | null) => void
  onReset: () => void
  // v1.2 (2026-06-22): parent owns the fetch via useCrownJewelConvergence
  // so the same data drives both the strip AND TFM's canvas dimming.
  // Strip is now pure presentational — receives the hook's outputs.
  data: CrownJewelConvergence | null
  loading: boolean
  error: string | null
  retry: () => void
}

export function CJSpotlightStrip({
  jewel,
  selectedPathId,
  onSelectPath,
  onReset,
  data,
  loading,
  error,
  retry,
}: CJSpotlightStripProps) {

  // Selected path object — derived from URL-driven selectedPathId.
  // Backend already sorts paths by priority_score DESC; default to first
  // path when nothing is URL-pinned so the strip always shows something
  // actionable on first load.
  const selectedPath = useMemo<ConvergencePath | null>(() => {
    if (!data?.paths || data.paths.length === 0) return null
    if (selectedPathId) {
      const match = data.paths.find((p) => p.path_id === selectedPathId)
      if (match) return match
      // Stale URL — fall through to default (first real workload path).
    }
    const unionPaths = selectSpotlightPaths(data.paths, null)
    return unionPaths[0] ?? data.paths[0]
  }, [data?.paths, selectedPathId])

  // ── Loading state ────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <StripFrame onReset={onReset} cjName={jewel.name}>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          Computing attack paths to {jewel.name}…
        </div>
      </StripFrame>
    )
  }

  // ── Error state ──────────────────────────────────────────────────
  if (error && !data) {
    return (
      <StripFrame onReset={onReset} cjName={jewel.name}>
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-rose-200">Spotlight failed</div>
            <div className="text-[11px] text-rose-300/80 truncate" title={error}>
              {error}
            </div>
          </div>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-100 hover:bg-rose-500/20"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      </StripFrame>
    )
  }

  // ── Empty state — backend confirms no attack paths ───────────────
  if (data && (data.paths_total === 0 || data.paths.length === 0)) {
    return (
      <StripFrame onReset={onReset} cjName={jewel.name}>
        <div className="flex items-center gap-2 text-xs text-emerald-300">
          <ShieldCheck className="w-3.5 h-3.5" />
          No attack paths reach this jewel — surface is clean.
        </div>
      </StripFrame>
    )
  }

  // ── Populated state ──────────────────────────────────────────────
  if (!data || !selectedPath) return null

  const isUnionMode = !selectedPathId
  const totalPaths = data.paths.length
  const focusedIndex = isUnionMode
    ? 0
    : Math.max(0, data.paths.findIndex((p) => p.path_id === selectedPathId))

  return (
    <StripFrame onReset={onReset} cjName={jewel.name}>
      {/* Header row — counts only. The path picker was a hidden dropdown
          before; promoted to an always-visible inline list below so the
          operator sees every path's entry point (EC2 / Lambda / etc.)
          at a glance without clicking. */}
      <div className="flex items-center gap-3 flex-wrap">
        <SpotlightSummary
          pathsTotal={data.paths_total}
          observedPaths={data.observed_paths}
          chokeCount={Object.keys(data.choke_points || {}).length}
        />
        <PathScopeHint
          isUnionMode={isUnionMode}
          totalPaths={totalPaths}
          focusedIndex={focusedIndex}
        />
      </div>

      {/* Inline path list (always visible). Click a row → strip switches
          to that path AND the TFM canvas filters to only that path's
          nodes. With no path pinned (union mode), the canvas shows every
          workload reaching the jewel; the kill chain below stays on path 1
          until the operator picks a row — see PathScopeHint. */}
      <PathList
        paths={data.paths}
        selectedPathId={selectedPath.path_id}
        onSelect={onSelectPath}
      />

      {/* v1.1 hop chain — inline kill-chain visualization. Operator sees
          the full hop path (entry → workload → identity → CJ) directly
          in the strip without leaving Spotlight. Reads selectedPath.hops
          straight from the backend response — no derivation, no mock. */}
      {selectedPath.hops.length > 0 && <HopChain hops={selectedPath.hops} />}

      {/* v1.3 choke points — surface the leverage candidates: nodes that
          appear on ≥ 2 paths to the CJ. Closing a high-count chokepoint
          eliminates that many paths simultaneously. Reads
          data.choke_points (Record<node_id, path_count>) from the
          backend response. Skips the CJ itself (it's on every path by
          definition, not a leverage candidate). Uses hop[].name across
          all paths as the display-name lookup. */}
      <ChokePoints
        chokePoints={data.choke_points}
        cjId={jewel.id}
        cjCanonicalId={jewel.canonical_id ?? null}
        paths={data.paths}
      />
    </StripFrame>
  )
}

// ─── Sub-components ──────────────────────────────────────────────

function StripFrame({
  cjName,
  onReset,
  children,
}: {
  cjName: string
  onReset: () => void
  children: React.ReactNode
}) {
  return (
    <div className="dark w-full rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 mb-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
            Crown Jewel Spotlight
          </span>
          <span className="text-[11px] text-slate-300 font-mono truncate" title={cjName}>
            {cjName}
          </span>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 rounded-md border border-slate-600/60 bg-slate-800/40 hover:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-200"
          title="Exit Spotlight (clear URL params)"
        >
          Reset
        </button>
      </div>
      {children}
    </div>
  )
}

function PathScopeHint({
  isUnionMode,
  totalPaths,
  focusedIndex,
}: {
  isUnionMode: boolean
  totalPaths: number
  focusedIndex: number
}) {
  if (totalPaths <= 1) return null
  return (
    <span className="text-[10px] text-slate-400">
      {isUnionMode
        ? `${totalPaths} paths to this jewel · showing path 1 of ${totalPaths}`
        : `path ${focusedIndex + 1} of ${totalPaths}`}
    </span>
  )
}

function SpotlightSummary({
  pathsTotal,
  observedPaths,
  chokeCount,
}: {
  pathsTotal: number
  observedPaths: number
  chokeCount: number
}) {
  return (
    <div className="flex items-center gap-3 text-[11px] text-slate-300">
      <div>
        <span className="font-semibold text-amber-200">{pathsTotal}</span>{" "}
        <span className="text-slate-400">attack {pathsTotal === 1 ? "path" : "paths"}</span>
      </div>
      <span className="text-slate-600">·</span>
      <div>
        <span className="font-semibold text-rose-300">{observedPaths}</span>{" "}
        <span className="text-slate-400">observed</span>
      </div>
      {chokeCount > 0 && (
        <>
          <span className="text-slate-600">·</span>
          <div>
            <span className="font-semibold text-blue-300">{chokeCount}</span>{" "}
            <span className="text-slate-400">choke {chokeCount === 1 ? "point" : "points"}</span>
          </div>
        </>
      )}
    </div>
  )
}

function PathList({
  paths,
  selectedPathId,
  onSelect,
}: {
  paths: ConvergencePath[]
  selectedPathId: string
  onSelect: (id: string | null) => void
}) {
  // Always-visible inline list of every attack path to the CJ. Each row
  // shows the entry point (the EC2 / Lambda / etc. the attacker would
  // start from), the hop count, severity, observed-vs-capable, and the
  // Initial Access chips. Click a row → parent updates `spotlightPathId`
  // → kill-chain below switches AND the TFM canvas filters to that
  // path's nodes only.
  //
  // For long lists the container scrolls — never collapse paths into
  // a hidden dropdown again; that was the original UX hole operators
  // hit (couldn't see "this CJ has 6 paths from 4 different EC2s" at
  // a glance because the dropdown swallowed it).
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          {paths.length} attack path{paths.length === 1 ? "" : "s"} · click to view
        </span>
        <span className="text-[9px] uppercase tracking-wider text-slate-500">
          sorted worst-first
        </span>
      </div>
      <div className="max-h-[200px] overflow-y-auto py-0.5">
        {paths.map((p, idx) => (
          <PathRow
            key={p.path_id}
            path={p}
            idx={idx}
            isSelected={p.path_id === selectedPathId}
            onClick={() => onSelect(p.path_id)}
          />
        ))}
      </div>
    </div>
  )
}

// Kept for any legacy callers; new layout uses the inline `PathList`
// above. Safe to delete once nothing imports it.
function PathDropdown({
  paths,
  selectedPathId,
  onSelect,
}: {
  paths: ConvergencePath[]
  selectedPathId: string
  onSelect: (id: string | null) => void
}) {
  // v1.4 (2026-06-22): replaced the native <select> with a custom rich
  // dropdown so each row can render Initial-Access category chips inline.
  // Native <option> can't render arbitrary JSX. Backend already orders
  // paths by priority_score DESC; we preserve that order rather than
  // re-sorting on the FE.
  const selectedIdx = paths.findIndex((p) => p.path_id === selectedPathId)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current || !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-600/60 bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-100"
        title="Switch path"
      >
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Path {selectedIdx + 1}/{paths.length}
        </span>
        <span className="truncate max-w-[180px]">
          {paths[selectedIdx] ? summarizePath(paths[selectedIdx]) : "—"}
        </span>
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-[520px] max-w-[calc(100vw-32px)] rounded-lg border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60 ring-1 ring-black/40">
          <div className="px-3 py-2 border-b border-slate-800 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            {paths.length} path{paths.length === 1 ? "" : "s"} — sorted worst-first by priority_score
          </div>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {paths.map((p, idx) => (
              <PathRow
                key={p.path_id}
                path={p}
                idx={idx}
                isSelected={p.path_id === selectedPathId}
                onClick={() => {
                  onSelect(p.path_id)
                  setOpen(false)
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PathRow({
  path,
  idx,
  isSelected,
  onClick,
}: {
  path: ConvergencePath
  idx: number
  isSelected: boolean
  onClick: () => void
}) {
  const origin = path.source ?? path.hops[0]?.name ?? path.hops[0]?.node_id ?? "?"
  const severity = (path.severity ?? "").toUpperCase()
  const sevAccent = severityAccent(severity)
  const observed = path.confidence === "observed"
  const categories = rankedInitialAccessForPath(path)
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 flex flex-col gap-1 transition-colors ${
        isSelected ? "bg-slate-800/80" : "hover:bg-slate-800/50"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-slate-500 w-5 shrink-0">{idx + 1}.</span>
        <span className="text-[10px] font-mono text-slate-200 truncate min-w-0 flex-1" title={origin}>
          {truncate(origin, 36)}
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">
          {path.hop_count}h
        </span>
        {severity && (
          <span
            className="inline-flex items-center rounded-full border px-1.5 py-px text-[8px] font-bold uppercase tracking-wider shrink-0"
            style={{
              backgroundColor: `${sevAccent}20`,
              color: sevAccent,
              borderColor: `${sevAccent}40`,
            }}
          >
            {severity}
          </span>
        )}
        <span
          className={`inline-flex items-center rounded-full border px-1.5 py-px text-[8px] font-bold uppercase tracking-wider shrink-0 ${
            observed
              ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
              : "border-amber-400/40 bg-amber-500/10 text-amber-200"
          }`}
        >
          {observed ? "Observed" : "Capable"}
        </span>
      </div>
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pl-7">
          <InitialAccessChips categories={categories} compact />
        </div>
      )}
    </button>
  )
}

function InitialAccessChips({
  categories,
  compact = false,
}: {
  categories: Array<{
    category: string
    label: { label: string; severity: keyof typeof SEVERITY_ACCENT; description: string }
  }>
  compact?: boolean
}) {
  if (categories.length === 0) return null
  return (
    <>
      {categories.map(({ category, label }) => {
        const accent = SEVERITY_ACCENT[label.severity]
        return (
          <span
            key={category}
            className={`inline-flex items-center gap-1 rounded border ${
              compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
            } font-medium`}
            style={{
              backgroundColor: `${accent}15`,
              color: accent,
              borderColor: `${accent}40`,
            }}
            title={`${category}\n${label.description}`}
          >
            {label.label}
          </span>
        )
      })}
    </>
  )
}

function SelectedPathSummary({ path, cjName }: { path: ConvergencePath; cjName: string }) {
  const originName = path.source ?? path.hops[0]?.name ?? path.hops[0]?.node_id ?? "unknown origin"
  const severity = (path.severity ?? "").toUpperCase()
  const sevAccent = severityAccent(severity)
  const observed = path.confidence === "observed"
  // v1.4: pull engine-classified initial-access categories for this path.
  // 1:1 verbatim from path.initial_access[].category — no derivation.
  const categories = rankedInitialAccessForPath(path)
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 space-y-1.5 text-[11px]">
      <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="font-mono text-slate-200 truncate" title={originName}>
          {originName}
        </span>
        <span className="text-slate-500">→</span>
        <span className="font-mono text-amber-200 truncate" title={cjName}>
          {cjName}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-slate-400">
          {path.hop_count} {path.hop_count === 1 ? "hop" : "hops"}
        </span>
        {severity && (
          <span
            className="inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-wider"
            style={{
              backgroundColor: `${sevAccent}20`,
              color: sevAccent,
              borderColor: `${sevAccent}40`,
            }}
          >
            {severity}
          </span>
        )}
        {observed ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-rose-200"
            title="At least one hop has runtime evidence (CloudTrail / Flow Logs)"
          >
            Observed
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-amber-200"
            title="Capable per graph; no observed runtime traffic on this chain"
          >
            <ShieldOff className="w-2.5 h-2.5" />
            Capable
          </span>
        )}
      </div>
      </div>
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mr-1">
            Initial access
          </span>
          <InitialAccessChips categories={categories} />
        </div>
      )}
    </div>
  )
}

// ─── HopChain — v1.1 inline kill-chain ──────────────────────────

function HopChain({ hops }: { hops: ConvergenceHop[] }) {
  return (
    <div className="rounded-lg border border-slate-700/40 bg-slate-900/30 px-3 py-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
        Kill chain · {hops.length} {hops.length === 1 ? "hop" : "hops"}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {hops.map((hop, idx) => (
          <HopChainItem key={`${hop.node_id}-${idx}`} hop={hop} isLast={idx === hops.length - 1} />
        ))}
      </div>
    </div>
  )
}

function HopChainItem({ hop, isLast }: { hop: ConvergenceHop; isLast: boolean }) {
  const Icon = iconForHop(hop)
  const accent = planeAccent(hop.plane)
  const label = hop.name ?? hop.node_id
  const edgeLabel = hop.edge_type_from_prev?.replace(/^~/, "")
  return (
    <>
      <div
        className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px]"
        style={{
          backgroundColor: `${accent}15`,
          borderColor: `${accent}40`,
          color: accent,
        }}
        title={`${hop.node_type} · ${hop.plane} plane${hop.subnet_id ? ` · subnet ${hop.subnet_id}` : ""}${
          hop.subnet_public === true ? " (public)" : hop.subnet_public === false ? " (private)" : ""
        }${hop.is_crown_jewel ? " · CROWN JEWEL" : ""}`}
      >
        {hop.is_crown_jewel ? (
          <Crown className="w-3 h-3 text-amber-400 shrink-0" />
        ) : (
          <Icon className="w-3 h-3 shrink-0" />
        )}
        <span className="font-mono text-slate-200 truncate max-w-[140px]">{truncate(label, 22)}</span>
      </div>
      {!isLast && (
        <div className="inline-flex items-center gap-0.5 text-slate-600">
          {edgeLabel ? (
            <span
              className="text-[8px] font-mono text-slate-500 px-1"
              title={`Edge: ${hop.edge_type_from_prev}${hop.edge_type_from_prev?.startsWith("~") ? " (reversed in graph)" : ""}`}
            >
              {edgeLabel}
            </span>
          ) : null}
          <ChevronRight className="w-3 h-3 shrink-0" />
        </div>
      )}
    </>
  )
}

// ─── ChokePoints (v1.3) — leverage-candidate surface ────────────

function ChokePoints({
  chokePoints,
  cjId,
  cjCanonicalId,
  paths,
}: {
  chokePoints: Record<string, number> | undefined
  cjId: string
  cjCanonicalId: string | null
  paths: ConvergencePath[]
}) {
  // Build hop_id → display name from the live paths data — no extra
  // fetch, no derivation. When a chokepoint id has no matching hop
  // name (rare — only happens if backend trims hops), fall back to
  // the id itself (honest).
  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of paths) {
      for (const h of p.hops) {
        if (h.node_id && h.name && !m.has(h.node_id)) {
          m.set(h.node_id, h.name)
        }
      }
    }
    return m
  }, [paths])

  // Sort chokepoints by path-count DESC; drop count < 2 (single-path
  // entries aren't leverage); drop the CJ itself (on every path by
  // definition — not a candidate). Top 4 surface inline; rest get a
  // "+N more" pill.
  const ranked = useMemo(() => {
    if (!chokePoints) return []
    return Object.entries(chokePoints)
      .filter(([id, count]) => count >= 2 && id !== cjId && id !== cjCanonicalId)
      .sort((a, b) => b[1] - a[1])
  }, [chokePoints, cjId, cjCanonicalId])

  if (ranked.length === 0) return null

  const top = ranked.slice(0, 4)
  const rest = ranked.length - top.length

  return (
    <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-orange-300 mb-1.5">
        <Flame className="w-3 h-3" />
        Choke points · {ranked.length}
        <span className="text-slate-500 font-normal normal-case tracking-normal">
          · close these to kill multiple paths at once
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {top.map(([id, count]) => {
          const name = nameById.get(id) ?? id
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1.5 rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-[10px] font-medium text-orange-100"
              title={`${name}\n${id}\nOn ${count} paths to this CJ`}
            >
              <span className="font-mono truncate max-w-[180px]">{truncate(name, 28)}</span>
              <span className="inline-flex items-center justify-center rounded-full bg-orange-400/30 text-orange-50 text-[9px] font-bold min-w-[18px] h-[14px] px-1">
                {count}
              </span>
            </span>
          )
        })}
        {rest > 0 && (
          <span className="text-[10px] text-slate-400">
            +{rest} more
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Pure helpers ────────────────────────────────────────────────

function iconForHop(hop: ConvergenceHop) {
  const t = (hop.node_type || "").toLowerCase()
  // CJ data-plane targets
  if (/(s3bucket|s3|bucket|dynamo|rds|secret|kms)/.test(t)) return Database
  // Identity plane
  if (/(role|user|policy|principal|identity|profile)/.test(t)) return Key
  // Network plane
  if (/(igw|nat|gateway|vpce|endpoint|subnet|nacl|networkinterface)/.test(t)) return Network
  // Internet / external entry
  if (/(internet|externalip|external)/.test(t)) return Globe
  // Compute
  if (/(ec2|lambda|ecs|workload|container)/.test(t)) return Server
  // Cloud/service fallback
  return Cloud
}

function planeAccent(plane: string | undefined): string {
  switch ((plane || "").toLowerCase()) {
    case "network":
      return "#22d3ee" // cyan
    case "identity":
      return "#ec4899" // pink — matches IAM lane
    case "data":
      return "#a78bfa" // violet — matches resource lane
    case "compute":
      return "#3b82f6" // blue
    default:
      return "#94a3b8" // slate
  }
}



function summarizePath(p: ConvergencePath): string {
  const origin = p.source ?? p.hops[0]?.name ?? p.hops[0]?.node_id ?? "?"
  const ident = p.identity_name ?? p.identity ?? null
  const sev = (p.severity ?? "").toUpperCase()
  const hops = p.hop_count
  const parts = [
    truncate(origin, 28),
    ident ? `via ${truncate(ident, 22)}` : null,
    `${hops}h`,
    sev || null,
  ].filter(Boolean)
  return parts.join(" · ")
}

function severityAccent(sev: string): string {
  // Match the SEVERITY_CONFIG palette used elsewhere in the app
  switch (sev) {
    case "CRITICAL":
      return "#ef4444"
    case "HIGH":
      return "#f97316"
    case "MEDIUM":
      return "#eab308"
    case "LOW":
      return "#3b82f6"
    default:
      return "#94a3b8"
  }
}

function truncate(s: string, n: number): string {
  if (!s) return ""
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`
}
