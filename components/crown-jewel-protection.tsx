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
import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"
import { S3PolicyAnalysisModal } from "@/components/s3-policy-analysis-modal"
import { SGLeastPrivilegeModal } from "@/components/sg-least-privilege-modal"

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

type LPResource = {
  id: string
  resourceType: "IAMRole" | "SecurityGroup" | "S3Bucket" | "NetworkACL"
  resourceName: string
  resourceArn: string
  remediatedAt?: string
  snapshotId?: string | null
  eventId?: string | null
  rollbackAvailable?: boolean
  lpScore: number | null
  allowedCount: number
  usedCount: number | null
  gapCount: number | null
  gapPercent: number | null
  allowedList: string[]
  usedList: string[]
  unusedList: string[]
  highRiskUnused: Array<{
    permission: string
    riskLevel: "CRITICAL" | "HIGH" | "MEDIUM"
    reason: string
  }>
  evidence: {
    dataSources: string[]
    observationDays: number
    confidence: "HIGH" | "MEDIUM" | "LOW"
    coverage: {
      regions: string[]
      complete: boolean
    }
  }
  severity: "critical" | "high" | "medium" | "low"
  confidence: number
  observationDays: number
  title: string
  description: string
  remediation: string
  region?: string
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

function resourceTypeTone(resourceType: string) {
  switch (resourceType) {
    case "S3Bucket":
    case "S3":
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    case "DynamoDB":
    case "DynamoDBTable":
      return "border-cyan-200 bg-cyan-50 text-cyan-700"
    case "RDS":
    case "RDSInstance":
    case "RDSCluster":
    case "AuroraCluster":
      return "border-indigo-200 bg-indigo-50 text-indigo-700"
    case "IAMRole":
      return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
    case "SecurityGroup":
      return "border-amber-200 bg-amber-50 text-amber-700"
    default:
      return "border-slate-200 bg-slate-50 text-slate-700"
  }
}

function riskTone(riskLevel: string) {
  switch ((riskLevel || "").toLowerCase()) {
    case "critical":
      return "border-rose-200 bg-rose-50 text-rose-700"
    case "high":
      return "border-orange-200 bg-orange-50 text-orange-700"
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700"
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
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
  const [lpResources, setLpResources] = useState<LPResource[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [iamModalOpen, setIamModalOpen] = useState(false)
  const [selectedIAMRole, setSelectedIAMRole] = useState<string | null>(null)
  const [s3ModalOpen, setS3ModalOpen] = useState(false)
  const [selectedS3Bucket, setSelectedS3Bucket] = useState<string | null>(null)
  const [selectedS3Resource, setSelectedS3Resource] = useState<LPResource | null>(null)
  const [sgModalOpen, setSgModalOpen] = useState(false)
  const [selectedSGId, setSelectedSGId] = useState<string | null>(null)
  const [selectedSGName, setSelectedSGName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(targetId?: string | null) {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({ systemName, observationDays: "365" })
        if (targetId) params.set("targetId", targetId)

        const [crownRes, lpRes] = await Promise.all([
          fetch(`/api/proxy/crown-jewels/protection-plan?${params.toString()}`, { cache: "no-store" }),
          fetch(`/api/proxy/least-privilege/issues?systemName=${encodeURIComponent(systemName)}`, { cache: "no-store" }),
        ])

        const payload = (await crownRes.json()) as CrownJewelResponse
        const lpPayload = await lpRes.json().catch(() => ({ resources: [] }))

        if (cancelled) return

        if (payload.error) {
          setError(payload.error)
        }

        setData(payload)
        setLpResources(Array.isArray(lpPayload?.resources) ? lpPayload.resources : [])
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
  }, [systemName, selectedId, refreshNonce])

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

  const openResourceReview = ({
    resourceName,
    resourceType,
    resourceId,
  }: {
    resourceName: string
    resourceType: string
    resourceId: string
  }) => {
    const matchingResource = lpResources.find((resource) => {
      return (
        resource.resourceName === resourceName ||
        resource.id === resourceId ||
        resource.resourceArn === resourceId
      )
    })

    const resolvedResourceType = matchingResource?.resourceType || resourceType

    if (resolvedResourceType === "IAMRole") {
      setSelectedIAMRole(matchingResource?.resourceName || resourceName)
      setIamModalOpen(true)
      return
    }

    if (resolvedResourceType === "S3Bucket") {
      setSelectedS3Bucket(matchingResource?.resourceName || resourceName)
      setSelectedS3Resource(matchingResource || null)
      setS3ModalOpen(true)
      return
    }

    if (resolvedResourceType === "SecurityGroup") {
      const sgId =
        matchingResource?.id?.startsWith("sg-")
          ? matchingResource.id
          : resourceId?.startsWith("sg-")
            ? resourceId
            : matchingResource?.resourceName?.startsWith("sg-")
              ? matchingResource.resourceName
              : null

      setSelectedSGId(sgId)
      setSelectedSGName(matchingResource?.resourceName || resourceName)
      setSgModalOpen(true)
    }
  }

  const handleResourceReview = (segment: PrimaryPathSegment) => {
    openResourceReview({
      resourceName: segment.resourceName,
      resourceType: segment.resourceType,
      resourceId: segment.resourceId,
    })
  }

  const isActionableSegment = (segment: PrimaryPathSegment) =>
    ["IAMRole", "S3Bucket", "SecurityGroup"].includes(segment.resourceType)

  const isActionablePathSegment = (segment: PathSegment) =>
    ["IAMRole", "S3Bucket", "SecurityGroup"].includes(segment.resourceType)

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
  const selectedPaths = selected?.paths || []

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(148,163,184,0.16)]">
        <div className="border-b border-[#dbe4f3] bg-[linear-gradient(135deg,#fffdf8_0%,#f5f9ff_42%,#e8f0ff_100%)] px-8 py-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#cdd8f5] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-[#2D51DA] shadow-sm">
                <ShieldAlert className="h-3.5 w-3.5" />
                Crown Jewel Protection
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">Map every crown jewel and every route to it</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                This tab is now the home for crown-jewel paths. Start from the protected data asset, review every mapped route to it,
                and then prioritize identity, network, and data micro-enforcement in one place.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-[22px] border border-white bg-white/90 px-4 py-3 shadow-sm">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Crown Jewels</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{data?.crownJewels?.length || 0}</div>
              </div>
              <div className="rounded-[22px] border border-white bg-white/90 px-4 py-3 shadow-sm">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Mapped Routes</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{selected?.evidence?.pathCount || 0}</div>
              </div>
              <div className="rounded-[22px] border border-white bg-white/90 px-4 py-3 shadow-sm">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">LP Gaps On Path</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{selected?.evidence?.lpGapCount || 0}</div>
              </div>
              <div className="rounded-[22px] border border-white bg-white/90 px-4 py-3 shadow-sm">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Window</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{data?.observationDays || 365} day behavioral view</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[340px_1fr]">
          <aside className="border-b border-[#e6edf7] bg-[linear-gradient(180deg,#fbfdff_0%,#f8fbff_100%)] xl:border-b-0 xl:border-r">
            <div className="p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Crown jewels</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Pick the data asset you want to protect first. The tab now keeps the full route list here with the selected crown jewel.
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
                        ? "border-[#2D51DA]/40 bg-[linear-gradient(135deg,#eef4ff_0%,#f8fbff_100%)] shadow-[0_14px_30px_rgba(45,81,218,0.12)]"
                        : "border-slate-200 bg-white hover:border-[#c9d7f5] hover:bg-[#fbfdff]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{jewel.resourceName}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{jewel.resourceType}</div>
                      </div>
                      <div className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
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
                      <div className="rounded-xl border border-slate-200 bg-white px-2 py-2">
                        <div className="font-medium text-slate-900">{jewel.pathCount}</div>
                        <div>paths</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-2 py-2">
                        <div className="font-medium text-slate-900">{jewel.observedSignals}</div>
                        <div>signals</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-2 py-2">
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
                <section className="overflow-hidden rounded-[30px] border border-[#dbe4f3] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] shadow-[0_18px_60px_rgba(148,163,184,0.18)]">
                  <div className="border-b border-[#e5ebf5] bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.10),_transparent_28%),linear-gradient(135deg,#fffdf8_0%,#f7faff_55%,#eef4ff_100%)] px-6 py-6">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-[#d6e0f5] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-[#2D51DA] shadow-sm">
                          <Skull className="h-3.5 w-3.5 text-[#2D51DA]" />
                          Crown jewel route mapping
                        </div>
                        <h3 className="mt-4 text-3xl font-semibold text-slate-900">{selected.resourceName}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {selected.sensitivitySource}: {selected.sensitivityReason}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] ${resourceTypeTone(selected.resourceType)}`}>
                            {selected.resourceType}
                          </span>
                          <span className={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] ${severityTone(selected.evidence.lpSeverity)}`}>
                            {selected.evidence.lpSeverity} LP severity
                          </span>
                          {selectedPaths.length > 0 && (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-sky-700">
                              {selectedPaths.length} mapped routes
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-white bg-white/90 px-5 py-4 shadow-[0_16px_32px_rgba(45,81,218,0.10)]">
                        <div className="flex items-center gap-4">
                          <div className="text-4xl font-bold text-slate-900">{selected.riskFormula.overallScore}</div>
                          <div>
                            <div className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${riskTone(selected.riskFormula.riskLevel)}`}>
                              {selected.riskFormula.riskLevel} risk
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              {selected.primaryPath.segments.length} stages • {selected.evidence.pathCount} mapped routes
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Mapped routes</div>
                        <div className="mt-3 text-3xl font-semibold text-slate-900">{selectedPaths.length}</div>
                      </div>
                      <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Observed links</div>
                        <div className="mt-3 text-3xl font-semibold text-slate-900">{selected.primaryPath.observedEvidence.observedLinks}</div>
                      </div>
                      <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Observed principals</div>
                        <div className="mt-3 text-3xl font-semibold text-slate-900">{selected.evidence.observedPrincipals.length}</div>
                      </div>
                      <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">LP gaps on route</div>
                        <div className="mt-3 text-3xl font-semibold text-slate-900">{selected.evidence.lpGapCount}</div>
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-[#dbe4f3] bg-[linear-gradient(180deg,#ffffff_0%,#f9fbff_100%)] p-5 shadow-sm">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <h4 className="text-xl font-semibold text-slate-900">Mapped routes to this crown jewel</h4>
                          <p className="mt-1 text-sm text-slate-600">
                            Every route is shown here. The recommended route is still highlighted below, but this list is now the main paths view.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
                            Behavioral confidence {selected.riskFormula.confidence.score}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-600">
                            Click IAM / S3 / SG nodes to remediate
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 xl:grid-cols-2">
                        {selectedPaths.map((path, pathIndex) => (
                          <div
                            key={path.id}
                            className={`rounded-[24px] border p-4 transition ${
                              pathIndex === 0
                                ? "border-[#2D51DA]/25 bg-[#f5f8ff]"
                                : "border-slate-200 bg-white"
                            }`}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full border border-[#d6e0f5] bg-white px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[#2D51DA]">
                                    {path.title}
                                  </span>
                                  {path.observedEvidence.entryExposed && (
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-amber-700">
                                      public entry
                                    </span>
                                  )}
                                </div>
                                <div className="mt-3 text-sm font-semibold text-slate-900">
                                  {path.segments[0]?.resourceName || "Entry"} to {selected.resourceName}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                  {path.segments.length} stages
                                </span>
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                  {path.observedEvidence.observedLinks} observed
                                </span>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-2">
                              {path.segments.map((segment, index) => (
                                <div key={`${path.id}-${segment.resourceId}-${index}`} className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={!isActionablePathSegment(segment)}
                                    onClick={() =>
                                      openResourceReview({
                                        resourceName: segment.resourceName,
                                        resourceType: segment.resourceType,
                                        resourceId: segment.resourceId,
                                      })
                                    }
                                    className={`rounded-full border px-3 py-2 text-left text-xs font-medium transition ${
                                      isActionablePathSegment(segment)
                                        ? `${resourceTypeTone(segment.resourceType)} hover:shadow-sm`
                                        : "border-slate-200 bg-slate-50 text-slate-600"
                                    }`}
                                  >
                                    <span className="block text-[10px] uppercase tracking-[0.16em] opacity-70">{segment.resourceType}</span>
                                    <span className="block max-w-[180px] truncate">{segment.resourceName}</span>
                                  </button>
                                  {index < path.segments.length - 1 && <ArrowRight className="h-4 w-4 text-slate-400" />}
                                </div>
                              ))}
                            </div>

                            {(path.observedEvidence.protocols.length > 0 || path.observedEvidence.signals.length > 0) && (
                              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
                                {path.observedEvidence.protocols.length > 0 && (
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                    Protocols: {path.observedEvidence.protocols.join(", ")}
                                  </span>
                                )}
                                {path.observedEvidence.signals.length > 0 && (
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                    Signals: {path.observedEvidence.signals.join(", ")}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-[#dbe4f3] bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-xl font-semibold text-slate-900">Recommended primary route</h4>
                          <p className="mt-1 text-sm text-slate-600">
                            This is the clearest identity, network, and data route to the selected crown jewel.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                            {selected.primaryPath.observedEvidence.observedLinks} observed links
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                            {selected.evidence.observedPrincipals.length} principals
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                          Live Observed Traffic
                        </span>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                          Zero-Trust Model: Assume Breach
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                          Click Identity / Networking / Data to open remediation
                        </span>
                      </div>

                      <div className="mt-5 overflow-x-auto">
                        <div className="flex min-w-max items-start gap-4">
                          {selected.primaryPath.segments.map((segment, index) => (
                            <div key={`${segment.resourceId}-${index}`} className="flex items-start gap-4">
                              <button
                                type="button"
                                disabled={!isActionableSegment(segment)}
                                onClick={() => handleResourceReview(segment)}
                                className={`w-[230px] rounded-[22px] border p-4 text-left transition ${
                                  isActionableSegment(segment)
                                    ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(148,163,184,0.20)]"
                                    : "cursor-default opacity-90"
                                } ${getPlaneAccent(segment.plane)}`}
                              >
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
                                <div className="mt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-700/80">
                                  {isActionableSegment(segment) ? "Click to review and remediate" : "Context only"}
                                </div>
                              </button>
                              {index < selected.primaryPath.segments.length - 1 && (
                                <div className="flex h-[132px] items-center">
                                  <ArrowRight className="h-6 w-6 text-slate-500" />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-600">
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                          Behavioral confidence {selected.riskFormula.confidence.score}
                        </span>
                        {selected.primaryPath.observedEvidence.protocols.length > 0 && (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                            Protocols: {selected.primaryPath.observedEvidence.protocols.join(", ")}
                          </span>
                        )}
                        {selected.primaryPath.observedEvidence.signals.length > 0 && (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                            Signals: {selected.primaryPath.observedEvidence.signals.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 xl:grid-cols-4">
                      <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-sm font-semibold text-slate-900">Risk formula</div>
                        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                          {selected.riskFormula.formula}
                        </div>
                      </div>

                      {selected.planeAssessments.map((plane) => (
                        <div key={plane.plane} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-slate-900">{plane.plane}</div>
                            <div className="text-2xl font-bold text-slate-900">{plane.score}</div>
                          </div>
                          <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${riskTone(plane.riskLevel)}`}>{plane.riskLevel} risk</div>
                          <p className="mt-3 text-sm leading-6 text-slate-600">{plane.summary}</p>
                          <div className="mt-3 space-y-2">
                            {plane.drivers.map((driver) => (
                              <div key={driver} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                {driver}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {selected.recommendedFirstAction && (
                      <div className="mt-6 rounded-[22px] border border-emerald-200 bg-[linear-gradient(135deg,#f0fdf4_0%,#ecfdf3_100%)] px-4 py-4">
                        <div className="flex items-start gap-3">
                          <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-emerald-800">Recommended first micro-enforcement</div>
                            <div className="mt-1 text-sm text-emerald-700">{selected.recommendedFirstAction.title}</div>
                            <div className="mt-1 text-sm text-emerald-700/90">{selected.recommendedFirstAction.summary}</div>
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

      <IAMPermissionAnalysisModal
        isOpen={iamModalOpen}
        onClose={() => {
          setIamModalOpen(false)
          setSelectedIAMRole(null)
        }}
        roleName={selectedIAMRole || ""}
        systemName={systemName || ""}
        onApplyFix={() => {}}
        onRemediationSuccess={() => {
          setRefreshNonce((value) => value + 1)
        }}
        onRollbackSuccess={() => {
          setRefreshNonce((value) => value + 1)
        }}
      />

      <S3PolicyAnalysisModal
        isOpen={s3ModalOpen}
        onClose={() => {
          setS3ModalOpen(false)
          setSelectedS3Bucket(null)
          setSelectedS3Resource(null)
        }}
        bucketName={selectedS3Bucket || ""}
        systemName={systemName || ""}
        resourceData={selectedS3Resource}
        onApplyFix={() => {}}
        onRemediationSuccess={() => {
          setRefreshNonce((value) => value + 1)
        }}
      />

      <SGLeastPrivilegeModal
        isOpen={sgModalOpen}
        onClose={() => {
          setSgModalOpen(false)
          setSelectedSGId(null)
          setSelectedSGName(null)
        }}
        sgId={selectedSGId || ""}
        sgName={selectedSGName || undefined}
        systemName={systemName || ""}
        onRemediate={() => {
          setRefreshNonce((value) => value + 1)
        }}
      />
    </div>
  )
}
