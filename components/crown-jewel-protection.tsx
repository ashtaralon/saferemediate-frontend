"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  Database,
  Loader2,
  Network,
  Skull,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react"

type CrownJewel = {
  resourceId: string
  resourceName: string
  resourceType: string
  category?: string
  priorityScore: number
  pathCount: number
  observedSignals: number
  lpGapCount: number
  severity: string
  sensitivitySource: string
  sensitivityReason: string
  isInternetExposed: boolean
}

type PathSegment = {
  resourceId: string
  resourceName: string
  resourceType: string
  category?: string
  isInternetExposed?: boolean
  edgeLabel?: string | null
  edgeType?: string | null
}

type PathItem = {
  id: string
  title: string
  segments: PathSegment[]
  observedEvidence: {
    observedLinks: number
    observedEdgeTypes: string[]
    protocols: string[]
    signals: string[]
    entryExposed: boolean
  }
}

type PrimaryPathSegment = {
  plane: string
  resourceId: string
  resourceName: string
  resourceType: string
  subtitle?: string
  edgeLabel?: string | null
  edgeType?: string | null
  isInternetExposed?: boolean
}

type PlaneAssessment = {
  plane: string
  score: number
  riskLevel: string
  summary: string
  drivers: string[]
}

type RiskFormula = {
  overallScore: number
  riskLevel: string
  formula: string
  identity: { score: number; factors: string[] }
  networking: { score: number; factors: string[] }
  data: { score: number; factors: string[] }
  confidence: { score: number; factors: string[] }
}

type MitigationItem = {
  plane: string
  priority: number
  resourceType: string
  resourceName: string
  resourceId: string
  title: string
  summary: string
  evidence: string
  severity: string
  recommendedAction: string
  ctaTab?: string
}

type SelectedDetail = {
  resourceId: string
  resourceName: string
  resourceType: string
  category?: string
  priorityScore: number
  sensitivitySource: string
  sensitivityReason: string
  paths: PathItem[]
  evidence: {
    observationDays: number
    observedPrincipals: string[]
    pathCount: number
    lpSeverity: string
    lpGapCount: number
  }
  primaryPath: {
    title: string
    segments: PrimaryPathSegment[]
    observedEvidence: {
      observedLinks: number
      observedEdgeTypes: string[]
      protocols: string[]
      signals: string[]
      entryExposed: boolean
    }
  }
  planeAssessments: PlaneAssessment[]
  riskFormula: RiskFormula
  mitigationPlan: MitigationItem[]
  recommendedFirstAction?: MitigationItem | null
}

type CrownJewelResponse = {
  systemName: string
  observationDays: number
  crownJewels: CrownJewel[]
  selectedId?: string | null
  selected?: SelectedDetail | null
  error?: string
}

function severityTone(severity: string) {
  switch ((severity || "").toUpperCase()) {
    case "CRITICAL":
      return "border-rose-300 bg-rose-50 text-rose-700"
    case "HIGH":
      return "border-orange-300 bg-orange-50 text-orange-700"
    case "MEDIUM":
      return "border-amber-300 bg-amber-50 text-amber-700"
    default:
      return "border-slate-300 bg-slate-50 text-slate-700"
  }
}

function planeIcon(plane: string) {
  switch (plane) {
    case "Privilege":
      return Users
    case "Network":
      return Network
    default:
      return Database
  }
}

function getPlaneAccent(plane: string) {
  switch (plane) {
    case "Identity":
      return "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700"
    case "Networking":
      return "border-orange-300 bg-orange-50 text-orange-700"
    case "Data":
      return "border-violet-300 bg-violet-50 text-violet-700"
    case "Workload":
      return "border-sky-300 bg-sky-50 text-sky-700"
    default:
      return "border-slate-300 bg-slate-50 text-slate-700"
  }
}

export default function CrownJewelProtection({
  systemName,
  onOpenLeastPrivilege,
}: {
  systemName: string
  onOpenLeastPrivilege?: () => void
}) {
  const [data, setData] = useState<CrownJewelResponse | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(targetId?: string | null) {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          systemName,
          observationDays: "365",
        })
        if (targetId) {
          params.set("targetId", targetId)
        }

        const response = await fetch(`/api/proxy/crown-jewels/protection-plan?${params.toString()}`, {
          cache: "no-store",
        })
        const payload = (await response.json()) as CrownJewelResponse

        if (cancelled) return

        if (payload.error) {
          setError(payload.error)
        }

        setData(payload)
        setSelectedId(payload.selectedId || targetId || null)
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load crown jewel protection")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    load(selectedId)
    return () => {
      cancelled = true
    }
  }, [systemName, selectedId])

  const groupedPlan = useMemo(() => {
    const groups = new Map<string, MitigationItem[]>()
    const items = data?.selected?.mitigationPlan || []
    for (const item of items) {
      const current = groups.get(item.plane) || []
      current.push(item)
      groups.set(item.plane, current)
    }
    return Array.from(groups.entries())
  }, [data])

  if (isLoading && !data) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex min-h-[420px] items-center justify-center gap-3 text-slate-600">
          <Loader2 className="h-6 w-6 animate-spin text-[#2D51DA]" />
          <span>Loading crown jewel protection...</span>
        </div>
      </div>
    )
  }

  if (error && !data?.crownJewels?.length) {
    return (
      <div className="rounded-[28px] border border-rose-200 bg-white p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-500" />
          <div>
            <p className="font-semibold text-slate-900">Crown Jewel Protection failed to load</p>
            <p className="mt-1 text-sm text-slate-600">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  const selected = data?.selected

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_55%,#1d4ed8_100%)] px-8 py-8 text-white">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-sky-100">
                <ShieldAlert className="h-3.5 w-3.5" />
                Crown Jewel Protection
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">Protect the data that matters first</h2>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                Start from a likely crown jewel, trace how an attacker can reach it through the behavioral graph,
                then prioritize micro-enforcement across privilege, network, and data access.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-300">Crown Jewels</div>
                <div className="mt-2 text-2xl font-semibold">{data?.crownJewels?.length || 0}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-300">Selected Paths</div>
                <div className="mt-2 text-2xl font-semibold">{selected?.evidence?.pathCount || 0}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-300">LP Gaps On Path</div>
                <div className="mt-2 text-2xl font-semibold">{selected?.evidence?.lpGapCount || 0}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-300">Window</div>
                <div className="mt-2 text-sm font-semibold">{data?.observationDays || 365} day behavioral view</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[340px_1fr]">
          <aside className="border-b border-slate-200 xl:border-b-0 xl:border-r">
            <div className="p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Likely crown jewels</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Pick the data asset you want to protect first. We rank these from behavior, reachability, and control gaps.
              </p>
            </div>

            <div className="max-h-[900px] space-y-3 overflow-y-auto px-4 pb-4">
              {(data?.crownJewels || []).map((jewel) => {
                const active = jewel.resourceId === selectedId
                return (
                  <button
                    key={jewel.resourceId}
                    onClick={() => setSelectedId(jewel.resourceId)}
                    className={`w-full rounded-[22px] border p-4 text-left transition ${
                      active
                        ? "border-[#2D51DA] bg-[#2D51DA]/5 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{jewel.resourceName}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{jewel.resourceType}</div>
                      </div>
                      <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {jewel.priorityScore}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${severityTone(jewel.severity)}`}>
                        {jewel.severity}
                      </span>
                      {jewel.isInternetExposed && (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-700">
                          Exposed
                        </span>
                      )}
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-600">{jewel.sensitivityReason}</p>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
                      <div className="rounded-xl bg-slate-50 px-2 py-2">
                        <div className="font-medium text-slate-900">{jewel.pathCount}</div>
                        <div>paths</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-2 py-2">
                        <div className="font-medium text-slate-900">{jewel.observedSignals}</div>
                        <div>signals</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-2 py-2">
                        <div className="font-medium text-slate-900">{jewel.lpGapCount}</div>
                        <div>LP gaps</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </aside>

          <div className="p-6 lg:p-8">
            {!selected && (
              <div className="rounded-[24px] border border-dashed border-slate-300 px-6 py-12 text-center text-slate-500">
                No crown jewel selected yet.
              </div>
            )}

            {selected && (
              <div className="space-y-6">
                <section className="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 text-white shadow-[0_20px_70px_rgba(15,23,42,0.35)]">
                  <div className="border-b border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(244,63,94,0.16),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.16),_transparent_30%),linear-gradient(180deg,#0f172a_0%,#020617_100%)] px-6 py-6">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-200">
                          <Skull className="h-3.5 w-3.5 text-rose-300" />
                          Identity / Data / Networking Path
                        </div>
                        <h3 className="mt-4 text-3xl font-semibold">{selected.resourceName}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {selected.sensitivitySource}: {selected.sensitivityReason}
                        </p>
                      </div>

                      <div className="rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-5 py-4">
                        <div className="flex items-center gap-4">
                          <div className="text-4xl font-bold text-rose-300">{selected.riskFormula.overallScore}</div>
                          <div>
                            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-rose-200">
                              {selected.riskFormula.riskLevel} risk
                            </div>
                            <div className="mt-1 text-xs text-slate-300">
                              {selected.primaryPath.segments.length} stages • {selected.evidence.pathCount} candidate paths
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="rounded-[24px] border border-slate-800 bg-slate-900/80 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-lg font-semibold text-white">{selected.primaryPath.title}</h4>
                          <p className="mt-1 text-sm text-slate-400">
                            Assume breach: this is the clearest identity/network/data route to the selected crown jewel.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                            {selected.primaryPath.observedEvidence.observedLinks} observed links
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                            {selected.evidence.observedPrincipals.length} principals
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 overflow-x-auto">
                        <div className="flex min-w-max items-start gap-4">
                          {selected.primaryPath.segments.map((segment, index) => (
                            <div key={`${segment.resourceId}-${index}`} className="flex items-start gap-4">
                              <div className={`w-[230px] rounded-[22px] border p-4 ${getPlaneAccent(segment.plane)}`}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-700">
                                    {segment.plane}
                                  </span>
                                  <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-700">
                                    {segment.resourceType}
                                  </span>
                                </div>
                                <div className="mt-3 text-base font-semibold text-slate-900">{segment.resourceName}</div>
                                <div className="mt-2 text-sm text-slate-700">{segment.subtitle}</div>
                                {segment.edgeLabel && (
                                  <div className="mt-3 rounded-2xl bg-white/70 px-3 py-2 text-xs leading-5 text-slate-700">
                                    {segment.edgeLabel}
                                  </div>
                                )}
                              </div>
                              {index < selected.primaryPath.segments.length - 1 && (
                                <div className="flex h-[132px] items-center">
                                  <ArrowRight className="h-6 w-6 text-slate-500" />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-300">
                        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">
                          Behavioral confidence {selected.riskFormula.confidence.score}
                        </span>
                        {selected.primaryPath.observedEvidence.protocols.length > 0 && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                            Protocols: {selected.primaryPath.observedEvidence.protocols.join(", ")}
                          </span>
                        )}
                        {selected.primaryPath.observedEvidence.signals.length > 0 && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                            Signals: {selected.primaryPath.observedEvidence.signals.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 xl:grid-cols-4">
                      <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                        <div className="text-sm font-semibold text-white">Risk formula</div>
                        <div className="mt-3 rounded-2xl bg-slate-900/80 px-3 py-3 text-sm text-slate-300">
                          {selected.riskFormula.formula}
                        </div>
                      </div>

                      {selected.planeAssessments.map((plane) => (
                        <div key={plane.plane} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-white">{plane.plane}</div>
                            <div className="text-2xl font-bold text-white">{plane.score}</div>
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">{plane.riskLevel} risk</div>
                          <p className="mt-3 text-sm leading-6 text-slate-300">{plane.summary}</p>
                          <div className="mt-3 space-y-2">
                            {plane.drivers.map((driver) => (
                              <div key={driver} className="rounded-2xl bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
                                {driver}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {selected.recommendedFirstAction && (
                      <div className="mt-6 rounded-[22px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-4">
                        <div className="flex items-start gap-3">
                          <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-emerald-100">Recommended first micro-enforcement</div>
                            <div className="mt-1 text-sm text-emerald-200">{selected.recommendedFirstAction.title}</div>
                            <div className="mt-1 text-sm text-emerald-100/80">{selected.recommendedFirstAction.summary}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h4 className="text-lg font-semibold text-slate-900">Micro-enforcement plan</h4>
                      <p className="mt-1 text-sm text-slate-600">
                        We break the path down by control plane so the customer can understand what to enforce first.
                      </p>
                    </div>
                    {onOpenLeastPrivilege && (
                      <button
                        onClick={onOpenLeastPrivilege}
                        className="inline-flex items-center justify-center rounded-full border border-[#2D51DA]/20 bg-[#2D51DA]/10 px-4 py-2 text-sm font-medium text-[#2D51DA] transition hover:bg-[#2D51DA]/15"
                      >
                        Open Least Privilege
                      </button>
                    )}
                  </div>

                  <div className="mt-5 space-y-6">
                    {groupedPlan.map(([plane, items]) => {
                      const PlaneIcon = planeIcon(plane)
                      return (
                        <div key={plane} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center gap-2">
                            <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                              <PlaneIcon className="h-5 w-5 text-slate-700" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{plane}</div>
                              <div className="text-sm text-slate-500">{items.length} action{items.length === 1 ? "" : "s"} in this plane</div>
                            </div>
                          </div>

                          <div className="mt-4 space-y-3">
                            {items.map((item) => (
                              <div key={`${plane}-${item.resourceId}-${item.title}`} className="rounded-[20px] border border-slate-200 bg-white p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600">
                                        {item.resourceType}
                                      </span>
                                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${severityTone(item.severity)}`}>
                                        {item.severity}
                                      </span>
                                    </div>
                                    <div className="mt-3 text-sm font-semibold text-slate-900">{item.title}</div>
                                    <div className="mt-2 text-sm text-slate-600">{item.summary}</div>
                                  </div>
                                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                    Priority {item.priority}
                                  </div>
                                </div>

                                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                  <div className="rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-600">
                                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Why this matters</div>
                                    <div className="mt-2">{item.evidence}</div>
                                  </div>
                                  <div className="rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-600">
                                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Recommended action</div>
                                    <div className="mt-2">{item.recommendedAction}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
