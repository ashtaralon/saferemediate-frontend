'use client'

// Reach attack-path tab (Sprint 5)
//
// Tiny first render against alon-prod. Consumes
// /api/proxy/attack-paths/{systemName}/reach. Renders nodes grouped
// by subnet-tier zone (swimlane semantics) and surfaces the ADR-001
// UDE-02 envelope on each edge (confidence, evidence_refs source,
// freshness). Edge fan-out is intentionally collapsed to a side
// panel summary on this first iteration — the x6 graph render lands
// in a follow-up.
//
// Visual grammar (locked across the 4-round design discussion):
//   - Zones are swimlanes (public, private_app, private_data,
//     endpoint, shared, mgmt, unknown).
//   - Plumbing nodes (NAT/IGW) stay neutral.
//   - Gates (SG, IAM) get colored state pills.
//   - Crown jewels carry a distinct marker.
//   - Dead-end edges (no envelope/no evidence) show as faded with
//     the missing-evidence reason exposed.

import { useEffect, useState } from 'react'
import { useSystem } from '@/lib/system-context'

interface ReachNode {
  id: string
  label: string
  type: string
  labels: string[]
  zone: string
  is_crown_jewel: boolean
  is_internet_exposed: boolean
  system_name?: string
  vpc_id?: string
  subnet_id?: string | null
  imdsv2_enforced?: boolean
  imds_disabled?: boolean
  has_public_ingress?: boolean
  confidence?: number
}

interface EvidenceRef {
  source_signal_id: string
  fact_id: string
  role: string
  weight: number
}

interface ReachEdge {
  source: string
  target: string
  type: string
  edge_class?: string
  confidence?: number
  evidence_refs?: EvidenceRef[]
  collected_at?: string
  last_seen?: string
  first_seen?: string
  count?: number
  dependency_kind?: string
  source_api_call?: string
  gate_state?: string
  path_kind?: string
  protocol?: string
  port?: number
}

interface SignalSourceMeta {
  source_id: string
  source_type: string | null
  confidence_score: number
  enabled: boolean
  last_seen_event_at: string | null
  missing_reason: string | null
}

interface ReachResponse {
  system_name: string
  timestamp: string
  nodes: ReachNode[]
  edges: ReachEdge[]
  crown_jewel_ids: string[]
  signal_sources: Record<string, SignalSourceMeta>
  summary: {
    node_count: number
    edge_count: number
    zone_counts: Record<string, number>
    crown_jewel_count: number
    signal_source_count: number
  }
}

const ZONE_ORDER = [
  'public',
  'private_app',
  'private_data',
  'endpoint',
  'shared',
  'mgmt',
  'unknown',
]

const ZONE_LABELS: Record<string, string> = {
  public: 'Public subnet',
  private_app: 'Private app subnet',
  private_data: 'Private data subnet',
  endpoint: 'Endpoint subnet',
  shared: 'Shared services',
  mgmt: 'Management',
  unknown: 'Unknown zone (subnet.tier not ingested)',
}

const ZONE_TONES: Record<string, string> = {
  public: 'border-amber-400 bg-amber-50',
  private_app: 'border-sky-400 bg-sky-50',
  private_data: 'border-rose-400 bg-rose-50',
  endpoint: 'border-emerald-400 bg-emerald-50',
  shared: 'border-slate-400 bg-slate-50',
  mgmt: 'border-violet-400 bg-violet-50',
  unknown: 'border-zinc-300 bg-zinc-50',
}

function _confidenceLabel(c?: number): string {
  if (c == null) return '—'
  if (c >= 0.85) return `${Math.round(c * 100)}% (high)`
  if (c >= 0.65) return `${Math.round(c * 100)}% (staged)`
  if (c >= 0.4) return `${Math.round(c * 100)}% (suggest)`
  return `${Math.round(c * 100)}% (insufficient)`
}

function _confidenceTone(c?: number): string {
  if (c == null) return 'text-zinc-400 bg-zinc-100'
  if (c >= 0.85) return 'text-emerald-700 bg-emerald-100'
  if (c >= 0.65) return 'text-sky-700 bg-sky-100'
  if (c >= 0.4) return 'text-amber-700 bg-amber-100'
  return 'text-rose-700 bg-rose-100'
}

function _ageBucket(iso?: string): string {
  if (!iso) return 'unknown'
  const ts = new Date(iso).getTime()
  const now = Date.now()
  const hours = (now - ts) / 3_600_000
  if (hours < 1) return '<1h'
  if (hours < 24) return `${Math.round(hours)}h`
  const days = hours / 24
  if (days < 30) return `${Math.round(days)}d`
  return `>${Math.round(days / 30)}mo`
}

export default function ReachPage() {
  const { systemName } = useSystem()
  const [includeEdges, setIncludeEdges] = useState(false) // start off — saves Render→Aura connection budget
  const [data, setData] = useState<ReachResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!systemName) return
    let cancelled = false
    setLoading(true)
    setError(null)
    // Backend edge query plan was rewritten to use indexed UNWIND
    // bind on node ids (was unbounded MATCH (a)-[r]->(b) with
    // coalesce filter — defeated index, scanned every relationship).
    // After the fix it returns in ~2s at max_nodes=500, so 200 is
    // safely under both the proxy 25s and human-perception budgets.
    const qs = `?include_edges=${includeEdges}&max_nodes=200`
    fetch(`/api/proxy/attack-paths/${encodeURIComponent(systemName)}/reach${qs}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((d: ReachResponse) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [systemName, includeEdges])

  if (!systemName) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">Reach</h1>
        <p className="text-sm text-zinc-600">Select a system from the sidebar to view its reach graph.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reach — {systemName}</h1>
          <p className="text-sm text-zinc-600 mt-1">
            How an attacker reaches the crown jewel in this system.
            Nodes grouped by subnet-tier zone; edges carry the
            ADR-001 UDE-02 envelope (provenance, confidence, freshness).
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeEdges}
            onChange={(e) => setIncludeEdges(e.target.checked)}
          />
          Include edges
        </label>
      </header>

      {loading && (
        <div className="p-4 rounded border border-zinc-200 bg-zinc-50 text-sm text-zinc-700">
          Loading reach graph for {systemName}…
        </div>
      )}
      {error && (
        <div className="p-4 rounded border border-rose-300 bg-rose-50 text-sm text-rose-800">
          Error: {error}
        </div>
      )}

      {data && (
        <>
          <SummaryBar data={data} />
          <ZoneSwimlanes data={data} />
          {includeEdges && data.edges.length > 0 && (
            <EvidenceTable data={data} />
          )}
        </>
      )}
    </div>
  )
}

function SummaryBar({ data }: { data: ReachResponse }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 mb-6">
      <Stat label="Nodes" value={data.summary.node_count} />
      <Stat label="Edges" value={data.summary.edge_count} />
      <Stat label="Crown jewels" value={data.summary.crown_jewel_count} tone="rose" />
      <Stat label="Signal sources" value={data.summary.signal_source_count} />
      <Stat
        label="Zones (non-unknown)"
        value={Object.entries(data.summary.zone_counts)
          .filter(([z]) => z !== 'unknown')
          .reduce((sum, [, n]) => sum + n, 0)}
      />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'rose' }) {
  const toneCls = tone === 'rose' ? 'text-rose-700' : 'text-zinc-900'
  return (
    <div className="rounded border border-zinc-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneCls}`}>{value}</div>
    </div>
  )
}

function ZoneSwimlanes({ data }: { data: ReachResponse }) {
  const byZone: Record<string, ReachNode[]> = {}
  for (const n of data.nodes) {
    if (!byZone[n.zone]) byZone[n.zone] = []
    byZone[n.zone].push(n)
  }
  return (
    <div className="space-y-4">
      {ZONE_ORDER.filter((z) => byZone[z]?.length).map((z) => (
        <section
          key={z}
          className={`rounded border-l-4 p-3 ${ZONE_TONES[z] || ZONE_TONES.unknown}`}
        >
          <header className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
              {ZONE_LABELS[z] || z}
            </h2>
            <span className="text-xs text-zinc-500">{byZone[z].length} resource(s)</span>
          </header>
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {byZone[z].map((n) => (
              <NodeCard key={n.id} node={n} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function NodeCard({ node }: { node: ReachNode }) {
  const isJewel = node.is_crown_jewel
  return (
    <li
      className={`rounded border bg-white p-2 text-sm ${
        isJewel ? 'border-rose-500 ring-2 ring-rose-200' : 'border-zinc-200'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs text-zinc-700 truncate" title={node.id}>
          {node.label || node.id}
        </span>
        {isJewel && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
            Crown jewel
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <Pill text={node.type} />
        {node.is_internet_exposed && <Pill text="internet-exposed" tone="amber" />}
        {node.has_public_ingress && <Pill text="public ingress" tone="amber" />}
        {node.imdsv2_enforced === false && <Pill text="IMDSv1 (legacy)" tone="rose" />}
        {node.imdsv2_enforced === true && <Pill text="IMDSv2" tone="emerald" />}
        {node.imds_disabled && <Pill text="IMDS disabled" tone="emerald" />}
      </div>
    </li>
  )
}

function Pill({
  text,
  tone = 'zinc',
}: {
  text: string
  tone?: 'zinc' | 'amber' | 'rose' | 'emerald' | 'sky'
}) {
  const toneCls: Record<string, string> = {
    zinc: 'text-zinc-700 bg-zinc-100',
    amber: 'text-amber-700 bg-amber-100',
    rose: 'text-rose-700 bg-rose-100',
    emerald: 'text-emerald-700 bg-emerald-100',
    sky: 'text-sky-700 bg-sky-100',
  }
  return (
    <span
      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${toneCls[tone] || toneCls.zinc}`}
    >
      {text}
    </span>
  )
}

function EvidenceTable({ data }: { data: ReachResponse }) {
  // Show a paged table of the first 50 edges so operators can verify
  // envelope provenance/freshness is flowing end-to-end. Full graph
  // render comes in a follow-up commit (x6).
  const sample = data.edges.slice(0, 50)
  return (
    <section className="mt-6 rounded border border-zinc-200 bg-white">
      <header className="p-3 border-b border-zinc-200 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
          Edge envelope sample (first 50 of {data.edges.length})
        </h2>
        <span className="text-xs text-zinc-500">UDE-02 provenance + freshness</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="text-left p-2">Edge</th>
              <th className="text-left p-2">Class</th>
              <th className="text-left p-2">Confidence</th>
              <th className="text-left p-2">Source</th>
              <th className="text-left p-2">Last seen</th>
              <th className="text-left p-2">Count</th>
            </tr>
          </thead>
          <tbody>
            {sample.map((e, i) => {
              const ref0 = e.evidence_refs?.[0]
              const source = ref0?.source_signal_id
              const ssMeta = source ? data.signal_sources[source] : undefined
              return (
                <tr key={i} className="border-t border-zinc-100">
                  <td className="p-2 font-mono text-[10px] text-zinc-700">
                    {e.source.slice(0, 18)} → <span className="text-zinc-500">{e.type}</span> →{' '}
                    {e.target.slice(0, 18)}
                  </td>
                  <td className="p-2">
                    <Pill text={e.edge_class || '—'} tone="sky" />
                  </td>
                  <td className="p-2">
                    <span
                      className={`px-1.5 py-0.5 rounded ${_confidenceTone(e.confidence)}`}
                    >
                      {_confidenceLabel(e.confidence)}
                    </span>
                  </td>
                  <td className="p-2 text-zinc-700">
                    {source ? (
                      <span title={source}>
                        {ssMeta?.source_type || source.split(':')[0]}
                        {ssMeta && ssMeta.enabled === false && (
                          <span className="ml-1 text-rose-600">!</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-zinc-400">no provenance</span>
                    )}
                  </td>
                  <td className="p-2 text-zinc-700">{_ageBucket(e.last_seen)}</td>
                  <td className="p-2 text-zinc-700">{e.count ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
