"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Clock3,
  DatabaseZap,
  Network,
  RefreshCw,
} from "lucide-react"
import { useAccountScope } from "@/lib/account-scope-context"
import { withAccountScope } from "@/lib/account-scope"
import {
  relationshipsAreTruncated,
  dependencyDisplayName,
  dependencyErrorMessage,
  excludedPreviewRelationshipCount,
  dependencyFreshnessValue,
  dependencyPlaneLabel,
  dependencyRelationshipLabel,
  dependencyRows,
  rawRelationshipTotal,
  type DependencyDirection,
  type DependencyRow,
  type ResourceDependenciesResponse,
} from "@/lib/resource-dependencies"

const INITIAL_PAGE = 100
const EXPANDED_PAGE = 500

function formatTimestamp(value: string | null): string {
  if (!value) return "Freshness unknown"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function evidenceTone(plane: string): string {
  if (plane === "Observed") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (plane === "Configured") return "bg-blue-50 text-blue-700 border-blue-200"
  if (plane === "Derived") return "bg-violet-50 text-violet-700 border-violet-200"
  return "bg-amber-50 text-amber-800 border-amber-200"
}

function DependencyCard({ row }: { row: DependencyRow }) {
  const relationship = row.relationship
  const plane = dependencyPlaneLabel(relationship.plane)
  const freshness = dependencyFreshnessValue(relationship)
  const details = [
    relationship.protocol ? String(relationship.protocol).toUpperCase() : null,
    relationship.port != null ? `port ${relationship.port}` : null,
    relationship.action ? String(relationship.action) : null,
  ].filter(Boolean)

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {row.role}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${evidenceTone(plane)}`}>
              {plane}
            </span>
            {relationship.is_stale === true && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                Stale
              </span>
            )}
          </div>
          <h4 className="mt-2 truncate font-semibold text-slate-900">
            {dependencyDisplayName(row.peer)}
          </h4>
          <p className="mt-0.5 text-xs text-slate-500">
            {row.peer.type || "Resource type unknown"}
          </p>
        </div>
        {row.direction === "inbound" ? (
          <ArrowDownLeft className="h-5 w-5 shrink-0 text-sky-600" aria-label="Incoming graph relationship" />
        ) : (
          <ArrowUpRight className="h-5 w-5 shrink-0 text-violet-600" aria-label="Outgoing graph relationship" />
        )}
      </div>

      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
        <p className="text-sm font-medium text-slate-800">
          {dependencyRelationshipLabel(relationship.type)}
        </p>
        {details.length > 0 && <p className="mt-1 text-xs text-slate-600">{details.join(" · ")}</p>}
      </div>

      <dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-500">Evidence</dt>
          <dd className="mt-0.5 text-slate-800">
            {relationship.evidence_kind || "Evidence kind unknown"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Source</dt>
          <dd className="mt-0.5 text-slate-800">
            {relationship.source_system || "Source unknown"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="flex items-center gap-1 font-medium text-slate-500">
            <Clock3 className="h-3.5 w-3.5" /> Freshness
          </dt>
          <dd className="mt-0.5 text-slate-800">{formatTimestamp(freshness)}</dd>
        </div>
      </dl>
    </article>
  )
}

function DirectionSection({
  direction,
  rows,
  total,
}: {
  direction: DependencyDirection
  rows: DependencyRow[]
  total: number
}) {
  const inbound = direction === "inbound"
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">{inbound ? "Incoming" : "Outgoing"}</h3>
          <p className="text-xs text-slate-500">
            {inbound ? "Graph edges directed toward this resource" : "Graph edges directed away from this resource"}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {total} adjacent
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
          No {inbound ? "incoming" : "outgoing"} graph relationships were returned in this page.
          This is not proof that none exist or that no dependency exists.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => <DependencyCard key={row.key} row={row} />)}
        </div>
      )}
    </section>
  )
}

interface Props {
  resourceId: string
}

interface PreviewTabButtonProps {
  enabled: boolean
  selected: boolean
  onSelect: () => void
}

export function ResourceRelationshipsPreviewTabButton({
  enabled,
  selected,
  onSelect,
}: PreviewTabButtonProps) {
  if (!enabled) return null
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`px-6 py-3 font-medium text-sm transition-colors flex items-center gap-2 ${
        selected
          ? "border-b-2 border-violet-600 text-violet-600 bg-white"
          : "text-slate-600 hover:text-slate-900"
      }`}
    >
      <Network className="w-4 h-4" />
      Relationships preview
    </button>
  )
}

export function ResourceDependenciesTab({ resourceId }: Props) {
  const accountScope = useAccountScope()
  const [pageSize, setPageSize] = useState(INITIAL_PAGE)
  const [data, setData] = useState<ResourceDependenciesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setPageSize(INITIAL_PAGE)
  }, [resourceId, accountScope.customerId, accountScope.accountId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const scoped = withAccountScope(
          `/api/proxy/resource-view/${encodeURIComponent(resourceId)}/connections?page=${pageSize}`,
          accountScope,
        )
        const response = await fetch(scoped, { cache: "no-store" })
        const body = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(dependencyErrorMessage(body, response.status))
        }
        if (!body?.success || !body?.coverage || !body?.scope) {
          throw new Error("Dependencies response is missing its scope or completeness contract")
        }
        if (!cancelled) setData(body as ResourceDependenciesResponse)
      } catch (reason) {
        if (!cancelled) {
          setData(null)
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [resourceId, pageSize, reloadKey, accountScope.customerId, accountScope.groupId, accountScope.accountId, accountScope.region])

  const inboundRows = useMemo(() => data ? dependencyRows(data, "inbound") : [], [data])
  const outboundRows = useMemo(() => data ? dependencyRows(data, "outbound") : [], [data])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-600" role="status" aria-live="polite">
        <RefreshCw className="h-6 w-6 animate-spin text-violet-600" />
        <span className="ml-3">Loading known dependencies…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Dependencies are unavailable</h3>
            <p className="mt-1 text-sm text-red-700">{error}</p>
            <p className="mt-2 text-xs text-red-600">No dependency or safety conclusion was produced.</p>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="mt-4 rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const total = rawRelationshipTotal(data)
  const truncated = relationshipsAreTruncated(data)
  const excluded = excludedPreviewRelationshipCount(data)
  const unattributed = data.scope.account_match_mode === "UNATTRIBUTED"

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
        <div className="flex items-start gap-3">
          <DatabaseZap className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900">Graph relationships preview</h3>
            <p className="mt-1 text-sm text-slate-600">
              {total} adjacent graph relationship{total === 1 ? " is" : "s are"} recorded for this resource.
              This preview shows scoped adjacency and evidence metadata. It does not classify every edge as a dependency and does not claim that uncollected relationships are absent.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 shadow-sm">
                Account {data.scope.account_id || "unknown"}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 shadow-sm">
                Identity {data.scope.account_match_mode || "unknown"}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 shadow-sm">
                Authority {data.scope.authority || "unknown"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {unattributed && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          The resource matched an unattributed graph node. Account ownership is not proven for this result.
        </div>
      )}

      {excluded > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          {excluded} returned history, operational, or quarantined traffic relationship{excluded === 1 ? " was" : "s were"} excluded from this preview.
        </div>
      )}

      {truncated && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-amber-900">This graph relationship set is truncated</p>
              <p className="mt-1 text-sm text-amber-800">
                Showing {data.coverage.inbound.returned + data.coverage.outbound.returned} of {total} relationships. No hidden row is being treated as absent.
              </p>
            </div>
            {pageSize < EXPANDED_PAGE && (
              <button
                type="button"
                onClick={() => setPageSize(EXPANDED_PAGE)}
                className="rounded-lg bg-amber-900 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800"
              >
                Load up to {EXPANDED_PAGE} per direction
              </button>
            )}
          </div>
        </div>
      )}

      <DirectionSection
        direction="inbound"
        rows={inboundRows}
        total={data.coverage.inbound.relationship_total}
      />
      <DirectionSection
        direction="outbound"
        rows={outboundRows}
        total={data.coverage.outbound.relationship_total}
      />
    </div>
  )
}
