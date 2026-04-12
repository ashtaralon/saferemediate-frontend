"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  Database,
  Eye,
  Loader2,
  Network,
  Shield,
  Server,
  Sparkles,
  Users,
} from "lucide-react"

type MapNode = {
  id: string
  name: string
  type: string
  category: string
  lp_score?: number | null
  gap_count?: number
  permission_gaps?: number
  is_internet_exposed?: boolean
}

type MapEdge = {
  id: string
  source: string
  target: string
  type: string
  port?: string | null
  protocol?: string | null
  traffic_bytes?: number
  is_used?: boolean
  confidence?: number
}

type DependencyMapPayload = {
  system_name: string
  nodes: MapNode[]
  edges: MapEdge[]
  categories?: Record<string, number>
  data_sources?: Record<string, boolean>
  last_updated?: string
}

type GuidedLane = {
  id: string
  title: string
  description: string
  icon: any
  accent: string
  border: string
  surface: string
  text: string
  nodes: MapNode[]
}

const OBSERVED_EDGE_TYPES = new Set([
  "ACTUAL_TRAFFIC",
  "ACTUAL_API_CALL",
  "ACTUAL_S3_ACCESS",
  "ASSUMES_ROLE_ACTUAL",
  "ACCESSES_RESOURCE",
  "CALLS",
])

function classifyLane(node: MapNode): GuidedLane["id"] {
  const type = (node.type || "").toLowerCase()
  const category = (node.category || "").toLowerCase()

  if (
    node.is_internet_exposed ||
    category === "edge" ||
    category === "networking" ||
    [
      "securitygroup",
      "nacl",
      "vpc",
      "subnet",
      "route53record",
      "route53hostedzone",
      "internetgateway",
      "natgateway",
      "loadbalancer",
      "elb",
      "alb",
      "apigateway",
      "apigatewayrestapi",
      "cloudfrontdistribution",
      "waf",
    ].some((token) => type.includes(token))
  ) {
    return "entry"
  }

  if (
    ["iamrole", "iampolicy", "iamuser", "awsprincipal", "kmskey", "secret", "sts"].some((token) =>
      type.includes(token)
    )
  ) {
    return "identity"
  }

  if (category === "compute" || ["ec2", "lambda", "ecs", "eks", "container", "autoscaling"].some((token) => type.includes(token))) {
    return "compute"
  }

  if (category === "storage" || category === "database" || ["s3", "bucket", "rds", "dynamodb", "aurora", "efs"].some((token) => type.includes(token))) {
    return "data"
  }

  return "signals"
}

function formatEdgeType(type: string) {
  switch (type) {
    case "ACTUAL_TRAFFIC":
      return "Observed traffic"
    case "ACTUAL_API_CALL":
      return "Observed API call"
    case "ACTUAL_S3_ACCESS":
      return "Observed S3 access"
    case "ASSUMES_ROLE_ACTUAL":
      return "Assumes role"
    case "ACCESSES_RESOURCE":
      return "Observed resource access"
    case "CALLS":
      return "Service call"
    default:
      return type.replaceAll("_", " ")
  }
}

function summarizeNode(node: MapNode) {
  const issues = (node.gap_count || 0) + (node.permission_gaps || 0)

  if (node.is_internet_exposed && issues > 0) {
    return "Internet-exposed with active control gaps"
  }

  if (node.is_internet_exposed) {
    return "Internet-exposed entry point"
  }

  if (issues > 0) {
    return `${issues} control gap${issues === 1 ? "" : "s"} to review`
  }

  return "Observed in the current system path"
}

function laneShell(id: GuidedLane["id"]) {
  switch (id) {
    case "entry":
      return {
        accent: "from-amber-500/20 via-orange-500/10 to-transparent",
        border: "border-amber-500/30",
        surface: "bg-amber-500/8",
        text: "text-amber-100",
      }
    case "compute":
      return {
        accent: "from-sky-500/20 via-cyan-500/10 to-transparent",
        border: "border-sky-500/30",
        surface: "bg-sky-500/8",
        text: "text-sky-100",
      }
    case "identity":
      return {
        accent: "from-violet-500/20 via-fuchsia-500/10 to-transparent",
        border: "border-violet-500/30",
        surface: "bg-violet-500/8",
        text: "text-violet-100",
      }
    case "data":
      return {
        accent: "from-emerald-500/20 via-teal-500/10 to-transparent",
        border: "border-emerald-500/30",
        surface: "bg-emerald-500/8",
        text: "text-emerald-100",
      }
    default:
      return {
        accent: "from-slate-500/20 via-slate-400/10 to-transparent",
        border: "border-slate-500/30",
        surface: "bg-slate-500/8",
        text: "text-slate-100",
      }
  }
}

export default function GuidedSystemMap({ systemName }: { systemName: string }) {
  const [data, setData] = useState<DependencyMapPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/proxy/dependency-map/full?systemName=${encodeURIComponent(systemName)}`, {
          cache: "no-store",
        })

        if (!response.ok) {
          throw new Error(`Failed to load guided map (${response.status})`)
        }

        const payload = (await response.json()) as DependencyMapPayload

        if (!cancelled) {
          setData({
            system_name: payload.system_name,
            nodes: payload.nodes || [],
            edges: payload.edges || [],
            categories: payload.categories || {},
            data_sources: payload.data_sources || {},
            last_updated: payload.last_updated,
          })
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load guided map")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [systemName])

  const derived = useMemo(() => {
    const nodes = data?.nodes || []
    const edges = data?.edges || []
    const nodeById = new Map(nodes.map((node) => [node.id, node]))

    const lanes: GuidedLane[] = [
      {
        id: "entry",
        title: "Entry & Network",
        description: "Internet-facing components, network boundaries, and path entry points.",
        icon: Network,
        nodes: [],
        ...laneShell("entry"),
      },
      {
        id: "compute",
        title: "Compute",
        description: "Workloads doing the real work inside the system.",
        icon: Server,
        nodes: [],
        ...laneShell("compute"),
      },
      {
        id: "identity",
        title: "Identity & Trust",
        description: "Roles, principals, and trust controls active in the path.",
        icon: Users,
        nodes: [],
        ...laneShell("identity"),
      },
      {
        id: "data",
        title: "Data",
        description: "Buckets, databases, and stores the system can reach.",
        icon: Database,
        nodes: [],
        ...laneShell("data"),
      },
      {
        id: "signals",
        title: "Signals & Controls",
        description: "Supporting services, findings, and control-plane context.",
        icon: Shield,
        nodes: [],
        ...laneShell("signals"),
      },
    ]

    const laneMap = new Map(lanes.map((lane) => [lane.id, lane]))

    for (const node of nodes) {
      laneMap.get(classifyLane(node))?.nodes.push(node)
    }

    for (const lane of lanes) {
      lane.nodes.sort((a, b) => {
        const aScore = (a.is_internet_exposed ? 100 : 0) + (a.gap_count || 0) + (a.permission_gaps || 0)
        const bScore = (b.is_internet_exposed ? 100 : 0) + (b.gap_count || 0) + (b.permission_gaps || 0)
        return bScore - aScore || a.name.localeCompare(b.name)
      })
    }

    const observedEdges = edges
      .filter((edge) => OBSERVED_EDGE_TYPES.has(edge.type))
      .map((edge) => {
        const source = nodeById.get(edge.source)
        const target = nodeById.get(edge.target)
        return {
          ...edge,
          sourceName: source?.name || edge.source,
          targetName: target?.name || edge.target,
        }
      })
      .sort((a, b) => (b.traffic_bytes || 0) - (a.traffic_bytes || 0))

    const riskNodes = nodes
      .filter((node) => node.is_internet_exposed || (node.gap_count || 0) > 0 || (node.permission_gaps || 0) > 0)
      .sort((a, b) => {
        const aScore = (a.is_internet_exposed ? 100 : 0) + (a.gap_count || 0) + (a.permission_gaps || 0)
        const bScore = (b.is_internet_exposed ? 100 : 0) + (b.gap_count || 0) + (b.permission_gaps || 0)
        return bScore - aScore
      })

    const sources = data?.data_sources || {}
    const enabledSources = Object.entries(sources)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key.replaceAll("_", " "))

    return {
      lanes,
      observedEdges,
      riskNodes,
      enabledSources,
    }
  }, [data])

  if (isLoading) {
    return (
      <div className="rounded-[28px] border border-slate-800 bg-slate-950 p-8 text-slate-200">
        <div className="flex min-h-[420px] items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
          <span>Loading guided system map...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[28px] border border-rose-500/30 bg-slate-950 p-8 text-slate-100">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-300" />
          <div>
            <p className="font-semibold">Guided map failed to load</p>
            <p className="mt-1 text-sm text-slate-300">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  const totalObserved = derived.observedEdges.length
  const totalRiskNodes = derived.riskNodes.length

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 text-slate-100 shadow-[0_20px_70px_rgba(15,23,42,0.45)]">
        <div className="border-b border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(250,204,21,0.12),_transparent_30%),linear-gradient(180deg,#0f172a_0%,#020617_100%)] p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" />
                Guided System Map
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">A clearer read of how {systemName} hangs together</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                This view uses the same dependency-map backend data as the existing diagram, but it tells the story in lanes:
                where traffic enters, what runs the workload, which identities it trusts, and what data it reaches.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Nodes</div>
                <div className="mt-2 text-2xl font-semibold text-white">{data?.nodes.length || 0}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Observed Links</div>
                <div className="mt-2 text-2xl font-semibold text-white">{totalObserved}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Risk Nodes</div>
                <div className="mt-2 text-2xl font-semibold text-white">{totalRiskNodes}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Sources</div>
                <div className="mt-2 text-sm font-medium text-slate-200">
                  {derived.enabledSources.slice(0, 2).join(" • ") || "Neo4j graph"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-b border-slate-800 p-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Eye className="h-4 w-4 text-cyan-300" />
              How to read it
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Start on the left with entry and network exposure, then follow the workload into compute, identity, and data.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Shield className="h-4 w-4 text-emerald-300" />
              Same data, calmer framing
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              This does not replace the current dependency diagram. It simply reorganizes the same backend payload into a view that is easier to explain.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              What to focus on first
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Anything internet-exposed or carrying permission/control gaps is floated to the top of each lane automatically.
            </p>
          </div>
        </div>

        <div className="grid gap-4 p-6 xl:grid-cols-5">
          {derived.lanes.map((lane, index) => {
            const Icon = lane.icon
            const visibleNodes = lane.nodes.slice(0, 6)
            return (
              <div key={lane.id} className={`relative overflow-hidden rounded-[24px] border ${lane.border} bg-gradient-to-b ${lane.accent} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${lane.border} ${lane.surface}`}>
                      <Icon className={`h-5 w-5 ${lane.text}`} />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-white">{lane.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-300">{lane.description}</p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200">
                    {lane.nodes.length}
                  </div>
                </div>

                {index < derived.lanes.length - 1 && (
                  <div className="pointer-events-none absolute -right-3 top-9 hidden h-px w-6 bg-slate-700 xl:block">
                    <ArrowRight className="absolute -right-1 -top-2 h-4 w-4 text-slate-500" />
                  </div>
                )}

                <div className="mt-5 space-y-3">
                  {visibleNodes.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 px-3 py-4 text-sm text-slate-400">
                      No matching nodes in this lane yet.
                    </div>
                  )}

                  {visibleNodes.map((node) => {
                    const issues = (node.gap_count || 0) + (node.permission_gaps || 0)
                    return (
                      <div key={node.id} className="rounded-2xl border border-white/10 bg-slate-950/55 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">{node.name}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{node.type}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {node.is_internet_exposed && (
                              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-200">
                                Exposed
                              </span>
                            )}
                            {issues > 0 && (
                              <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-rose-200">
                                {issues} gaps
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-2 text-sm leading-5 text-slate-300">{summarizeNode(node)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Observed paths</h3>
              <p className="mt-1 text-sm text-slate-600">These are the strongest observed relationships in the current payload, shown as simple source-to-target steps.</p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-600">
              Top {Math.min(8, derived.observedEdges.length)}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {derived.observedEdges.slice(0, 8).map((edge) => (
              <div key={edge.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className="truncate">{edge.sourceName}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate">{edge.targetName}</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {formatEdgeType(edge.type)}
                      {edge.protocol ? ` • ${edge.protocol}` : ""}
                      {edge.port ? ` • ${edge.port}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-slate-500">
                    <span className="rounded-full bg-white px-2.5 py-1">{edge.traffic_bytes || 0} signal</span>
                    <span className="rounded-full bg-white px-2.5 py-1">{Math.round((edge.confidence || 0) * 100)}% confidence</span>
                  </div>
                </div>
              </div>
            ))}

            {derived.observedEdges.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                No observed edges were returned in the dependency payload for this system yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">What deserves attention first</h3>
          <p className="mt-1 text-sm text-slate-600">This is the short list a human can actually act on before diving into the full graph.</p>

          <div className="mt-5 space-y-3">
            {derived.riskNodes.slice(0, 8).map((node) => (
              <div key={node.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{node.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{node.type}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {node.is_internet_exposed && (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-700">
                        Internet
                      </span>
                    )}
                    {((node.gap_count || 0) + (node.permission_gaps || 0)) > 0 && (
                      <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-rose-700">
                        {(node.gap_count || 0) + (node.permission_gaps || 0)} gaps
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-600">{summarizeNode(node)}</p>
              </div>
            ))}

            {derived.riskNodes.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                Nothing is currently flagged as exposed or gap-carrying in the dependency payload.
              </div>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Freshness</div>
            <div className="mt-2 text-sm font-medium text-slate-900">{data?.last_updated || "Unknown"}</div>
            <div className="mt-1 text-sm text-slate-600">
              Active sources: {derived.enabledSources.join(", ") || "No source metadata returned"}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
