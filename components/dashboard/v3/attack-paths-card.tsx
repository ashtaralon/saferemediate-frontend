"use client"

// WAIVER_active_filter: card consumes only the aggregate `total_paths`
// counter, never iterates the `.paths[]` array. A stale workload
// changing the count by ±1 is not the bug class lib/active-filters.ts
// is gating against.

import { Crown, Globe } from "lucide-react"
import { useRouter } from "next/navigation"
import { ErrorCard, LoadingCard, Section, StaleIndicator } from "./card-shell"
import { descriptorClass, labelClass } from "./styles"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import {
  buildTfmSpotlightUrl,
  navigateCrownJewelClick,
} from "@/lib/attack-paths/crown-jewel-v2-navigation"
import { derivePathsIntegrity, isCacheablePaths } from "@/lib/paths-integrity"

/**
 * Top Attack Paths to Crown Jewels.
 *
 * Real source: /api/proxy/identity-attack-paths/all
 *   → fans out across systems → merges crown_jewels[] → sorts by
 *   priority_score desc.
 *
 * Honest: no synthesis. The 6-factor SeverityBreakdown sub-scores
 * exist on individual paths in the detail-page response but the
 * crown-jewel list endpoint only carries summary fields
 * (priority_score, highest_risk_score, severity, path_count,
 * is_internet_exposed). We render those — the per-factor sub-bars
 * shown in the reference mockup are NOT in the org-wide rollup,
 * so we don't pretend.
 */

type CrownJewel = {
  id: string
  name: string
  type: string
  severity: string
  path_count?: number
  highest_risk_score?: number
  is_internet_exposed?: boolean
  data_classification?: string | null
  priority_score?: number
  system_name?: string
}

type PathsResponse = {
  crown_jewels?: CrownJewel[]
  /** Null whenever the fan-out did not complete — never coerce. */
  total_jewels?: number | null
  total_paths?: number | null
  exposed_jewels?: number | null
  serve_state?: string
  analysis_complete?: boolean
  not_ready_reason?: string | null
  crown_jewels_partial?: boolean
  systems_discovered?: number | null
  systems_scanned?: number | null
  systems_uncomputed?: number | null
  uncomputed?: string[]
  errors?: string[]
  error?: string
}

const SEVERITY_PILL: Record<string, string> = {
  CRITICAL: "bg-rose-100 text-rose-700",
  HIGH: "bg-amber-100 text-amber-700",
  MEDIUM: "bg-blue-50 text-blue-700",
  LOW: "bg-slate-100 text-slate-600",
}

const TYPE_TINT: Record<string, string> = {
  S3Bucket: "bg-teal-50 text-teal-700",
  KMSKey: "bg-purple-50 text-purple-700",
  RDSInstance: "bg-blue-50 text-blue-700",
  DynamoDBTable: "bg-indigo-50 text-indigo-700",
  IAMRole: "bg-violet-50 text-violet-700",
}

function priorityToneClass(score: number): string {
  // Higher priority_score = more dangerous → use rose/amber/slate.
  if (score >= 60) return "rounded-md bg-rose-50 px-2 py-0.5 text-rose-700"
  if (score >= 30) return "rounded-md bg-amber-50 px-2 py-0.5 text-amber-700"
  if (score > 0) return "rounded-md bg-slate-100 px-2 py-0.5 text-slate-700"
  return "rounded-md bg-slate-100 px-2 py-0.5 text-slate-400"
}

interface AttackPathsCardProps {
  onNavigateToSection?: (id: string) => void
  /** Executive view shows the single highest-impact path, not a list. */
  limit?: number
}

export function AttackPathsCard({ onNavigateToSection, limit = 8 }: AttackPathsCardProps = {}) {
  const router = useRouter()

  // Primary: Attack Map v2 spine (?map=cyntro). Orphan-only jewels fall back
  // to TFM union spotlight on the Topology tab.
  const handleJewelClick = async (jewel: CrownJewel) => {
    if (!jewel.system_name) return
    const dest = await navigateCrownJewelClick(router, jewel.system_name, {
      id: jewel.id,
      arn: jewel.id.startsWith("arn:") ? jewel.id : null,
      name: jewel.name,
      type: jewel.type,
    })
    if (dest === "tfm-fallback") {
      router.push(buildTfmSpotlightUrl(jewel.system_name, jewel.id))
    }
  }

  // Action-driving data — strict 10-min staleness. Anything older falls
  // back to the loading skeleton instead of showing stale "top attack
  // path" data, because acting on a 12h-old top path could mean
  // remediating something that was already fixed.
  const { data, loading, error, retry, isStale, cachedAt } = useCachedFetch<PathsResponse>(
    "/api/proxy/identity-attack-paths/all",
    {
      cacheKey: "identity-attack-paths-all",
      // 1h "fresh" window. Beyond that, refresh runs in background.
      // If the refresh fails, the hook's last-resort fallback shows
      // older-but-still-readable cache (up to 7d) rather than a 504.
      maxStaleMs: 60 * 60 * 1000,
      fetchInit: { cache: "no-store" },
      // A non-READY payload never enters localStorage — and is evicted on
      // read if an older build put one there. Without this, a cold-start
      // zero survives the outage that produced it for up to 7 days.
      isCacheable: isCacheablePaths,
      failClosedOnError: true,
    }
  )

  if (loading && !data) return <LoadingCard label="Top damage paths" />
  if (error && !data) return <ErrorCard label="Top damage paths" error={error} onRetry={retry} />
  if (!data) return null

  const integrity = derivePathsIntegrity(data)
  const jewels = (data.crown_jewels ?? []).slice(0, limit)
  // `?? 0` here rendered "0 jewels · 0 paths · 0 internet-exposed" while the
  // backend was returning 502s — a clean bill of health composed entirely of
  // nulls, on the card that answers "can anyone reach our crown jewels".
  // A count is only a count when it is a finite number.
  const n = (v: unknown) => (Number.isFinite(v as number) ? String(v as number) : "—")
  const summary = (
    <span className="text-xs text-slate-500">
      <span className="font-semibold text-slate-700">{n(data.total_jewels)}</span> jewels ·{" "}
      <span className="font-semibold text-slate-700">{n(data.total_paths)}</span> paths ·{" "}
      <span className="font-semibold text-rose-700">{n(data.exposed_jewels)}</span> internet-exposed
    </span>
  )

  if (jewels.length === 0) {
    // THREE outcomes, not two. The old branch had only "errors" vs
    // "clean" — so an estate the backend never finished scanning landed
    // in "clean" and rendered "8 systems scanned. None surfaced
    // reachable jewels." while 30 jewels and 236 paths existed.
    //
    // An empty list is only an all-clear when the producer says READY
    // *and* analysis_complete. Anything else is "not computed yet".
    const errs = integrity.errors
    const hasErrors = errs.length > 0
    const notComputed = !integrity.canRenderNoneFound
    const scanned = integrity.systemsScanned
    const discovered = integrity.systemsDiscovered
    const coverage =
      scanned === null || discovered === null
        ? "coverage unknown"
        : `${scanned} of ${discovered} systems scanned`
    return (
      <Section
        label="Top damage paths"
        descriptor={
          hasErrors
            ? "Per-system fan-out failed — see details below"
            : notComputed
              ? "Not computed yet — this is not an all-clear"
              : "No crown jewels currently have inbound attack paths"
        }
        className={`border-l-[3px] ${
          hasErrors || notComputed ? "border-l-amber-500" : "border-l-rose-500"
        }`}
        icon={<Crown className="h-3.5 w-3.5 text-amber-500" strokeWidth={2.5} />}
        right={
          <span className="flex items-center gap-2">
            <StaleIndicator cachedAt={cachedAt} isStale={isStale} />
            {summary}
          </span>
        }
      >
        {hasErrors || notComputed ? (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs">
            <div className="font-semibold text-amber-800">
              {coverage}
              {integrity.systemsUncomputed ? ` · ${integrity.systemsUncomputed} not computed` : ""}
              {hasErrors ? ` · ${errs.length} fan-out error(s)` : ""}
            </div>
            <p className="mt-1 text-amber-700">
              Reachability was not established for every system, so an empty list
              here does not mean nothing is reachable. Reload once the analysis
              completes.
            </p>
            <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-amber-700">
              {[...errs, ...integrity.uncomputed].slice(0, 4).map((e, i) => (
                <li key={i} className="truncate">
                  · {e}
                </li>
              ))}
              {errs.length + integrity.uncomputed.length > 4 && (
                <li className="text-amber-600">
                  + {errs.length + integrity.uncomputed.length - 4} more
                </li>
              )}
            </ul>
          </div>
        ) : (
          <div className={descriptorClass}>
            {coverage}. None surfaced reachable jewels.
          </div>
        )}
      </Section>
    )
  }

  return (
    <Section
      label="Top damage paths"
      descriptor={
        integrity.listIsPartial
          ? `Ranked by priority_score · partial scan (${
              integrity.systemsScanned ?? "?"
            } of ${integrity.systemsDiscovered ?? "?"} systems) — more may exist`
          : "Crown jewels ranked by priority_score across all inbound paths · click to open the path graph"
      }
      className="border-l-[3px] border-l-rose-500"
      icon={<Crown className="h-3.5 w-3.5 text-amber-500" strokeWidth={2.5} />}
      right={
        <span className="flex items-center gap-2">
          <StaleIndicator cachedAt={cachedAt} isStale={isStale} />
          {summary}
        </span>
      }
    >
      <ul className="space-y-2">
        {jewels.map((j) => {
          const sevClass = SEVERITY_PILL[j.severity] ?? "bg-slate-100 text-slate-600"
          const typeClass = TYPE_TINT[j.type] ?? "bg-slate-100 text-slate-600"
          const priority = j.priority_score ?? j.highest_risk_score ?? 0
          const drillable = Boolean(j.system_name)
          return (
            <li key={j.id}>
              <button
                type="button"
                onClick={() => handleJewelClick(j)}
                disabled={!drillable}
                title={
                  drillable
                    ? `Open ${j.name || j.id} in System Map with attack paths`
                    : "No system scope — can't drill from this row"
                }
                className={`flex w-full items-center gap-3 rounded-md border border-slate-100 bg-slate-50/40 px-3 py-2 text-left text-sm transition-colors ${
                  drillable
                    ? "hover:bg-slate-50 hover:border-slate-200 cursor-pointer"
                    : "cursor-not-allowed opacity-70"
                }`}
              >
                <span
                  className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${typeClass}`}
                >
                  {j.type}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate font-medium text-slate-900">
                    <span className="truncate">{j.name || j.id}</span>
                    {j.is_internet_exposed && (
                      <Globe
                        className="h-3.5 w-3.5 shrink-0 text-rose-600"
                        strokeWidth={2.5}
                      />
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {j.system_name ?? "—"} · {j.path_count ?? 0} path
                    {j.path_count === 1 ? "" : "s"}
                    {j.data_classification ? ` · ${j.data_classification}` : ""}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${sevClass}`}
                >
                  {j.severity}
                </span>
                <span
                  className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${priorityToneClass(priority)}`}
                >
                  {priority.toFixed(0)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
        <span>Globe icon = internet-exposed crown jewel</span>
        <button
          type="button"
          onClick={() => onNavigateToSection?.("attack-paths")}
          className="font-medium text-slate-700 hover:text-slate-900"
        >
          View all paths →
        </button>
      </div>
    </Section>
  )
}
