"use client"

/**
 * Inventory > All Services > Resource details > Dependencies (workplan v1.3 §6).
 *
 * Replaces the basis-grouped ledger this tab used to render. The primary split
 * is now perspective — what this resource Uses, what Uses it — because §6.2
 * asks the tab to answer "what does this resource use / what uses it", and
 * §6.3 forbids showing raw edge types like "DOWNSTREAM · SECURED_BY" as the
 * user-facing label.
 *
 * §6.2 lists Uses/Used by alongside Configured/Observed/Derived. Those are not
 * disjoint lists here: §5.5 is explicit that the tab "normally renders one
 * resource-pair row with separate axes for configuration assertion [and]
 * runtime assertion", so basis is an axis ON the pair row rather than a fourth
 * copy of the same facts. Derived capabilities and Unknowns keep their own
 * sections because they are different claims, not different framings.
 *
 * Rows, roles and labels come from GET /api/resource-dependencies (DE-305).
 * The tab does not re-resolve relationships client-side.
 *
 * Activation context and attribution profile are still reported as unavailable
 * rather than defaulted (§2.3, DE-307). Completeness, counterparty account and
 * region now come from the read model when the graph supplied them.
 */

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Database, Info, LoaderCircle, ShieldQuestion } from "lucide-react"
import { deriveDependencyMaturity, type DependencyCoverageInput, type DependencyMaturity } from "@/lib/dependency-coverage"
import {
  dedupeEvidenceRefs,
  dedupeSourceRefs,
  mapApiPair,
  type PairRowView,
  type Perspective,
  type RelationFactView,
  type ResourceDependenciesResponse,
} from "@/lib/resource-dependencies"
import type { BasisClass } from "@/lib/resource-dossier-types"
import { EvidenceRefList, StateBadge } from "./dossier-primitives"

const PAGE_SIZE = 10

/** §6.4 minimum views per advertised A2 resource family. */
const MINIMUM_VIEWS: Record<string, string[]> = {
  SecurityGroup: [
    "Referenced-SG rules, CIDR rules, ports, protocols and direction",
    "Stable workload parent for ephemeral interface members",
    "Alternative surviving rules before any change-impact conclusion",
  ],
  IAMRole: [
    "Trust principals and cross-account boundaries",
    "Managed policies, inline policies, boundaries and SCP/RCP context",
    "Separation of task, execution, service and human assumption",
  ],
  RouteTable: [
    "Route entries, destinations, targets, propagation and blackhole state",
    "Subnets inheriting the VPC main route table",
    "Alternate routes and unknown return-path boundaries",
  ],
  Subnet: [
    "Route-table and NACL association",
    "Owner and consumer accounts for RAM-shared resources",
    "Gateway, endpoint and peering context needed to explain the subnet",
  ],
}

/**
 * Resolve the §6.4 family from any of the type spellings the graph carries.
 * §3.3 measured SecurityGroup, AWS::EC2::SecurityGroup and ec2:security-group
 * live at once, so an exact-string lookup silently drops the coverage note.
 */
export function minimumViewsFor(resourceType: string | null | undefined): string[] | null {
  const normalized = String(resourceType ?? "").toLowerCase().replace(/[^a-z]/g, "")
  if (!normalized) return null
  for (const [family, views] of Object.entries(MINIMUM_VIEWS)) {
    if (normalized.endsWith(family.toLowerCase())) return views
  }
  return null
}

const PERSPECTIVE_SECTIONS: Array<{ id: Perspective; title: string; blurb: string }> = [
  { id: "USES", title: "Uses", blurb: "Providers and upstream capabilities this resource depends on." },
  { id: "USED_BY", title: "Used by", blurb: "Consumers that depend on this resource." },
  { id: "PEER", title: "Observed communication", blurb: "Runtime flows where neither side is the declared provider." },
]

function MaturityChip({ maturity, label }: { maturity: DependencyMaturity; label: string }) {
  const tone = maturity === "READY"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : maturity === "BLOCKED" || maturity === "STALE"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : maturity === "PARTIAL" || maturity === "LEARNING"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-600"
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>{label}</span>
}

function SummaryTile({ value, caption }: { value: string | number; caption: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-2xl font-bold text-slate-950">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{caption}</div>
    </div>
  )
}

function FactLine({ fact }: { fact: RelationFactView }) {
  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {fact.resolved.registered && !fact.resolved.generic
          ? <span className="text-xs font-semibold text-slate-900">{fact.resolved.label}</span>
          : (
            <span className="flex items-center gap-1 text-xs font-semibold text-amber-900">
              <ShieldQuestion className="h-3.5 w-3.5" aria-hidden />
              <span className="font-mono">{fact.resolved.rawRelationship || "unnamed"}</span>
              <span className="font-sans font-normal">({fact.resolved.generic ? "generic relationship" : "unregistered relationship"})</span>
            </span>
          )}
        <StateBadge value={fact.basisClass} />
        {fact.freshness === "STALE" ? <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800">Stale</span> : null}
        {fact.freshness === "UNKNOWN" ? <span className="text-[10px] uppercase tracking-wide text-slate-500">Freshness unknown</span> : null}
      </div>
      {fact.resolved.mechanismLabel ? (
        <div className="mt-1 text-[11px] text-slate-600">{fact.resolved.mechanism} · {fact.resolved.mechanismLabel} · supplies {fact.resolved.capability}</div>
      ) : null}
      {fact.aliasesCollapsed.length ? (
        <div className="mt-1 text-[11px] text-slate-500">Also stored as {fact.aliasesCollapsed.join(", ")} — collapsed to one attachment.</div>
      ) : null}
      {fact.actions.length ? <div className="mt-1 text-xs text-slate-600">Actions: {fact.actions.join(", ")}</div> : null}
      {fact.observationDays ? (
        <div className="mt-1 text-xs text-slate-600">Observed over {fact.observationDays} days · last seen {fact.lastSeen ? new Date(fact.lastSeen).toLocaleString() : "unknown"}</div>
      ) : null}
      {fact.viaVpce ? <div className="mt-1 text-xs text-slate-600">Via VPC endpoint: <span className="font-mono">{fact.viaVpce}</span></div> : null}
    </li>
  )
}

function PairCard({ pair }: { pair: PairRowView }) {
  const [open, setOpen] = useState(false)
  const drawerId = `evidence-${pair.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`
  const refs = dedupeEvidenceRefs(pair.facts.flatMap(fact => fact.evidenceRefs))
  const sourceRefs = dedupeSourceRefs(pair.facts.flatMap(fact => fact.sourceGenerationRefs))

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{pair.label}</div>
          {pair.identity && pair.identity !== pair.label
            ? <div className="mt-1 break-all font-mono text-[10px] text-slate-500">{pair.identity}</div>
            : null}
          {!pair.identity
            ? <div className="mt-1 text-[11px] text-amber-800">Canonical identity not resolved for this endpoint.</div>
            : null}
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {pair.facts.map(fact => <FactLine key={`${fact.resolved.rawRelationship}-${fact.basisClass}`} fact={fact} />)}
      </ul>
      <div className="mt-3 border-t border-slate-100 pt-2">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          aria-controls={drawerId}
          className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
          Evidence
        </button>
        {open ? (
          <div id={drawerId} className="mt-2 text-xs">
            <EvidenceRefList refs={refs} sourceRefs={sourceRefs} />
          </div>
        ) : null}
      </div>
    </li>
  )
}

function PerspectiveSection({ title, blurb, rows }: { title: string; blurb: string; rows: PairRowView[] }) {
  const [visible, setVisible] = useState(PAGE_SIZE)
  const headingId = `dependencies-${title.replaceAll(" ", "-").toLowerCase()}`
  if (!rows.length) return null
  const shown = rows.slice(0, visible)

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-2">
        <h3 id={headingId} className="text-sm font-bold text-slate-950">{title} <span className="font-normal text-slate-500">({rows.length})</span></h3>
        <p className="text-[11px] text-slate-500">{blurb}</p>
      </div>
      <ul className="space-y-3">
        {shown.map(pair => <PairCard key={pair.key} pair={pair} />)}
      </ul>
      {rows.length > shown.length ? (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setVisible(value => value + PAGE_SIZE)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Show {Math.min(PAGE_SIZE, rows.length - shown.length)} more
          </button>
          <span className="text-[11px] text-slate-500">Showing {shown.length} of {rows.length}. Nothing is dropped.</span>
        </div>
      ) : null}
    </section>
  )
}

interface Props {
  payload: ResourceDependenciesResponse | null
  loading?: boolean
  error?: string | null
  coverage?: DependencyCoverageInput | null
  serveState?: string | null
  notes?: string | null
  resourceType?: string | null
}

export function DependenciesTab({
  payload,
  loading = false,
  error = null,
  coverage = null,
  serveState = null,
  notes = null,
  resourceType,
}: Props) {
  const pairs = useMemo(
    () => (payload?.page.rows ?? []).map(mapApiPair),
    [payload],
  )
  const byPerspective = useMemo(() => ({
    USES: pairs.filter(row => row.perspective === "USES"),
    USED_BY: pairs.filter(row => row.perspective === "USED_BY"),
    PEER: pairs.filter(row => row.perspective === "PEER"),
  }), [pairs])
  const facts = useMemo(() => pairs.flatMap(row => row.facts), [pairs])
  const maturity = useMemo(() => deriveDependencyMaturity(
    serveState,
    coverage,
    facts.map(fact => ({ freshness: fact.freshness, basisClass: fact.basisClass })),
  ), [coverage, facts, serveState])
  const staleCount = facts.filter(fact => fact.freshness === "STALE").length
  const unregistered = Object.keys(payload?.counts.unregistered_relationships ?? {})
  const generic = [...new Set(facts.filter(fact => fact.resolved.generic).map(fact => fact.resolved.rawRelationship))]
  const unresolvedCount = payload?.counts.unresolved_counterparties ?? 0
  const derivedExcluded = payload?.counts.excluded.derived_without_derivation ?? 0
  const basisCounts = useMemo(() => {
    const counts = { OBSERVED: 0, CONFIGURED: 0, STRUCTURAL: 0 }
    for (const fact of facts) {
      if (fact.basisClass in counts) counts[fact.basisClass] += 1
    }
    return counts
  }, [facts])
  const minimumViews = minimumViewsFor(resourceType)
  const perspectiveCounts = payload?.counts.by_perspective ?? { USES: 0, USED_BY: 0, PEER: 0 }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        Loading resource-anchored dependencies…
      </div>
    )
  }
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
        {error}
      </div>
    )
  }
  if (!payload) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        No dependency assertions are available. This is not proof that dependencies do not exist.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section aria-labelledby="dependencies-summary" className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="dependencies-summary" className="text-sm font-bold text-slate-950">Dependency summary</h3>
          <div className="flex items-center gap-2">
            <MaturityChip maturity={maturity.maturity} label={maturity.label} />
            <StateBadge value={serveState || (payload.counts.completeness === "TRUNCATED" ? "PARTIAL" : "ACTIVE")} />
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600">{maturity.reason}</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <SummaryTile value={perspectiveCounts.USES} caption="Providers used" />
          <SummaryTile value={perspectiveCounts.USED_BY} caption="Consumers" />
          <SummaryTile value={perspectiveCounts.PEER} caption="Observed peers" />
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-600">
          {(["OBSERVED", "CONFIGURED", "STRUCTURAL"] as BasisClass[]).map(basis => (
            <span key={basis}>{basis.toLowerCase()}: <strong className="text-slate-900">{basisCounts[basis]}</strong></span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {notes ?? "Basis classes are separate proof sets and are never added into a consumer total."}
        </p>
      </section>

      {pairs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          No dependency assertions are available. This is not proof that dependencies do not exist.
        </div>
      ) : null}

      {PERSPECTIVE_SECTIONS.map(item => (
        <PerspectiveSection
          key={item.id}
          title={item.title}
          blurb={item.blurb}
          rows={byPerspective[item.id]}
        />
      ))}

      <section aria-labelledby="dependencies-derived" className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 id="dependencies-derived" className="text-sm font-bold text-slate-950">Derived capabilities</h3>
        {derivedExcluded === 0 ? (
          <p className="mt-2 text-xs leading-5 text-slate-600">
            No derived reachability or effective-access rows are computed for this resource in this release.
            Absence of a derived row is not a statement that the resource cannot reach anything.
          </p>
        ) : (
          <p className="mt-2 text-xs leading-5 text-amber-900">
            {derivedExcluded} derived row{derivedExcluded === 1 ? "" : "s"} were withheld because they had no derivation,
            mandatory inputs, or coverage. They are not shown as direct attachments.
          </p>
        )}
      </section>

      <section aria-labelledby="dependencies-boundaries" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-amber-700" aria-hidden />
          <h3 id="dependencies-boundaries" className="text-sm font-bold text-amber-950">Unknowns and boundaries</h3>
        </div>
        <ul className="mt-3 space-y-1.5 text-xs leading-5 text-amber-900">
          <li>
            This view shows known dependencies within collected scope for one AWS account and generation
            {payload.scope.generation !== "UNKNOWN" ? ` (${payload.scope.generation})` : ""}.
            It is not a claim that every dependency or every consumer outside that scope is modelled.
          </li>
          {maturity.missingSources.length ? (
            <li>Required source{maturity.missingSources.length === 1 ? "" : "s"} not present: {maturity.missingSources.join(", ")}.</li>
          ) : null}
          {maturity.insufficientFor.length ? (
            <li>Current coverage cannot support: {maturity.insufficientFor.join("; ")}.</li>
          ) : null}
          {staleCount ? <li>{staleCount} relationship{staleCount === 1 ? " is" : "s are"} marked stale by their collector and are shown, not dropped.</li> : null}
          {unresolvedCount ? (
            <li>{unresolvedCount} endpoint{unresolvedCount === 1 ? "" : "s"} could not be resolved to a canonical AWS identity.</li>
          ) : null}
          {unregistered.length ? (
            <li>Not in the relationship contract, so shown untyped: <span className="font-mono">{unregistered.join(", ")}</span>.</li>
          ) : null}
          {generic.length ? (
            <li>Generic relationship{generic.length === 1 ? "" : "s"} <span className="font-mono">{generic.join(", ")}</span> carry no dependency meaning and are not given a typed label.</li>
          ) : null}
          <li>
            Completeness for this response: {payload.counts.completeness}.
            Activation context, attribution profile, and mechanism certification are not supplied yet.
          </li>
          {minimumViews ? (
            <li>
              Not yet available for this resource family: {minimumViews.join("; ")}.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  )
}
