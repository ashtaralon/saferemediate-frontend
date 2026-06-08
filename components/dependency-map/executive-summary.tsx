"use client"

// Executive Summary — the "every-idiot-can-understand-it" dashboard.
//
// Replaces the technical Trust Boundary view as the default. Reads the
// same PostureResponse data but reframes everything in plain English:
//
//   "ISOLATED"         → "Locked down — cannot reach the internet"
//   "LATENT_EXPOSURE"  → "Open doors nobody uses"
//   "AWS_REDIRECTABLE" → "Wasted spend (paying for internet to reach AWS)"
//   "ACTIVE_INTERNET"  → "Talking to the public internet right now"
//   "Crown Jewel"      → "Sensitive data store"
//   "1-hop exfil chain"→ "Can leak data in one step"
//   "exfil surface"    → "Servers that can leak data"
//
// Three problem cards (or fewer if the system is clean) with a single
// sentence each. ONE primary CTA: the safest available fix. No bucket
// labels, no acronyms, no security-team vocabulary. Technical view
// stays accessible behind a "Show technical details" toggle for power
// users who want the original layout.
//
// Per feedback_no_mock_numbers_in_ui — every count is derived from real
// data; nothing is hard-coded. Empty state shows "Everything looks
// locked down" rather than fabricating problems.

import React, { useMemo } from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  DollarSign,
  Lock,
  ShieldCheck,
  Wifi,
} from "lucide-react"
import type { PostureResponse, PostureWorkload } from "./trust-boundary-map"

interface UpstreamCrownJewel {
  id: string
  name: string
  type?: string | null
  is_internet_exposed?: boolean
  hits?: number
  bytes_transferred?: number
}

interface SensitiveDataRisk {
  // Total sensitive data stores (jewels) seen in window
  totalJewels: number
  // Subset that are reachable via at least one workload with internet egress
  exposedJewels: Array<{
    jewel: UpstreamCrownJewel
    exposedReaders: PostureWorkload[]
  }>
  worstJewel: { jewel: UpstreamCrownJewel; reader: PostureWorkload } | null
}

function deriveSensitiveDataRisk(workloads: PostureWorkload[]): SensitiveDataRisk {
  const map = new Map<string, { jewel: UpstreamCrownJewel; exposedReaders: PostureWorkload[]; totalReaders: number }>()
  for (const w of workloads) {
    const cjs = ((w as unknown) as { upstream_crown_jewels?: UpstreamCrownJewel[] })
      .upstream_crown_jewels
    if (!cjs?.length) continue
    for (const cj of cjs) {
      if (!cj?.id) continue
      let entry = map.get(cj.id)
      if (!entry) {
        entry = { jewel: cj, exposedReaders: [], totalReaders: 0 }
        map.set(cj.id, entry)
      }
      entry.totalReaders += 1
      if (w.has_internet_capability) entry.exposedReaders.push(w)
    }
  }
  const allJewels = Array.from(map.values())
  const exposed = allJewels.filter((e) => e.exposedReaders.length > 0)
  // Worst: internet-exposed jewel first, then most exposed readers, then
  // most bytes. Pick the top reader of the top jewel for the primary CTA.
  exposed.sort((a, b) => {
    const ax = a.jewel.is_internet_exposed ? 1 : 0
    const bx = b.jewel.is_internet_exposed ? 1 : 0
    if (ax !== bx) return bx - ax
    if (a.exposedReaders.length !== b.exposedReaders.length) {
      return b.exposedReaders.length - a.exposedReaders.length
    }
    return (b.jewel.bytes_transferred || 0) - (a.jewel.bytes_transferred || 0)
  })
  const worst = exposed[0]
    ? { jewel: exposed[0].jewel, reader: exposed[0].exposedReaders[0] }
    : null
  return {
    totalJewels: allJewels.length,
    exposedJewels: exposed.map(({ jewel, exposedReaders }) => ({ jewel, exposedReaders })),
    worstJewel: worst,
  }
}

interface Props {
  data: PostureResponse
  onSelectWorkload?: (w: PostureWorkload) => void
  onShowTechnical?: () => void
  technicalShown: boolean
  // Optional: deep-link to the Data Leak Paths page. When provided, the
  // "Show the path" CTA on the sensitive-data card navigates there
  // instead of opening the per-workload drawer.
  onShowDataLeakPaths?: () => void
}

export function ExecutiveSummary({
  data,
  onSelectWorkload,
  onShowTechnical,
  technicalShown,
  onShowDataLeakPaths,
}: Props) {
  const risk = useMemo(() => deriveSensitiveDataRisk(data.workloads), [data.workloads])
  const summary = data.summary

  // The three plain-English problem cards, derived from the bucket counts
  // + jewel risk. Each card hides if its count is zero — no fabricated
  // problems just to fill the layout.
  const sensitiveDataAtRisk = risk.exposedJewels.length
  const openDoorsUnused = summary.latent_exposure || 0
  const wastedSpend = summary.aws_redirectable || 0
  const activeInternet = summary.active_internet || 0
  const totalProblems = sensitiveDataAtRisk + openDoorsUnused + wastedSpend
  const lockedDown = summary.isolated || 0
  const totalWorkloads = summary.total_workloads || 0

  // Pick the recommended next step. Priority: safest closure (LATENT, no
  // observed traffic) > AWS redirect (free, no behavior change) > narrow
  // (requires sign-off). Sensitive data risk gets called out separately
  // but isn't the "next step" CTA because it's resource-side work, not
  // server-side closure.
  let nextStep: {
    kind: "close-unused" | "redirect-aws" | "protect-sensitive" | "narrow" | null
    headline: string
    body: string
    cta: string
  } | null = null
  if (openDoorsUnused > 0) {
    nextStep = {
      kind: "close-unused",
      headline: `Close ${openDoorsUnused} unused door${openDoorsUnused === 1 ? "" : "s"}`,
      body: `${openDoorsUnused} server${openDoorsUnused === 1 ? " has" : "s have"} permission to send data to the internet but ${openDoorsUnused === 1 ? "hasn't" : "haven't"} used it in the past 30 days. Removing the permission costs nothing and reduces your attack surface.`,
      cta: "Show me how",
    }
  } else if (wastedSpend > 0) {
    nextStep = {
      kind: "redirect-aws",
      headline: `Switch ${wastedSpend} server${wastedSpend === 1 ? "" : "s"} to the free AWS route`,
      body: `${wastedSpend} server${wastedSpend === 1 ? " talks" : "s talk"} to AWS storage through the public internet. AWS offers a free private route. Switching saves bandwidth fees and keeps traffic off the internet.`,
      cta: "Show me how",
    }
  } else if (sensitiveDataAtRisk > 0) {
    nextStep = {
      kind: "protect-sensitive",
      headline: "Protect your most exposed data store",
      body: `Your most exposed data store is "${risk.worstJewel?.jewel.name}". It can be reached through ${risk.exposedJewels[0]?.exposedReaders.length} server${(risk.exposedJewels[0]?.exposedReaders.length || 0) === 1 ? "" : "s"} that talk${(risk.exposedJewels[0]?.exposedReaders.length || 0) === 1 ? "s" : ""} to the public internet.`,
      cta: "Open the path",
    }
  } else if (activeInternet > 0) {
    nextStep = {
      kind: "narrow",
      headline: `Review ${activeInternet} server${activeInternet === 1 ? "" : "s"} that talk${activeInternet === 1 ? "s" : ""} to the internet`,
      body: `${activeInternet} server${activeInternet === 1 ? " is" : "s are"} actively sending data outside your network. Narrow the permissions to only the destinations actually used so nothing else can leak.`,
      cta: "Review them",
    }
  }

  const allClean = totalProblems === 0 && activeInternet === 0

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header strip */}
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
        <ShieldCheck className="w-4 h-4 text-violet-600 shrink-0" />
        <div className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-700">
          What's going on right now
        </div>
        <span className="ml-auto text-[10px] text-slate-500">
          {totalWorkloads} server{totalWorkloads === 1 ? "" : "s"} in this system · last 30 days
        </span>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        {/* All-clean state */}
        {allClean && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <div className="text-[14px] font-bold text-emerald-900">
                Everything looks locked down.
              </div>
              <div className="text-[12px] text-emerald-800 mt-0.5">
                None of your {totalWorkloads} servers have unused internet access, are
                wasting bandwidth, or expose sensitive data via the public internet.
              </div>
            </div>
          </div>
        )}

        {/* Problem cards — each hides when its count is zero */}
        {!allClean && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Sensitive data risk */}
            {sensitiveDataAtRisk > 0 && (
              <ProblemCard
                tone="red"
                icon={<AlertTriangle className="w-5 h-5" />}
                count={sensitiveDataAtRisk}
                unit={`sensitive data store${sensitiveDataAtRisk === 1 ? "" : "s"}`}
                title="Sensitive data can leak"
                body={
                  <>
                    {sensitiveDataAtRisk} of your {risk.totalJewels} sensitive data
                    store{risk.totalJewels === 1 ? "" : "s"} can be reached through
                    servers that connect to the public internet. If one of those
                    servers gets hacked, the data leaves immediately —{" "}
                    <strong>before any alarm fires.</strong>
                  </>
                }
                actionLabel="Show the path"
                onAction={() => {
                  // Navigate to the Data Leak Paths page when the parent
                  // wired the section callback; otherwise fall back to
                  // the legacy drawer-open behavior.
                  if (onShowDataLeakPaths) {
                    onShowDataLeakPaths()
                  } else if (risk.worstJewel?.reader) {
                    onSelectWorkload?.(risk.worstJewel.reader)
                  }
                }}
                actionDisabled={!onShowDataLeakPaths && !risk.worstJewel?.reader}
              />
            )}

            {/* Open doors unused */}
            {openDoorsUnused > 0 && (
              <ProblemCard
                tone="amber"
                icon={<Wifi className="w-5 h-5" />}
                count={openDoorsUnused}
                unit={`server${openDoorsUnused === 1 ? "" : "s"}`}
                title="Open doors nobody uses"
                body={
                  <>
                    {openDoorsUnused} of your {totalWorkloads} servers
                    {openDoorsUnused === 1 ? " has" : " have"} permission to send
                    data to the internet but {openDoorsUnused === 1 ? "has" : "have"}{" "}
                    <strong>never used it in 30 days.</strong> Closing the permission
                    is safe — the server doesn't depend on it.
                  </>
                }
                actionLabel="See the list"
                onAction={onShowTechnical}
              />
            )}

            {/* Wasted spend */}
            {wastedSpend > 0 && (
              <ProblemCard
                tone="yellow"
                icon={<DollarSign className="w-5 h-5" />}
                count={wastedSpend}
                unit={`server${wastedSpend === 1 ? "" : "s"}`}
                title="Wasted spend"
                body={
                  <>
                    {wastedSpend} server{wastedSpend === 1 ? "" : "s"} pay for
                    internet bandwidth to reach AWS storage. AWS offers a{" "}
                    <strong>free private route</strong> for that same traffic.
                    Switching saves money and keeps it off the internet.
                  </>
                }
                actionLabel="Switch them"
                onAction={onShowTechnical}
              />
            )}

            {/* Locked-down callout when there's at least one problem but
                the majority is fine — gives the page a positive anchor */}
            {!allClean && lockedDown > 0 && totalProblems > 0 && (
              <ProblemCard
                tone="green"
                icon={<Lock className="w-5 h-5" />}
                count={lockedDown}
                unit={`server${lockedDown === 1 ? "" : "s"}`}
                title="Already locked down"
                body={
                  <>
                    {lockedDown} of your {totalWorkloads} servers cannot reach the
                    internet at all — these are <strong>not at risk</strong> of
                    leaking data. No action needed.
                  </>
                }
              />
            )}
          </div>
        )}

        {/* Recommended next step — single primary action */}
        {nextStep && (
          <div className="rounded-lg border-2 border-violet-300 bg-violet-50 p-4">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-violet-900">
                Recommended next step
              </span>
              <span className="text-[10px] text-violet-700">
                · the safest fix to start with
              </span>
            </div>
            <div className="text-[15px] font-bold text-slate-900 mb-1.5">
              {nextStep.headline}
            </div>
            <div className="text-[12px] text-slate-700 leading-relaxed mb-3">
              {nextStep.body}
            </div>
            <button
              type="button"
              onClick={() => {
                if (nextStep?.kind === "protect-sensitive" && risk.worstJewel?.reader) {
                  onSelectWorkload?.(risk.worstJewel.reader)
                } else {
                  onShowTechnical?.()
                }
              }}
              className="inline-flex items-center gap-1.5 rounded border-2 border-violet-600 bg-violet-600 text-white px-4 py-2 text-[12px] font-bold uppercase tracking-[0.08em] hover:bg-violet-700 transition-colors"
            >
              {nextStep.cta}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Footer toggle to expand the technical view */}
      <button
        type="button"
        onClick={onShowTechnical}
        className="w-full px-5 py-2.5 border-t border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600 hover:text-slate-900 flex items-center justify-center gap-2 transition-colors"
      >
        {technicalShown ? "Hide technical details" : "Show technical details"}
        <ArrowRight
          className={`w-3 h-3 transition-transform ${technicalShown ? "rotate-90" : "rotate-90"}`}
        />
      </button>
    </section>
  )
}

// ---- Problem card primitive --------------------------------------

interface ProblemCardProps {
  tone: "red" | "amber" | "yellow" | "green"
  icon: React.ReactNode
  count: number
  unit: string
  title: string
  body: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  actionDisabled?: boolean
}

const TONE_CLASSES: Record<
  ProblemCardProps["tone"],
  { card: string; iconWrap: string; count: string; title: string; btn: string }
> = {
  red: {
    card: "border-rose-300 bg-rose-50",
    iconWrap: "bg-rose-100 text-rose-700 border-rose-300",
    count: "text-rose-700",
    title: "text-rose-900",
    btn: "border-rose-500 bg-rose-600 text-white hover:bg-rose-700",
  },
  amber: {
    card: "border-amber-300 bg-amber-50",
    iconWrap: "bg-amber-100 text-amber-700 border-amber-300",
    count: "text-amber-700",
    title: "text-amber-900",
    btn: "border-amber-500 bg-amber-600 text-white hover:bg-amber-700",
  },
  yellow: {
    card: "border-yellow-300 bg-yellow-50",
    iconWrap: "bg-yellow-100 text-yellow-700 border-yellow-300",
    count: "text-yellow-700",
    title: "text-yellow-900",
    btn: "border-yellow-500 bg-yellow-600 text-white hover:bg-yellow-700",
  },
  green: {
    card: "border-emerald-300 bg-emerald-50",
    iconWrap: "bg-emerald-100 text-emerald-700 border-emerald-300",
    count: "text-emerald-700",
    title: "text-emerald-900",
    btn: "border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700",
  },
}

function ProblemCard({
  tone,
  icon,
  count,
  unit,
  title,
  body,
  actionLabel,
  onAction,
  actionDisabled,
}: ProblemCardProps) {
  const t = TONE_CLASSES[tone]
  return (
    <div className={`rounded-lg border-2 ${t.card} p-3.5 flex flex-col`}>
      <div className="flex items-start gap-3 mb-2">
        <div className={`shrink-0 rounded-lg border ${t.iconWrap} w-9 h-9 flex items-center justify-center`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-bold tabular-nums ${t.count}`}>{count}</span>
            <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-600 truncate">
              {unit}
            </span>
          </div>
          <div className={`text-[13px] font-bold ${t.title}`}>{title}</div>
        </div>
      </div>
      <div className="text-[12px] text-slate-700 leading-relaxed flex-1">{body}</div>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
          className={`mt-3 inline-flex items-center gap-1.5 self-start rounded border-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
            actionDisabled
              ? "border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed"
              : t.btn
          }`}
        >
          {actionLabel}
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

export default ExecutiveSummary
