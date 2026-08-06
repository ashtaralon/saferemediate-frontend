"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  FileText,
  Gauge,
  Printer,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  X,
} from "lucide-react"
import { BusinessImpactReportSection } from "@/components/business-impact/business-impact-report-section"

/**
 * A management report is a decision document, not a dump of dashboard cards.
 *
 * The snapshot below is deliberately assembled by ExecutiveCockpit from the
 * SAME lifted readings used by the dashboard. The report never re-fetches its
 * own copies, so the report cannot show one number on Home and a different number
 * in the pack opened from it.
 */

export type ReportSource = {
  label: string
  state: "READY" | "PARTIAL" | "UNAVAILABLE"
  detail?: string | null
  cachedAt?: number | null
}

export type ReportSystem = {
  name: string
  displayName?: string | null
  environment: string | null
  criticality: string | null
  owner?: string | null
  score: number | null
  resourceCount: number | null
  critical: number | null
  high: number | null
  weakestPlane: string | null
}

export type ReportSectionId = "summary" | "systems" | "damage" | "business-impact" | "progress" | "actions" | "confidence"

export type ReportCrownJewel = {
  id: string
  name: string
  type: string
  severity: string | null
  pathCount: number | null
  riskScore: number | null
  internetExposed: boolean | null
  dataClassification: string | null
  systemName: string | null
}

export type ReportCandidate = {
  resourceType: string
  resourceId: string
  system: string | null
  unusedCount: number | null
  totalPermissions: number | null
  severity: string | null
  canAutoApply: boolean | null
  blockReason: string | null
}

export type ReportDay = {
  date: string
  permissionsRemoved: number
  events: number
}

export type ManagementReportSnapshot = {
  metrics: {
    systems: number | null
    systemsPartial: boolean
    systemsRequiringAttention: number | null
    reachableCrownJewels: number | null
    internetExposedJewels: number | null
    viableAttackPaths: number | null
    proposedChanges: number | null
    heldChanges: number | null
  }
  systems: ReportSystem[]
  crownJewels: ReportCrownJewel[]
  candidates: ReportCandidate[]
  evidence: {
    confidence: number | null
    accounts: number | null
    healthy: number | null
    degraded: number | null
    missing: number | null
    total: number | null
  }
  outcomes: {
    windowDays: number | null
    permissionsRemoved: number | null
    events: number | null
    rollbacks: number | null
    periodStart: string | null
    periodEnd: string | null
    byDay: ReportDay[]
  }
}

export type ManagementReportContext = {
  scope: string
  sources: ReportSource[]
  snapshot?: ManagementReportSnapshot | null
}

const STATE_PILL: Record<ReportSource["state"], string> = {
  READY: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PARTIAL: "bg-amber-50 text-amber-700 border-amber-200",
  UNAVAILABLE: "bg-rose-50 text-rose-700 border-rose-200",
}

function fmt(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return "Not reported"
  return new Date(ts).toLocaleString()
}

function showNumber(value: number | null | undefined): string {
  return Number.isFinite(value as number) ? (value as number).toLocaleString() : "—"
}

function showDate(value: string | null | undefined): string {
  if (!value) return "Not reported"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

export function deriveReportCoverage(report: ManagementReportContext): {
  level: "COMPLETE" | "PARTIAL" | "UNAVAILABLE"
  available: number
  total: number
  issues: string[]
} {
  const available = report.sources.filter((source) => source.state === "READY").length
  const total = report.sources.length
  const unavailable = report.sources.filter((source) => source.state === "UNAVAILABLE").length
  const issues = report.sources
    .filter((source) => source.state !== "READY")
    .map((source) =>
      `${source.label}: ${source.detail ?? (source.state === "PARTIAL" ? "partial coverage" : "data unavailable")}`,
    )

  const level =
    total === 0 || unavailable === total
      ? "UNAVAILABLE"
      : available === total
        ? "COMPLETE"
        : "PARTIAL"
  return { level, available, total, issues }
}

function weakestPlane(
  system: ReportSystem,
): { label: string; tone: string } {
  if (!system.weakestPlane) return { label: "Not measured", tone: "text-slate-500" }
  const normalized = system.weakestPlane.toLowerCase()
  const label =
    normalized === "privilege"
      ? "Privilege"
      : normalized === "network"
        ? "Network"
        : normalized === "data"
          ? "Data"
          : system.weakestPlane
  return { label, tone: "text-amber-700" }
}

function damageScenario(jewel: ReportCrownJewel): string {
  const type = jewel.type.toLowerCase()
  if (type.includes("s3") || type.includes("bucket")) {
    return "Sensitive-data disclosure, destructive deletion, or extortion against stored business data."
  }
  if (type.includes("rds") || type.includes("database") || type.includes("dynamo")) {
    return "Material data theft or alteration, with potential service interruption and recovery cost."
  }
  if (type.includes("kms") || type.includes("key")) {
    return "Cross-service decryption exposure or loss of access to workloads that depend on this key."
  }
  if (type.includes("iam") || type.includes("role")) {
    return "Privilege expansion that can unlock additional systems, data stores, and control-plane actions."
  }
  return "Business-service disruption, data compromise, or expansion of attacker reach into dependent systems."
}

function scoreTone(score: number | null): string {
  if (score === null) return "bg-amber-50 text-amber-800 border-amber-200"
  if (score < 50) return "bg-rose-50 text-rose-800 border-rose-200"
  if (score < 75) return "bg-amber-50 text-amber-800 border-amber-200"
  return "bg-emerald-50 text-emerald-800 border-emerald-200"
}

function severityTone(severity: string | null): string {
  if (severity === "CRITICAL") return "bg-rose-100 text-rose-800"
  if (severity === "HIGH") return "bg-amber-100 text-amber-800"
  return "bg-slate-100 text-slate-700"
}

function Metric({
  label,
  value,
  detail,
  tone = "slate",
}: {
  label: string
  value: number | null
  detail: string
  tone?: "rose" | "amber" | "emerald" | "slate"
}) {
  const tones = {
    rose: "border-rose-200 bg-rose-50/60 text-rose-950",
    amber: "border-amber-200 bg-amber-50/60 text-amber-950",
    emerald: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
    slate: "border-slate-200 bg-slate-50 text-slate-950",
  }
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] tabular-nums">
        {showNumber(value)}
      </div>
      <div className="mt-1 text-[11px] leading-4 opacity-70">{detail}</div>
    </div>
  )
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-6 border-b border-slate-200 pb-3">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700">{eyebrow}</div>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-slate-950">{title}</h2>
      </div>
      {description ? (
        <p className="max-w-sm text-right text-[11px] leading-4 text-slate-500">{description}</p>
      ) : null}
    </div>
  )
}

function ProgressBars({ days }: { days: ReportDay[] }) {
  if (days.length === 0) {
    return (
      <div className="grid h-36 place-items-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500">
        Daily remediation history was not reported for this period.
      </div>
    )
  }
  const max = Math.max(...days.map((d) => d.permissionsRemoved), 1)
  return (
    <div className="flex h-40 items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 pb-3 pt-5">
      {days.map((day) => {
        const height = Math.max(4, Math.round((day.permissionsRemoved / max) * 105))
        return (
          <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div className="text-[9px] font-semibold text-slate-600">{day.permissionsRemoved || ""}</div>
            <div
              className="w-full max-w-8 rounded-t bg-emerald-500"
              style={{ height }}
              title={`${day.date}: ${day.permissionsRemoved} permissions removed across ${day.events} actions`}
            />
            <div className="truncate text-[8px] uppercase tracking-wide text-slate-400">
              {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

type ManagementAsk = { title: string; reason: string; owner: string; timing: string }

function buildManagementAsks(snapshot: ManagementReportSnapshot | null | undefined): ManagementAsk[] {
  if (!snapshot) {
    return [
      {
        title: "Defer risk acceptance until the estate data is available",
        reason: "The report data has not loaded, so no risk conclusion can be supported yet.",
        owner: "Security leadership",
        timing: "Before the meeting",
      },
    ]
  }

  const asks: ManagementAsk[] = []
  const unmeasured = snapshot.systems.filter((s) => s.score === null).length
  if (snapshot.metrics.internetExposedJewels === null || snapshot.metrics.viableAttackPaths === null) {
    asks.push({
      title: "Complete attack-path analysis before accepting crown-jewel risk",
      reason: "The current reading cannot establish external exposure or the number of viable attack routes.",
      owner: "Security architecture",
      timing: "Before risk acceptance",
    })
  } else if (snapshot.metrics.internetExposedJewels > 0) {
    asks.push({
      title: "Confirm exposed crown jewels as the first remediation priority",
      reason: `${showNumber(snapshot.metrics.internetExposedJewels)} crown jewel${snapshot.metrics.internetExposedJewels === 1 ? " is" : "s are"} reachable from an external entry point.`,
      owner: "Security and platform owners",
      timing: "Immediate",
    })
  }
  if (snapshot.metrics.proposedChanges !== null && snapshot.metrics.proposedChanges > 0) {
    asks.push({
      title: "Authorize staged execution of evidence-backed changes",
      reason: `${showNumber(snapshot.metrics.proposedChanges)} proposed change${snapshot.metrics.proposedChanges === 1 ? " has" : "s have"} passed the current safety gate; rollback and verification remain mandatory.`,
      owner: "Security engineering",
      timing: "Next 30 days",
    })
  }
  if (unmeasured > 0) {
    asks.push({
      title: "Set a deadline to measure every material business system",
      reason: `${unmeasured} discovered system${unmeasured === 1 ? " is" : "s are"} unscored. Unknown exposure cannot be treated as low risk.`,
      owner: "Cloud platform",
      timing: "Next 14 days",
    })
  }
  if (snapshot.evidence.confidence === null) {
    asks.push({
      title: "Restore evidence visibility before making a risk decision",
      reason: "Evidence confidence is not established in the current reading, so risk and remediation conclusions cannot be independently supported.",
      owner: "Cloud governance",
      timing: "Before risk acceptance",
    })
  } else if (
    (snapshot.evidence.missing !== null && snapshot.evidence.missing > 0) ||
    (snapshot.evidence.degraded !== null && snapshot.evidence.degraded > 0)
  ) {
    asks.push({
      title: "Close the audit-evidence blind spots",
      reason: `${showNumber(snapshot.evidence.missing)} missing and ${showNumber(snapshot.evidence.degraded)} degraded evidence source${snapshot.evidence.missing === 1 && snapshot.evidence.degraded === 0 ? "" : "s"} reduce confidence in risk and remediation decisions.`,
      owner: "Cloud governance",
      timing: "Next 30 days",
    })
  }
  if (asks.length === 0) {
    asks.push({
      title: "Maintain the current remediation cadence and risk appetite",
      reason: "No exceptional management decision is indicated by the current measured scope.",
      owner: "Security leadership",
      timing: "Quarterly review",
    })
  }
  return asks.slice(0, 4)
}

function executiveHeadline(snapshot: ManagementReportSnapshot | null | undefined): string {
  if (!snapshot) return "The current estate reading is incomplete; no risk conclusion should be drawn from missing data."
  if (
    snapshot.metrics.internetExposedJewels === null ||
    snapshot.metrics.viableAttackPaths === null ||
    snapshot.metrics.reachableCrownJewels === null
  ) {
    return "Crown-jewel exposure cannot be confirmed from the available data; complete the missing analysis before presenting an all-clear or accepting risk."
  }
  if (snapshot.metrics.internetExposedJewels > 0) {
    return `${showNumber(snapshot.metrics.internetExposedJewels)} crown jewel${snapshot.metrics.internetExposedJewels === 1 ? " is" : "s are"} reachable from an external entry point, making containment of the highest-damage routes the immediate priority.`
  }
  if (snapshot.metrics.viableAttackPaths > 0) {
    return `${showNumber(snapshot.metrics.viableAttackPaths)} viable attack path${snapshot.metrics.viableAttackPaths === 1 ? " remains" : "s remain"} to material assets, with no externally reachable jewel reported in the current reading.`
  }
  return "No viable route to a crown jewel was reported in the measured scope; evidence coverage must remain high for that conclusion to hold."
}

const NAV_ITEMS: Array<[ReportSectionId, string]> = [
  ["summary", "Summary"],
  ["systems", "Critical systems"],
  ["damage", "Potential damage"],
  ["business-impact", "Business impact"],
  ["progress", "Remediation progress"],
  ["actions", "Actions and ownership"],
  ["confidence", "Confidence & appendix"],
]

const DEFAULT_SECTIONS: Record<ReportSectionId, boolean> = {
  summary: true,
  systems: true,
  damage: true,
  "business-impact": true,
  progress: true,
  actions: true,
  confidence: true,
}

function normalized(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase()
}

function environmentLabel(value: string): string {
  const key = normalized(value)
  if (key === "prod" || key === "production") return "Production"
  if (key === "dev" || key === "development") return "Development"
  if (key === "stage" || key === "staging") return "Staging"
  if (key === "test" || key === "testing") return "Testing"
  return value.trim()
}

function systemReferenceMatches(reference: string | null | undefined, names: Set<string>): boolean {
  if (names.size === 0) return true
  const value = normalized(reference)
  if (!value) return false
  return Array.from(names).some((name) => value === name || value.split(",").map((part) => part.trim()).includes(name))
}

export function ManagementReportDrawer({
  open,
  onClose,
  report,
}: {
  open: boolean
  onClose: () => void
  report: ManagementReportContext
}) {
  const [reportTitle, setReportTitle] = useState("Security & Resilience Report")
  const [audience, setAudience] = useState("")
  const [presenter, setPresenter] = useState("")
  const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [keyMessage, setKeyMessage] = useState("")
  const [contentEmphasis, setContentEmphasis] = useState<"business" | "balanced" | "technical">("balanced")
  const [selectedEnvironments, setSelectedEnvironments] = useState<string[]>([])
  const [selectedCriticalities, setSelectedCriticalities] = useState<string[]>([])
  const [selectedSystems, setSelectedSystems] = useState<string[]>([])
  const [systemSearch, setSystemSearch] = useState("")
  const [sections, setSections] = useState<Record<ReportSectionId, boolean>>(DEFAULT_SECTIONS)
  const [includeAppendix, setIncludeAppendix] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const coverage = deriveReportCoverage(report)
  const coverageComplete = coverage.level === "COMPLETE"
  const fullSnapshot = report.snapshot
  const environmentOptions = useMemo(() => {
    const values = new Map<string, string>()
    for (const environment of (fullSnapshot?.systems || []).map((system) => system.environment).filter((value): value is string => Boolean(value))) {
      values.set(normalized(environment), environmentLabel(environment))
    }
    return Array.from(values.values()).sort()
  }, [fullSnapshot])
  const criticalityOptions = useMemo(() => Array.from(new Set((fullSnapshot?.systems || []).map((system) => system.criticality).filter((value): value is string => Boolean(value)))).sort(), [fullSnapshot])
  const eligibleSystemNames = useMemo(() => new Set((fullSnapshot?.systems || [])
    .filter((system) => {
      if (selectedEnvironments.length && !selectedEnvironments.some((value) => normalized(value) === normalized(system.environment))) return false
      if (selectedCriticalities.length && !selectedCriticalities.some((value) => normalized(value) === normalized(system.criticality))) return false
      return true
    })
    .map((system) => system.name)), [fullSnapshot, selectedCriticalities, selectedEnvironments])
  const visibleSystemOptions = useMemo(() => {
    const query = normalized(systemSearch)
    return (fullSnapshot?.systems || [])
      .filter((system) => eligibleSystemNames.has(system.name))
      .filter((system) => !query || normalized(system.displayName || system.name).includes(query))
      .sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name))
  }, [eligibleSystemNames, fullSnapshot, systemSearch])

  useEffect(() => {
    setSelectedSystems((current) => {
      const eligible = current.filter((name) => eligibleSystemNames.has(name))
      return eligible.length === current.length ? current : eligible
    })
  }, [eligibleSystemNames])
  const scopeNarrowed = selectedEnvironments.length > 0 || selectedCriticalities.length > 0 || selectedSystems.length > 0
  const snapshot = useMemo<ManagementReportSnapshot | null | undefined>(() => {
    if (!fullSnapshot) return fullSnapshot
    const explicitlySelected = new Set(selectedSystems.map(normalized))
    const systems = fullSnapshot.systems.filter((system) => {
      if (selectedEnvironments.length && !selectedEnvironments.some((value) => normalized(value) === normalized(system.environment))) return false
      if (selectedCriticalities.length && !selectedCriticalities.some((value) => normalized(value) === normalized(system.criticality))) return false
      if (explicitlySelected.size && !explicitlySelected.has(normalized(system.name))) return false
      return true
    })
    if (!scopeNarrowed) return fullSnapshot
    const allowedNames = new Set(systems.map((system) => normalized(system.name)))
    const crownJewels = fullSnapshot.crownJewels.filter((jewel) => systemReferenceMatches(jewel.systemName, allowedNames))
    const candidates = fullSnapshot.candidates.filter((candidate) => systemReferenceMatches(candidate.system, allowedNames))
    const attackPaths = crownJewels.reduce((total, jewel) => total + (jewel.pathCount || 0), 0)
    return {
      ...fullSnapshot,
      metrics: {
        ...fullSnapshot.metrics,
        systems: systems.length,
        systemsPartial: false,
        systemsRequiringAttention: systems.filter((system) => (system.critical || 0) > 0 || (system.high || 0) > 0 || (system.score !== null && system.score < 75)).length,
        reachableCrownJewels: crownJewels.length,
        internetExposedJewels: crownJewels.filter((jewel) => jewel.internetExposed === true).length,
        viableAttackPaths: attackPaths,
        proposedChanges: candidates.filter((candidate) => candidate.canAutoApply === true).length,
        heldChanges: candidates.filter((candidate) => candidate.canAutoApply === false).length,
      },
      systems,
      crownJewels,
      candidates,
    }
  }, [fullSnapshot, scopeNarrowed, selectedCriticalities, selectedEnvironments, selectedSystems])
  const scopeLabel = useMemo(() => {
    if (!scopeNarrowed) return report.scope
    const parts: string[] = []
    if (selectedSystems.length) parts.push(`${selectedSystems.length} selected system${selectedSystems.length === 1 ? "" : "s"}`)
    if (selectedEnvironments.length) parts.push(selectedEnvironments.join(", "))
    if (selectedCriticalities.length) parts.push(selectedCriticalities.join(", "))
    return parts.join(" · ") || report.scope
  }, [report.scope, scopeNarrowed, selectedCriticalities, selectedEnvironments, selectedSystems])
  const latestReading = useMemo(() => {
    const times = report.sources
      .map((source) => source.cachedAt)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    return times.length ? Math.max(...times) : null
  }, [report.sources])
  const asks = useMemo(() => buildManagementAsks(snapshot), [snapshot])
  const headline = executiveHeadline(snapshot)
  const topSystems = useMemo(() => {
    if (!snapshot) return []
    return [...snapshot.systems]
      .sort((a, b) => {
        if (a.score === null && b.score !== null) return -1
        if (a.score !== null && b.score === null) return 1
        if (a.score !== null && b.score !== null && a.score !== b.score) return a.score - b.score
        return (b.critical ?? -1) - (a.critical ?? -1)
      })
      .slice(0, 8)
  }, [snapshot])
  const topJewels = snapshot?.crownJewels.slice(0, 6) ?? []
  const safeCandidates = snapshot?.candidates.filter((candidate) => candidate.canAutoApply === true).slice(0, 5) ?? []
  const showTechnical = contentEmphasis !== "business"
  const showBusiness = contentEmphasis !== "technical"

  if (!open) return null

  const summaryForClipboard = [
    `CYNTRO ${reportTitle.toUpperCase()}${audience ? ` — ${audience}` : ""}`,
    headline,
    keyMessage ? `Key message: ${keyMessage}` : "",
    `Scope: ${scopeLabel}`,
    `Reachable crown jewels: ${showNumber(snapshot?.metrics.reachableCrownJewels)}`,
    `Internet-exposed jewels: ${showNumber(snapshot?.metrics.internetExposedJewels)}`,
    `Viable attack paths: ${showNumber(snapshot?.metrics.viableAttackPaths)}`,
    `Proposed changes: ${showNumber(snapshot?.metrics.proposedChanges)}`,
    "Decisions requested:",
    ...asks.map((ask, index) => `${index + 1}. ${ask.title} — ${ask.reason}`),
  ].filter(Boolean).join("\n")

  const copySummary = async () => {
    await navigator.clipboard.writeText(summaryForClipboard)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100" role="dialog" aria-modal="true" aria-label="Management report generator">
      <header className="cyntro-no-print flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-950 text-white">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-slate-950">Management report</h2>
              <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-700">Custom report</span>
            </div>
            <p className="truncate text-xs text-slate-500">Choose the scope, emphasis, and sections that fit the conversation.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={copySummary} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Clipboard className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy summary"}
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
            <Printer className="h-3.5 w-3.5" />
            Print / save PDF
          </button>
          <button type="button" onClick={onClose} className="ml-1 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close report">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="cyntro-no-print hidden w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-5 xl:block">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Report settings</div>
          <label className="mt-4 block text-xs font-semibold text-slate-700">
            Report title
            <input value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} className="mt-1.5 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          </label>
          <label className="mt-4 block text-xs font-semibold text-slate-700">
            Prepared for
            <input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Optional recipient or meeting" className="mt-1.5 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          </label>
          <label className="mt-4 block text-xs font-semibold text-slate-700">
            Presented by
            <input value={presenter} onChange={(event) => setPresenter(event.target.value)} className="mt-1.5 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          </label>
          <label className="mt-4 block text-xs font-semibold text-slate-700">
            Meeting date
            <input type="date" value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} className="mt-1.5 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          </label>
          <label className="mt-4 block text-xs font-semibold text-slate-700">
            Key message
            <textarea value={keyMessage} onChange={(event) => setKeyMessage(event.target.value)} rows={3} placeholder="Add the main takeaway…" className="mt-1.5 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm font-normal leading-5 text-slate-800 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          </label>

          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Content emphasis</div>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
              {(["business", "balanced", "technical"] as const).map((value) => <button key={value} type="button" onClick={() => setContentEmphasis(value)} className={`rounded-md px-1 py-2 text-[10px] font-semibold capitalize ${contentEmphasis === value ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>{value}</button>)}
            </div>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Scope</div>
            <div className="mt-3 text-[11px] font-semibold text-slate-600">Environment</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {environmentOptions.length ? environmentOptions.map((value) => <button key={value} type="button" aria-pressed={selectedEnvironments.includes(value)} onClick={() => setSelectedEnvironments((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${selectedEnvironments.includes(value) ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600"}`}>{value}</button>) : <span className="text-[10px] text-slate-400">Metadata unavailable</span>}
            </div>
            <div className="mt-4 text-[11px] font-semibold text-slate-600">Business criticality</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {criticalityOptions.length ? criticalityOptions.map((value) => <button key={value} type="button" aria-pressed={selectedCriticalities.includes(value)} onClick={() => setSelectedCriticalities((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${selectedCriticalities.includes(value) ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600"}`}>{value}</button>) : <span className="text-[10px] text-slate-400">Metadata unavailable</span>}
            </div>
            <div className="mt-4 flex items-center justify-between"><span className="text-[11px] font-semibold text-slate-600">Systems <span className="font-normal text-slate-400">({eligibleSystemNames.size})</span></span><button type="button" onClick={() => setSelectedSystems([])} className="text-[10px] font-semibold text-violet-600">All matching</button></div>
            <input value={systemSearch} onChange={(event) => setSystemSearch(event.target.value)} placeholder="Find a system…" className="mt-2 w-full rounded-md border border-slate-200 px-2.5 py-2 text-xs outline-none placeholder:text-slate-400 focus:border-violet-400" />
            <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-1.5">
              {visibleSystemOptions.length ? visibleSystemOptions.map((system) => <label key={system.name} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1.5 hover:bg-slate-50"><input type="checkbox" checked={selectedSystems.includes(system.name)} onChange={() => setSelectedSystems((current) => current.includes(system.name) ? current.filter((item) => item !== system.name) : [...current, system.name])} className="mt-0.5 h-3.5 w-3.5 accent-violet-600" /><span className="min-w-0"><span className="block truncate text-[11px] font-medium text-slate-700">{system.displayName || system.name}</span><span className="block truncate text-[9px] text-slate-400">{[system.environment, system.criticality].filter(Boolean).join(" · ") || "Metadata unavailable"}</span></span></label>) : <div className="px-2 py-3 text-center text-[10px] leading-4 text-slate-400">No systems match the selected filters.</div>}
            </div>
            {scopeNarrowed ? <button type="button" onClick={() => { setSelectedEnvironments([]); setSelectedCriticalities([]); setSelectedSystems([]) }} className="mt-2 text-[10px] font-semibold text-violet-600">Reset scope</button> : null}
          </div>

          <div className="mt-7 border-t border-slate-200 pt-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Included sections</div>
            <div className="mt-2 space-y-0.5">
              {NAV_ITEMS.map(([id, label]) => (
                <label key={id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs text-slate-600 hover:bg-slate-50">
                  <input type="checkbox" aria-label={`Include ${label}`} checked={sections[id]} onChange={(event) => setSections((current) => ({ ...current, [id]: event.target.checked }))} className="h-3.5 w-3.5 accent-violet-600" />
                  <span className="flex-1">{label}</span>
                  {sections[id] ? <a href={`#report-${id}`} aria-label={`Go to ${label}`}><ChevronRight className="h-3 w-3 text-slate-300" /></a> : null}
                </label>
              ))}
            </div>
            <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-md border border-slate-200 p-3">
              <input type="checkbox" checked={includeAppendix} onChange={(event) => setIncludeAppendix(event.target.checked)} className="mt-0.5 h-4 w-4 accent-violet-600" />
              <span><span className="block text-xs font-semibold text-slate-800">Evidence appendix</span><span className="mt-0.5 block text-[10px] leading-4 text-slate-500">Source status, timestamps, limitations, and calculation notes.</span></span>
            </label>
          </div>

          <div className={`mt-6 rounded-lg border p-3 ${coverageComplete ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <div className={`flex items-center gap-2 text-xs font-semibold ${coverageComplete ? "text-emerald-800" : "text-amber-900"}`}>
              {coverageComplete ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              Data coverage: {coverage.level === "COMPLETE" ? "Complete" : coverage.level === "PARTIAL" ? "Partial" : "Unavailable"}
            </div>
            <div className={`mt-1 text-[10px] leading-4 ${coverageComplete ? "text-emerald-700" : "text-amber-800"}`}>
              {coverage.total === 0 ? "Sources are still loading. Missing values are marked —." : `${coverage.available} of ${coverage.total} sources available. Missing values are marked —.`}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-slate-100 p-4 sm:p-7">
          <article id="cyntro-report-print-root" className="mx-auto max-w-[980px] overflow-hidden bg-white shadow-[0_18px_70px_rgba(15,23,42,0.12)] print:shadow-none">
            <div className="border-b-[6px] border-violet-600 bg-slate-950 px-8 py-8 text-white sm:px-12 sm:py-10">
              <div className="flex items-start justify-between gap-8">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300">
                    <Sparkles className="h-3.5 w-3.5" /> Cyntro intelligence
                  </div>
                  <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{reportTitle || "Security & Resilience Report"}</h1>
                  <p className="mt-3 text-sm text-slate-300">Current exposure, potential impact, remediation trajectory, and actions required.</p>
                </div>
                <div className="hidden rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-right sm:block">
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Prepared for</div>
                  <div className="mt-1 text-sm font-semibold">{audience || "Not specified"}</div>
                </div>
              </div>
              <div className="mt-8 grid gap-5 border-t border-white/10 pt-5 text-xs sm:grid-cols-3">
                <div><div className="text-[9px] uppercase tracking-wider text-slate-500">Presented by</div><div className="mt-1 font-medium text-slate-200">{presenter || "Not specified"}</div></div>
                <div><div className="text-[9px] uppercase tracking-wider text-slate-500">Meeting date</div><div className="mt-1 font-medium text-slate-200">{showDate(meetingDate)}</div></div>
                <div><div className="text-[9px] uppercase tracking-wider text-slate-500">Measured scope</div><div className="mt-1 font-medium text-slate-200">{scopeLabel}</div></div>
              </div>
            </div>

            {!coverageComplete ? (
              <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-8 py-3 text-xs text-amber-900 sm:px-12">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div><span className="font-bold">Coverage notice.</span> Some report sections have partial or unavailable data. Missing values are marked — and source details are available in Confidence &amp; appendix.</div>
              </div>
            ) : null}

            {scopeNarrowed ? <div className="flex items-start gap-3 border-b border-sky-200 bg-sky-50 px-8 py-3 text-xs text-sky-900 sm:px-12"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><div><span className="font-bold">Selected scope.</span> Risk and change counts are calculated from the detailed rows available for the selected systems. They are lower bounds, not estate-wide totals.</div></div> : null}

            <div className="space-y-12 px-8 py-10 sm:px-12 sm:py-12">
              {sections.summary ? <section id="report-summary">
                <SectionHeading eyebrow="01 · Current position" title="Summary" description={`Latest source update ${fmt(latestReading)}`} />
                <div className="rounded-xl bg-violet-950 p-6 text-white">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">Key finding</div>
                  <p className="mt-3 text-xl font-medium leading-8 tracking-[-0.02em]">{headline}</p>
                  {keyMessage ? <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-violet-100"><span className="font-semibold text-white">Context:</span> {keyMessage}</p> : null}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric label="Systems needing attention" value={snapshot?.metrics.systemsRequiringAttention ?? null} detail={snapshot?.metrics.systemsPartial ? "Lower bound; discovery is partial" : `of ${showNumber(snapshot?.metrics.systems)} discovered`} tone="amber" />
                  <Metric label="Reachable crown jewels" value={snapshot?.metrics.reachableCrownJewels ?? null} detail={`${showNumber(snapshot?.metrics.internetExposedJewels)} externally reachable`} tone="rose" />
                  <Metric label="Viable attack paths" value={snapshot?.metrics.viableAttackPaths ?? null} detail="Materially distinct routes" tone="rose" />
                  <Metric label="Changes ready" value={snapshot?.metrics.proposedChanges ?? null} detail={`${showNumber(snapshot?.metrics.heldChanges)} held by safety gates`} tone="emerald" />
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500"><Gauge className="h-4 w-4 text-violet-600" />Current state</div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">The primary risk concentration is in {topSystems[0]?.name ?? "systems that are not yet fully measured"}. {!topSystems[0] || topSystems[0].score === null ? "Its blast-radius score is not established, so uncertainty is treated as risk." : `Its current blast-radius score is ${topSystems[0].score.toFixed(0)}/100.`}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500"><TrendingDown className="h-4 w-4 text-emerald-600" />Direction of travel</div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{!snapshot || snapshot.outcomes.permissionsRemoved === null || snapshot.outcomes.events === null ? "Remediation throughput is not established in the current reading." : `Cyntro recorded ${showNumber(snapshot.outcomes.permissionsRemoved)} permissions removed across ${showNumber(snapshot.outcomes.events)} actions in the last ${showNumber(snapshot.outcomes.windowDays)} days, with ${showNumber(snapshot.outcomes.rollbacks)} rollbacks.`} This measures execution throughput, not a claim of eliminated business risk.</p>
                  </div>
                </div>
              </section> : null}

              {sections.systems ? <section id="report-systems">
                <SectionHeading eyebrow="02 · Where risk concentrates" title="Most critical business systems" description="Unknown scores rank first; measured systems then rank by lowest blast-radius security score." />
                {topSystems.length ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        <tr><th className="px-4 py-3">Priority / system</th><th className="px-3 py-3">Environment</th><th className="px-3 py-3">Business criticality</th><th className="px-3 py-3">Current score</th>{showTechnical ? <><th className="px-3 py-3">Weakest plane</th><th className="px-3 py-3 text-right">Critical</th><th className="px-4 py-3 text-right">High</th></> : null}</tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {topSystems.map((system, index) => {
                          const plane = weakestPlane(system)
                          return (
                            <tr key={`${system.name}-${index}`}>
                              <td className="px-4 py-3"><span className="mr-3 font-mono text-[10px] text-slate-400">{String(index + 1).padStart(2, "0")}</span><span className="font-semibold text-slate-900">{system.displayName || system.name}</span>{showTechnical ? <div className="ml-7 mt-0.5 text-[10px] text-slate-400">{showNumber(system.resourceCount)} resources</div> : null}</td>
                              <td className="px-3 py-3 text-slate-600">{system.environment ?? "—"}</td>
                              <td className="px-3 py-3 text-slate-600">{system.criticality ?? "—"}</td>
                              <td className="px-3 py-3"><span className={`inline-flex rounded border px-2 py-1 font-semibold tabular-nums ${scoreTone(system.score)}`}>{system.score === null ? "Unmeasured" : `${system.score.toFixed(0)}/100`}</span></td>
                              {showTechnical ? <><td className={`px-3 py-3 font-medium ${plane.tone}`}>{plane.label}</td><td className="px-3 py-3 text-right font-semibold tabular-nums text-rose-700">{showNumber(system.critical)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-700">{showNumber(system.high)}</td></> : null}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">No system ranking is available in this reading. This is an evidence gap, not an all-clear.</div>}
              </section> : null}

              {sections.damage ? <section id="report-damage">
                <SectionHeading eyebrow="03 · What could happen" title="Material risk and potential damage" description="Impact scenarios are based on the asset type and observed reachability; monetary loss is not estimated without business-owned impact inputs." />
                {topJewels.length ? (
                  <div className="space-y-3">
                    {topJewels.map((jewel, index) => (
                      <div key={`${jewel.id}-${index}`} className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_1.6fr]">
                        <div>
                          <div className="flex flex-wrap items-center gap-2"><span className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${severityTone(jewel.severity)}`}>{jewel.severity ?? "Unrated"}</span>{jewel.internetExposed === true ? <span className="rounded bg-rose-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">External entry</span> : null}</div>
                          <div className="mt-2 font-semibold text-slate-950">{jewel.name}</div>
                          <div className="mt-1 text-[11px] text-slate-500">{jewel.type} · {jewel.systemName ?? "system not reported"}</div>
                          <div className="mt-2 flex gap-3 text-[10px] text-slate-600"><span><b>{showNumber(jewel.pathCount)}</b> paths</span><span><b>{showNumber(jewel.riskScore)}</b> risk score</span>{jewel.dataClassification ? <span className="font-semibold text-violet-700">{jewel.dataClassification}</span> : null}</div>
                        </div>
                        <div className="border-l border-slate-200 pl-4"><div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{showBusiness ? "Plausible business effect" : "Observed risk detail"}</div><p className="mt-1.5 text-sm leading-6 text-slate-700">{showBusiness ? damageScenario(jewel) : `${showNumber(jewel.pathCount)} viable path${jewel.pathCount === 1 ? "" : "s"} reported to this ${jewel.type}; external reachability is ${jewel.internetExposed === null ? "not reported" : jewel.internetExposed ? "confirmed" : "not observed"}.`}</p></div>
                      </div>
                    ))}
                  </div>
                ) : <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">No crown-jewel scenarios can be published from the available data. Check attack-path coverage before interpreting the absence.</div>}
              </section> : null}

              {sections["business-impact"] ? <BusinessImpactReportSection systems={(snapshot?.systems ?? []).map((system) => ({ name: system.name, environment: system.environment, criticality: system.criticality }))} /> : null}

              {sections.progress ? <section id="report-progress">
                <SectionHeading eyebrow="05 · Are we getting safer?" title="Remediation progress and execution confidence" description="Observed changes over the current seven-day remediation window." />
                <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                  <div><ProgressBars days={snapshot?.outcomes.byDay ?? []} /><div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>{showDate(snapshot?.outcomes.periodStart)}</span><span>Permissions removed per day</span><span>{showDate(snapshot?.outcomes.periodEnd)}</span></div></div>
                  <div className="grid grid-cols-2 gap-3">
                    <Metric label="Permissions removed" value={snapshot?.outcomes.permissionsRemoved ?? null} detail="Verified narrowing" tone="emerald" />
                    <Metric label="Actions completed" value={snapshot?.outcomes.events ?? null} detail="Recorded events" tone="emerald" />
                    <Metric label="Rollbacks" value={snapshot?.outcomes.rollbacks ?? null} detail="Shown, never netted out" tone="amber" />
                    <Metric label="Evidence confidence" value={snapshot?.evidence.confidence ?? null} detail="Weakest-source aggregate" tone="slate" />
                  </div>
                </div>
                {showTechnical ? <div className="mt-5 rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" />Next safe changes</div>
                  {safeCandidates.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{safeCandidates.map((candidate, index) => <div key={`${candidate.resourceId}-${index}`} className="rounded-md bg-slate-50 px-3 py-2"><div className="truncate text-xs font-semibold text-slate-900">{candidate.resourceType} · {candidate.resourceId}</div><div className="mt-1 text-[10px] text-slate-500">{candidate.system ?? "System not reported"} · {showNumber(candidate.unusedCount)} of {showNumber(candidate.totalPermissions)} permissions unused</div></div>)}</div> : <p className="mt-2 text-sm text-slate-600">No change is currently published as safe to execute. Candidates may be held for evidence or approval.</p>}
                </div> : null}
              </section> : null}

              {sections.actions ? <section id="report-actions">
                <SectionHeading eyebrow="06 · What happens next" title="Actions, ownership, and timing" description="Recommended actions generated from the measured risk, uncertainty, and safe-action queue." />
                <div className="space-y-3">
                  {asks.map((ask, index) => (
                    <div key={ask.title} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[44px_1fr_170px]">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-violet-100 font-mono text-sm font-bold text-violet-800">{index + 1}</span>
                      <div><div className="font-semibold text-slate-950">{ask.title}</div><p className="mt-1 text-xs leading-5 text-slate-600">{ask.reason}</p></div>
                      <div className="border-l border-slate-200 pl-4 text-[10px] text-slate-500"><div className="font-bold uppercase tracking-wider text-slate-400">Suggested owner</div><div className="mt-1 font-semibold text-slate-700">{ask.owner}</div><div className="mt-3 font-bold uppercase tracking-wider text-slate-400">Timing</div><div className="mt-1 font-semibold text-slate-700">{ask.timing}</div></div>
                    </div>
                  ))}
                </div>
              </section> : null}

              {sections.confidence ? <section id="report-confidence">
                <SectionHeading eyebrow="07 · Can we trust the conclusion?" title="Evidence confidence and report limitations" description="Cyntro separates confirmed zeros from unknowns and carries source failures into the report." />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Metric label="Evidence confidence" value={snapshot?.evidence.confidence ?? null} detail="Minimum across enabled sources" tone="slate" />
                  <Metric label="Healthy sources" value={snapshot?.evidence.healthy ?? null} detail={`of ${showNumber(snapshot?.evidence.total)} observed`} tone="emerald" />
                  <Metric label="Missing sources" value={snapshot?.evidence.missing ?? null} detail={`${showNumber(snapshot?.evidence.degraded)} degraded`} tone="amber" />
                </div>
                {!coverageComplete ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"><div className="text-xs font-bold uppercase tracking-wider text-amber-900">Data coverage notes</div><ul className="mt-2 space-y-1 text-xs leading-5 text-amber-800">{coverage.issues.length > 0 ? coverage.issues.map((issue) => <li key={issue}>• {issue}</li>) : <li>• Report sources are still loading.</li>}</ul></div> : null}

                {includeAppendix ? (
                  <div className="mt-6">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500"><BarChart3 className="h-4 w-4 text-violet-600" />Evidence appendix</div>
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                      <table className="w-full text-left text-[11px]"><thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">Data source</th><th className="px-3 py-2">Coverage</th><th className="px-3 py-2">Updated</th><th className="px-3 py-2">Note</th></tr></thead><tbody className="divide-y divide-slate-100">{report.sources.map((source) => <tr key={source.label}><td className="px-3 py-2 font-semibold text-slate-800">{source.label}</td><td className="px-3 py-2"><span className={`inline-flex rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${STATE_PILL[source.state]}`}>{source.state === "READY" ? "Available" : source.state === "PARTIAL" ? "Partial" : "Unavailable"}</span></td><td className="px-3 py-2 text-slate-600">{fmt(source.cachedAt)}</td><td className="px-3 py-2 text-slate-500">{source.detail ?? "No issues reported"}</td></tr>)}</tbody></table>
                    </div>
                    <div className="mt-4 grid gap-3 text-[10px] leading-4 text-slate-500 sm:grid-cols-3"><p><b className="text-slate-700">Scores.</b> Lower system BRSS indicates greater blast-radius risk. Unmeasured systems rank above scored systems.</p><p><b className="text-slate-700">Damage.</b> Scenarios describe plausible effects from asset type and reachability. They are not financial-loss estimates.</p><p><b className="text-slate-700">Progress.</b> Permissions removed and events are execution measures. They do not independently prove risk reduction.</p></div>
                  </div>
                ) : null}
              </section> : null}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-8 py-5 text-[9px] uppercase tracking-[0.14em] text-slate-400 sm:px-12">
              <span>Cyntro · {reportTitle || "Security & Resilience Report"}</span>
              <span>Data coverage · {coverage.level === "COMPLETE" ? "Complete" : coverage.level === "PARTIAL" ? "Partial" : "Unavailable"}</span>
              <span>Generated {new Date().toLocaleString()}</span>
            </footer>
          </article>
        </main>
      </div>
    </div>
  )
}
