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

import { useMemo } from "react"
import { ChevronDown, Crown, AlertTriangle, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"
import { useCrownJewelConvergence } from "@/lib/attack-paths/use-crown-jewel-convergence"

interface CJSpotlightStripProps {
  systemName: string
  jewel: CrownJewelSummary
  selectedPathId: string | null
  onSelectPath: (pathId: string | null) => void
  onReset: () => void
}

export function CJSpotlightStrip({
  systemName,
  jewel,
  selectedPathId,
  onSelectPath,
  onReset,
}: CJSpotlightStripProps) {
  const { data, loading, error, retry } = useCrownJewelConvergence(systemName, jewel)

  // Selected path object — derived from URL-driven selectedPathId.
  // Backend already sorts paths by priority_score DESC; default to first
  // path when nothing is URL-pinned so the strip always shows something
  // actionable on first load.
  const selectedPath = useMemo<ConvergencePath | null>(() => {
    if (!data?.paths || data.paths.length === 0) return null
    if (selectedPathId) {
      const match = data.paths.find((p) => p.path_id === selectedPathId)
      if (match) return match
      // Stale URL — fall through to default (first path).
    }
    return data.paths[0]
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

  return (
    <StripFrame onReset={onReset} cjName={jewel.name}>
      {/* Header row — counts + path dropdown */}
      <div className="flex items-center gap-3 flex-wrap">
        <SpotlightSummary
          pathsTotal={data.paths_total}
          observedPaths={data.observed_paths}
          chokeCount={Object.keys(data.choke_points || {}).length}
        />
        <PathDropdown
          paths={data.paths}
          selectedPathId={selectedPath.path_id}
          onSelect={onSelectPath}
        />
      </div>

      {/* Selected path summary — endpoints-only per FR4 */}
      <SelectedPathSummary path={selectedPath} cjName={jewel.name} />
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

function PathDropdown({
  paths,
  selectedPathId,
  onSelect,
}: {
  paths: ConvergencePath[]
  selectedPathId: string
  onSelect: (id: string | null) => void
}) {
  const selectedIdx = paths.findIndex((p) => p.path_id === selectedPathId)
  return (
    <label className="relative inline-flex items-center gap-1.5 rounded-full border border-slate-600/60 bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-100 cursor-pointer">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
        Path {selectedIdx + 1}/{paths.length}
      </span>
      <select
        value={selectedPathId}
        onChange={(e) => onSelect(e.target.value)}
        className="appearance-none bg-transparent text-[11px] text-slate-100 outline-none cursor-pointer pr-4"
      >
        {paths.map((p, idx) => (
          <option
            key={p.path_id}
            value={p.path_id}
            className="bg-slate-900 text-slate-100"
          >
            {idx + 1}. {summarizePath(p)}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
    </label>
  )
}

function SelectedPathSummary({ path, cjName }: { path: ConvergencePath; cjName: string }) {
  const originName = path.source ?? path.hops[0]?.name ?? path.hops[0]?.node_id ?? "unknown origin"
  const severity = (path.severity ?? "").toUpperCase()
  const sevAccent = severityAccent(severity)
  const observed = path.confidence === "observed"
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 flex items-center gap-3 text-[11px]">
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
  )
}

// ─── Pure helpers ────────────────────────────────────────────────

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
