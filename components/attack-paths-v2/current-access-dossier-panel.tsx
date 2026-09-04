"use client"

/**
 * One selected path, explained in operator language.
 *
 * The evidence model remains server-owned. This component only reorganises
 * that evidence around the four decisions an operator must make.
 */

import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  FileText,
  Folder,
  Loader2,
  RefreshCw,
  Scissors,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import type { DrilldownChild } from "@/components/dependency-map/stack-sidebar"
import type {
  CurrentAccessDossier,
  DossierCheckpoint,
} from "@/lib/attack-paths/build-current-access-dossier"
import { getServiceMeta, ServiceTypeBadge } from "@/lib/service-type"

function statusTone(status: string): string {
  const value = status.toUpperCase()
  if (value.includes("OBSERVED")) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
  }
  if (value.includes("OPEN") || value === "CONFIGURED" || value === "RECOMMENDED") {
    return "border-cyan-500/30 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300"
  }
  if (value.includes("UNKNOWN") || value === "UNAVAILABLE" || value === "UNVERIFIED") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
  }
  return "border-border bg-muted/40 text-muted-foreground"
}

function EvidenceChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${statusTone(status)}`}
    >
      {status}
    </span>
  )
}

function Endpoint({
  side,
  endpoint,
}: {
  side: "from" | "to"
  endpoint: CurrentAccessDossier["from"]
}) {
  const meta = getServiceMeta(endpoint.type || "Resource")
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <ServiceTypeBadge type={endpoint.type} variant="tile" size={38} />
      <div className="min-w-0">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {side}
        </div>
        <div className="truncate text-[12px] font-semibold text-foreground" title={endpoint.name}>
          {endpoint.name}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">{meta.label}</div>
      </div>
    </div>
  )
}

function checkpoint(
  dossier: CurrentAccessDossier,
  kind: DossierCheckpoint["kind"],
): DossierCheckpoint | null {
  return dossier.checkpoints.find((item) => item.kind === kind) ?? null
}

function detailValues(
  cp: DossierCheckpoint | null,
  labels: string[],
): Array<{ label: string; value: string }> {
  if (!cp) return []
  const allowed = new Set(labels)
  return cp.details.filter((row) => allowed.has(row.label))
}

function simpleDamageSummary(
  damage: DossierCheckpoint | null,
  targetName: string,
): string {
  if (!damage) return "Potential damage is unavailable."
  const damageRow = damage.details.find((row) => row.label === "Damage types")
  const raw = (damageRow?.value ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value && value !== "none listed")
  if (!raw.length) return "No potential damage is listed for this path."
  const phrases = raw.map((value) => {
    if (value.includes("delete")) return "delete data"
    if (value.includes("encrypt")) return "encrypt data"
    if (value.includes("write") || value.includes("modify")) return "add or change data"
    if (value.includes("read") || value.includes("exposure")) return "read data"
    return value.replace(/_/g, " ")
  })
  const unique = Array.from(new Set(phrases))
  const capability = unique.length === 1
    ? unique[0]
    : `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`
  return `If this service reaches ${targetName}, its current permissions allow it to ${capability}.`
}

function DecisionSection({
  icon: Icon,
  eyebrow,
  title,
  status,
  summary,
  rows = [],
  tone = "neutral",
  children,
}: {
  icon: typeof Eye
  eyebrow: string
  title: string
  status: string
  summary: string
  rows?: Array<{ label: string; value: string }>
  tone?: "neutral" | "risk" | "action"
  children?: ReactNode
}) {
  const surface =
    tone === "risk"
      ? "border-rose-500/20 bg-rose-500/[0.035]"
      : tone === "action"
        ? "border-cyan-500/20 bg-cyan-500/[0.035]"
        : "border-border bg-muted/15"
  return (
    <section className={`rounded-xl border p-3.5 ${surface}`}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-background">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                {eyebrow}
              </div>
              <h3 className="text-[12px] font-semibold text-foreground">{title}</h3>
            </div>
            <span className="ml-auto"><EvidenceChip status={status} /></span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-foreground/85">{summary}</p>
          {rows.length ? (
            <dl className="mt-2.5 space-y-1.5 border-t border-border/70 pt-2.5">
              {rows.map((row) => (
                <div key={`${title}-${row.label}`} className="grid grid-cols-[7.25rem_1fr] gap-2">
                  <dt className="text-[10px] text-muted-foreground">{row.label}</dt>
                  <dd className="break-words text-[10px] font-medium text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {children}
        </div>
      </div>
    </section>
  )
}

function isNestedScope(type: string): boolean {
  return type === "S3Prefix" || type === "RDSDatabase"
}

function ScopeIcon({ type }: { type: string }) {
  if (type === "S3Prefix") return <Folder className="h-3.5 w-3.5 text-emerald-500" />
  if (type === "S3Object") return <FileText className="h-3.5 w-3.5 text-emerald-500" />
  return <Database className="h-3.5 w-3.5 text-violet-500" />
}

function DataScopeExplorer({
  resourceId,
  resourceType,
  systemName,
}: {
  resourceId: string | null
  resourceType: string | null
  systemName?: string
}) {
  const normalType = (resourceType || "").toLowerCase().replace(/[^a-z0-9]/g, "")
  const isS3 = normalType.includes("s3")
  const isRds = normalType.includes("rds") || normalType.includes("database")
  const [children, setChildren] = useState<DrilldownChild[] | null>(null)
  const [nested, setNested] = useState<Record<string, DrilldownChild[]>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [loadingChild, setLoadingChild] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  const fetchScope = async (id: string): Promise<DrilldownChild[]> => {
    const query = new URLSearchParams({ resource_id: id })
    if (systemName) query.set("system_name", systemName)
    const response = await fetch(`/api/proxy/system-map/resource-children?${query.toString()}`)
    const payload = await response.json().catch(() => null) as {
      children?: DrilldownChild[]
      error?: string
      code?: string
    } | null
    if (response.status === 404 || payload?.code === "SCOPE_EVIDENCE_NOT_FOUND") {
      return []
    }
    if (!response.ok) {
      throw new Error(
        "Exact object-level Neptune evidence is temporarily unavailable. Bucket-level damage remains available.",
      )
    }
    return Array.isArray(payload?.children) ? payload.children : []
  }

  useEffect(() => {
    let cancelled = false
    setChildren(null)
    setNested({})
    setExpanded({})
    setError(null)
    if (!resourceId || (!isS3 && !isRds)) return
    setLoading(true)
    fetchScope(resourceId)
      .then((rows) => {
        if (!cancelled) setChildren(rows)
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Scope evidence unavailable")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Resource identity is the authority for this fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, systemName, isS3, isRds, retryKey])

  if (!isS3 && !isRds) return null

  const toggle = async (child: DrilldownChild) => {
    const opening = !expanded[child.id]
    setExpanded((current) => ({ ...current, [child.id]: opening }))
    if (!opening || nested[child.id]) return
    setLoadingChild(child.id)
    try {
      const rows = await fetchScope(child.id)
      setNested((current) => ({ ...current, [child.id]: rows }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Scope evidence unavailable")
    } finally {
      setLoadingChild(null)
    }
  }

  return (
    <div className="mt-3 border-t border-border/70 pt-2.5" data-testid="data-scope-explorer">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-foreground">
          {isS3 ? "Affected prefixes and objects" : "Affected databases and tables"}
        </span>
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Neptune evidence</span>
      </div>
      {loading ? (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading exact scope…
        </div>
      ) : error ? (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-2.5 text-[10px] leading-relaxed text-amber-900 dark:text-amber-200">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetryKey((value) => value + 1)}
            className="mt-2 inline-flex items-center gap-1 font-semibold underline underline-offset-2"
          >
            <RefreshCw className="h-3 w-3" /> Retry exact scope
          </button>
        </div>
      ) : children?.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/[0.04] p-2.5 text-[10px] leading-relaxed text-amber-900 dark:text-amber-200">
          {isS3
            ? "Object-level evidence has not been projected into Neptune for this bucket yet. Bucket-level damage is available; exact prefixes and objects are unavailable."
            : "Table-level evidence is unavailable for this database. Enable database audit/query logs and ingest grants before showing table-specific damage."}
        </p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-lg border border-border bg-background">
          {children?.map((child) => {
            const canExpand = isNestedScope(child.type)
            const open = expanded[child.id]
            return (
              <div key={child.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => canExpand && toggle(child)}
                  className={`flex w-full items-center gap-2 px-2.5 py-2 text-left ${canExpand ? "hover:bg-muted/40" : "cursor-default"}`}
                >
                  {canExpand ? (
                    open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  ) : <span className="w-3" />}
                  <ScopeIcon type={child.type} />
                  <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-foreground">{child.name}</span>
                  {child.metric_label ? <span className="text-[9px] text-muted-foreground">{child.metric_label}</span> : null}
                  {child.evidence_state ? <EvidenceChip status={child.evidence_state} /> : null}
                </button>
                {canExpand && open ? (
                  <div className="border-t border-border bg-muted/15 py-1 pl-8 pr-2">
                    {loadingChild === child.id ? (
                      <div className="flex items-center gap-1 py-1 text-[9px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
                    ) : nested[child.id]?.length ? nested[child.id].map((leaf) => (
                      <div key={leaf.id} className="flex items-center gap-2 py-1.5">
                        <ScopeIcon type={leaf.type} />
                        <span className="min-w-0 flex-1 truncate text-[9px] text-foreground">{leaf.name}</span>
                        {leaf.operations?.length ? <span className="text-[9px] text-muted-foreground">{leaf.operations.join(", ")}</span> : null}
                        {leaf.evidence_state ? <EvidenceChip status={leaf.evidence_state} /> : null}
                      </div>
                    )) : <div className="py-1 text-[9px] text-muted-foreground">No exact child evidence observed.</div>}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function CurrentAccessDossierPanel({
  dossier,
  jewelName,
  jewelType,
  systemName,
  hopsPending,
  onClearPin,
  businessImpact,
  cveAnalysis,
}: {
  dossier: CurrentAccessDossier | null
  jewelName: string
  jewelType?: string | null
  systemName?: string
  hopsPending?: boolean
  onClearPin?: () => void
  businessImpact?: ReactNode
  /** Backend-authored CVE decision and current-vs-enabled damage delta. */
  cveAnalysis?: ReactNode
}) {
  const model = useMemo(() => {
    if (!dossier) return null
    const observed = checkpoint(dossier, "data_operation")
    const damage = checkpoint(dossier, "damage")
    const cut = checkpoint(dossier, "cut")
    const network = checkpoint(dossier, "execution_network")
    const authorization = checkpoint(dossier, "authorization")
    const needed = detailValues(cut, ["Keep actions", "Scope prefixes"])
    const reduction = detailValues(cut, [
      "Remove actions",
      "Scope prefixes",
      "KMS chain",
      "Hint",
      "Posture notes",
      "Remediation window",
    ])
    return { observed, damage, cut, network, authorization, needed, reduction }
  }, [dossier])

  if (hopsPending) {
    return (
      <aside className="flex min-h-[120px] items-center gap-2 bg-background px-4 py-3 text-[12px] text-muted-foreground" data-testid="current-access-dossier" data-state="loading">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading verified path evidence…
      </aside>
    )
  }

  if (!dossier || !model) {
    return (
      <aside className="min-h-[120px] bg-background px-4 py-3 text-[12px] text-muted-foreground" data-testid="current-access-dossier" data-state="missing">
        This path is not present in the current Neptune result, so Cyntro cannot explain it safely.
      </aside>
    )
  }

  const observedNow = /observed/i.test(
    `${model.observed?.status ?? ""} ${model.observed?.evidence ?? ""}`,
  )
  const observedRows = detailValues(
    model.observed,
    observedNow
      ? ["Relationship", "Hit count", "First seen", "Last seen", "Edge evidence"]
      : ["Relationship", "Edge evidence"],
  )
  observedRows.push({
    label: "Business-approved",
    value: "not classified in current evidence",
  })
  const damageRows = detailValues(model.damage, ["Damage types", "Severity"])
  const neededSummary = model.needed.length
    ? "These are the actions and data scope the server recommendation says to preserve."
    : "The required business permissions are not available in the current evidence. Cyntro will not guess what this service needs."
  const hasRemoval = model.reduction.some((row) => row.label === "Remove actions")
  const reductionSummary = hasRemoval
    ? (model.cut?.summary ?? "Review the server-authored least-privilege cut.")
    : model.needed.length
      ? "No excess action was identified in this recommendation. Keep the listed actions; no permission cut is available for this path."
      : "No server-authored risk reduction is available for this path."

  return (
    <aside className="flex w-full flex-col bg-background" data-testid="current-access-dossier" data-path-id={dossier.path_id} data-evidence={dossier.evidence}>
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">Current access</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">What is happening now, what it enables, and what to change.</p>
          </div>
          {onClearPin ? (
            <button type="button" onClick={onClearPin} className="rounded border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Clear path pin" data-testid="dossier-clear-pin">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-3">
          <Endpoint side="from" endpoint={dossier.from} />
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-background text-primary"><ArrowRight className="h-3.5 w-3.5" /></span>
          <Endpoint side="to" endpoint={{ ...dossier.to, name: dossier.to.name || jewelName, type: dossier.to.type || jewelType || null }} />
        </div>
      </div>

      {businessImpact ? (
        <div
          className="border-b border-border"
          data-testid="current-access-business-impact"
        >
          {businessImpact}
        </div>
      ) : null}

      <div className="space-y-2.5 p-3" data-testid="dossier-checkpoints">
        <DecisionSection
          icon={Eye}
          eyebrow="1 · Evidence"
          title="Observed traffic"
          status={observedNow ? (model.observed?.status ?? "observed") : "not observed"}
          summary={observedNow
            ? `${model.observed?.summary ?? "Observed data-plane use is present."} Telemetry proves use, not that the use is business-approved.`
            : `No observed traffic proves this route today. ${model.observed?.summary ?? "A configured access relationship exists."}`}
          rows={observedRows}
        />

        <DecisionSection
          icon={TriangleAlert}
          eyebrow="2 · Exposure"
          title="Potential damage if reached"
          status={model.damage?.status ?? "unavailable"}
          summary={simpleDamageSummary(model.damage, dossier.to.name || jewelName)}
          rows={damageRows}
          tone="risk"
        >
          <DataScopeExplorer resourceId={dossier.to.id || dossier.jewel_id} resourceType={dossier.to.type || jewelType || null} systemName={systemName} />
        </DecisionSection>

        {cveAnalysis ? (
          <div data-testid="current-access-cve-analysis">{cveAnalysis}</div>
        ) : null}

        <DecisionSection
          icon={ShieldCheck}
          eyebrow="3 · Least privilege"
          title="Access actually needed"
          status={model.needed.length ? "server recommendation" : "unavailable"}
          summary={neededSummary}
          rows={model.needed}
        />

        <DecisionSection
          icon={Scissors}
          eyebrow="4 · Action"
          title="Reduce the risk"
          status={model.cut?.status ?? "unavailable"}
          summary={reductionSummary}
          rows={model.reduction}
          tone="action"
        />

        <details className="rounded-lg border border-border bg-muted/10 px-3 py-2">
          <summary className="cursor-pointer text-[10px] font-medium text-muted-foreground">Why Cyntro believes this path is reachable</summary>
          <div className="mt-2 space-y-2 text-[10px] text-muted-foreground">
            <p><span className="font-medium text-foreground">Network:</span> {model.network?.summary ?? "unavailable"}</p>
            <p><span className="font-medium text-foreground">Authorization:</span> {model.authorization?.summary ?? "unavailable"}</p>
            <p className="font-mono text-[9px]">path {dossier.path_id}</p>
          </div>
        </details>
      </div>
    </aside>
  )
}
