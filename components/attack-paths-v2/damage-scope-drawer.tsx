"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ArrowRight, Database, FileText, Folder, Loader2 } from "lucide-react"
import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"
import { ServiceTypeBadge } from "@/lib/service-type"

export type DamageScopeTarget = {
  nodeId: string
  nodeName?: string
  nodeType?: string
  systemName: string
  pathId: string
  sourceId?: string | null
  sourceName?: string | null
  sourceType?: string | null
}

export type ObservedDataChild = {
  id: string
  name: string
  parent_name?: string | null
  type: "S3Prefix" | "S3Object" | "DatabaseTable" | string
  operations?: string[]
  event_count?: number
  last_seen?: string | null
  evidence_state: "observed"
}

export type DamageScopePayload = {
  node_id: string
  node_type: string
  principal_arn: string
  /** Per-cell S3 damage matrix with bound LP fixes (null for non-S3 or on failure). */
  damage_matrix?: import("./damage-matrix-fix").DamageMatrix | null
  scope_today: { actions: string[]; headline: string }
  scope_post_lp: {
    kept_actions: string[]
    removed_actions: string[]
    headline: string
    informational_note?: string
    scp_defense_note?: string
    resource_policy_defense_note?: string
  }
  scope_observed: {
    headline?: string
    read_prefixes?: string[]
    write_prefixes?: string[]
    delete_prefixes?: string[]
    [key: string]: unknown
  }
  /** Exact object/table evidence bound to an accessor on this selected path. */
  observed_children?: ObservedDataChild[]
  damage_reduction_percent: number
  narrative: {
    today: string
    observed: string
    post_remediation: string
    summary: string
  }
  lp_confidence: {
    score: number
    level: string
    vetos: string[]
    evidence_gaps: string[]
    consumer_count?: number | null
  }
  remediation_action: {
    endpoint: string
    method: string
    payload: Record<string, unknown>
  }
}

function extractRoleName(arn: string | undefined): string {
  if (!arn) return ""
  const m = arn.match(/\/role\/([^/]+)/)
  return m ? m[1] : arn.split("/").pop() || arn
}

function severityFromPercent(pct: number): "LOW" | "MEDIUM" | "HIGH" {
  if (pct >= 70) return "HIGH"
  if (pct >= 40) return "MEDIUM"
  return "LOW"
}

function severityClass(level: string) {
  const l = level.toUpperCase()
  if (l === "HIGH") return "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30"
  if (l === "MEDIUM") return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
}

const ACTION_PREFIXES_BY_TARGET: Record<string, string[]> = {
  S3Bucket: ["s3:", "kms:"],
  S3Prefix: ["s3:", "kms:"],
  S3Object: ["s3:", "kms:"],
  DynamoDB: ["dynamodb:", "kms:"],
  DynamoDBTable: ["dynamodb:", "kms:"],
  RDS: ["rds:", "rds-data:", "secretsmanager:", "kms:"],
  DatabaseTable: ["rds:", "rds-data:", "secretsmanager:", "kms:"],
  KMS: ["kms:"],
  Secret: ["secretsmanager:", "kms:"],
}

/** Keep the permissions that can directly enable access to the selected data target. */
export function targetRelevantActions(nodeType: string, actions: string[]): string[] {
  const prefixes = ACTION_PREFIXES_BY_TARGET[nodeType]
  if (!prefixes) return actions
  return actions.filter((action) => {
    const normalized = action.toLowerCase()
    return prefixes.some((prefix) => normalized.startsWith(prefix))
  })
}

function displayTargetName(name: string): string {
  if (name.startsWith("/")) return name
  return name.endsWith("/") ? `/${name}` : name
}

export function selectedObservedSummary(
  selected: ObservedDataChild | null,
): { headline: string; bullets: string[] } {
  if (!selected) {
    return {
      headline: "Select a data target to inspect its observed operation.",
      bullets: [],
    }
  }
  const operations = selected.operations?.length ? selected.operations : ["Access"]
  const name = displayTargetName(selected.name)
  const bullets = operations.map((operation) => `Operation: ${operation}`)
  if (typeof selected.event_count === "number") {
    bullets.push(`Observed events: ${selected.event_count.toLocaleString()}`)
  }
  if (selected.last_seen) bullets.push(`Last observed: ${selected.last_seen}`)
  return {
    headline: `${operations.join(" + ")} on ${name}`,
    bullets,
  }
}

export function leastPrivilegeHeadline(
  nodeType: string,
  headline: string,
  keptActions: string[],
): string {
  const kept = targetRelevantActions(nodeType, keptActions).map((action) => action.toLowerCase())
  const retainsS3Wildcard = kept.includes("s3:*")
  const claimsDeleteRemoved = /delete removed/i.test(headline)
  if (retainsS3Wildcard && claimsDeleteRemoved) {
    return "Recommendation needs review: s3:* still permits delete actions."
  }
  return headline
}

function ScopeCard({
  title,
  headline,
  bullets,
}: {
  title: string
  headline: string
  bullets: string[]
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <p className="text-sm font-medium text-foreground">{headline}</p>
      {bullets.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          {bullets.slice(0, 8).map((b) => (
            <li key={b}>{b}</li>
          ))}
          {bullets.length > 8 && (
            <li className="list-none pl-0 text-muted-foreground">+{bullets.length - 8} more</li>
          )}
        </ul>
      )}
    </div>
  )
}

type DamageScopeDrawerProps = {
  target: DamageScopeTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Canvas root while in browser fullscreen — Sheet portal targets this subtree. */
  portalContainerRef?: React.MutableRefObject<HTMLDivElement | null>
}

export function DamageScopeDrawer({
  target,
  open,
  onOpenChange,
  portalContainerRef,
}: DamageScopeDrawerProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DamageScopePayload | null>(null)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [selectedChild, setSelectedChild] = useState<ObservedDataChild | null>(null)
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const syncPortal = () => {
      // A portal attached to document.body is invisible while the browser is
      // in native fullscreen: only descendants of document.fullscreenElement
      // are painted. Prefer the active fullscreen root so a Crown Jewel click
      // can always show its observed-data drawer in the expanded Attack Map.
      setPortalContainer(
        document.fullscreenElement instanceof HTMLElement
          ? document.fullscreenElement
          : (portalContainerRef?.current ?? null),
      )
    }
    syncPortal()
    document.addEventListener("fullscreenchange", syncPortal)
    return () => document.removeEventListener("fullscreenchange", syncPortal)
  }, [portalContainerRef])

  useEffect(() => {
    if (open) {
      setPortalContainer(
        document.fullscreenElement instanceof HTMLElement
          ? document.fullscreenElement
          : (portalContainerRef?.current ?? null),
      )
    }
  }, [open, portalContainerRef])

  const fetchScope = useCallback(async (t: DamageScopeTarget) => {
    setLoading(true)
    setError(null)
    setData(null)
    setSelectedChild(null)
    try {
      const url = `/api/proxy/attack-paths/${encodeURIComponent(t.systemName)}/path/${encodeURIComponent(t.pathId)}/node/${encodeURIComponent(t.nodeId)}/damage-scope`
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(
          (errBody as { detail?: string }).detail ||
            (errBody as { error?: string }).error ||
            `HTTP ${res.status}`,
        )
      }
      setData((await res.json()) as DamageScopePayload)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && target) fetchScope(target)
    if (!open) {
      setData(null)
      setError(null)
      setApprovalOpen(false)
      setSelectedChild(null)
    }
  }, [open, target, fetchScope])

  const pct = data?.damage_reduction_percent ?? 0
  const sev = severityFromPercent(pct)
  const observedChildren = data?.observed_children ?? []
  const observedPrefixes = (() => {
    if (!data?.scope_observed || data.node_type !== "S3Bucket") return []
    const operations = new Map<string, Set<string>>()
    for (const [operation, key] of [
      ["Read", "read_prefixes"],
      ["Write", "write_prefixes"],
      ["Delete", "delete_prefixes"],
    ] as const) {
      for (const prefix of data.scope_observed[key] ?? []) {
        if (!operations.has(prefix)) operations.set(prefix, new Set())
        operations.get(prefix)?.add(operation)
      }
    }
    return Array.from(operations.entries()).map(([prefix, values]) => ({
      id: `observed-prefix:${prefix}`,
      name: prefix.endsWith("/") ? prefix : `${prefix}/`,
      parent_name: target?.nodeName ?? target?.nodeId ?? null,
      type: "S3Prefix",
      operations: Array.from(values),
      evidence_state: "observed" as const,
    }))
  })()
  const observedTargets = [...observedChildren, ...observedPrefixes]
  const flowTargetName = selectedChild?.name ?? target?.nodeName ?? target?.nodeId ?? "Data resource"
  const flowTargetType = selectedChild?.type ?? data?.node_type ?? target?.nodeType ?? "Resource"

  const selectedSummary = selectedObservedSummary(selectedChild)
  const targetNodeType = selectedChild?.type ?? data?.node_type ?? target?.nodeType ?? "Resource"
  const currentTargetActions = targetRelevantActions(targetNodeType, data?.scope_today.actions ?? [])
  const keptTargetActions = targetRelevantActions(targetNodeType, data?.scope_post_lp.kept_actions ?? [])
  const removedTargetActions = targetRelevantActions(targetNodeType, data?.scope_post_lp.removed_actions ?? [])
  const pathHitCount = data?.scope_observed && typeof data.scope_observed.hit_count === "number"
    ? data.scope_observed.hit_count
    : null

  useEffect(() => {
    if (!data || selectedChild || observedTargets.length === 0) return
    setSelectedChild(observedTargets[0])
  }, [data, observedTargets, selectedChild])

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          container={portalContainer}
          className="w-full sm:max-w-[480px] bg-background border-border text-foreground overflow-y-auto"
          data-testid="damage-scope-drawer"
        >
          <SheetHeader>
            <SheetTitle className="text-foreground">Observed data flow</SheetTitle>
            <SheetDescription className="text-muted-foreground">
              Current Access · path {target?.pathId}. Only evidence attributable
              to this selected route is shown.
            </SheetDescription>
          </SheetHeader>

          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading scope…
            </div>
          )}

          {error && !loading && (
            <p className="text-sm text-red-700 dark:text-red-300 px-4">{error}</p>
          )}

          {data && !loading && (
            <div className="px-4 pb-6 space-y-4">
              <section className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.04] p-3" data-testid="observed-data-flow-route">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">
                  Compute → exact observed data
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background p-2">
                    <ServiceTypeBadge type={target?.sourceType || "Compute"} variant="tile" size={34} />
                    <div className="min-w-0">
                      <div className="text-[9px] uppercase text-muted-foreground">From</div>
                      <div className="truncate text-[11px] font-semibold text-foreground" title={target?.sourceName || target?.sourceId || "Compute resource"}>
                        {target?.sourceName || target?.sourceId || "Compute resource"}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-cyan-500" />
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background p-2">
                    <ServiceTypeBadge type={flowTargetType} variant="tile" size={34} />
                    <div className="min-w-0">
                      <div className="text-[9px] uppercase text-muted-foreground">To</div>
                      <div className="truncate text-[11px] font-semibold text-foreground" title={flowTargetName}>{flowTargetName}</div>
                      {selectedChild?.parent_name ? <div className="truncate text-[9px] text-muted-foreground">{selectedChild.parent_name}</div> : null}
                    </div>
                  </div>
                </div>
                {selectedChild ? (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] text-muted-foreground">
                    <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">Observed</span>
                    {selectedChild.operations?.map((operation) => <span key={operation} className="rounded border border-border bg-background px-1.5 py-0.5">{operation}</span>)}
                    {typeof selectedChild.event_count === "number" ? <span className="px-1 py-0.5">{selectedChild.event_count} events</span> : null}
                  </div>
                ) : (
                  <p className="mt-2 text-[10px] text-muted-foreground">Select an observed object or table below to see the exact route.</p>
                )}
              </section>

              <section className="rounded-lg border border-border bg-card p-3" data-testid="observed-data-children">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {data.node_type === "S3Bucket" ? "Observed prefixes and objects" : "Observed tables"}
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Click a row to bind the flow to that exact data target.</p>
                  </div>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[9px] text-muted-foreground">{observedTargets.length}</span>
                </div>
                {observedTargets.length ? (
                  <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                    {observedTargets.map((child) => {
                      const active = selectedChild?.id === child.id
                      const Icon = child.type === "S3Object"
                        ? FileText
                        : child.type === "S3Prefix"
                          ? Folder
                          : Database
                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => setSelectedChild(child)}
                          className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${active ? "border-cyan-500/50 bg-cyan-500/10" : "border-border bg-background hover:bg-muted/40"}`}
                          aria-pressed={active}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[10px] font-medium text-foreground">{child.name}</span>
                            <span className="block truncate text-[9px] text-muted-foreground">{child.parent_name || child.type}</span>
                          </span>
                          <span className="text-[9px] text-muted-foreground">
                            {typeof child.event_count === "number" ? `${child.event_count} events` : child.operations?.join(", ")}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="mt-2 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/[0.04] p-2.5 text-[10px] leading-relaxed text-amber-800 dark:text-amber-300">
                    The selected path has observed resource-level access, but Neptune has no exact prefix/object/table event bound to this compute or its path identity. Cyntro will not borrow another service&apos;s activity.
                  </p>
                )}
              </section>

              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${severityClass(sev)}`}
                data-testid="damage-reduction-badge"
              >
                Path-wide risk reduction · {pct}% · {sev}
              </div>

              <ScopeCard
                title="Selected observed target"
                headline={selectedSummary.headline}
                bullets={selectedSummary.bullets}
              />
              {pathHitCount !== null && (
                <p className="text-[10px] text-muted-foreground">
                  Path total: {pathHitCount.toLocaleString()} events across all observed data targets. This is not a count for the selected row.
                </p>
              )}

              <div className="border-t border-border pt-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Path-wide permission exposure</div>
                <p className="mt-1 text-sm text-foreground">
                  These IAM permissions belong to the path identity. They stay the same when you select another observed prefix or object.
                </p>
              </div>

              <ScopeCard
                title="Path-wide permissions relevant to this data service"
                headline={data.scope_today.headline}
                bullets={currentTargetActions.length ? currentTargetActions : ["No target-specific configured actions returned"]}
              />
              <ScopeCard
                title="After least privilege (path-wide recommendation)"
                headline={leastPrivilegeHeadline(targetNodeType, data.scope_post_lp.headline, keptTargetActions)}
                bullets={[
                  ...keptTargetActions.slice(0, 4).map((a) => `Keep: ${a}`),
                  ...removedTargetActions.slice(0, 4).map((a) => `Remove: ${a}`),
                ]}
              />
              {data.scope_post_lp.informational_note && (
                <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">
                  {data.scope_post_lp.informational_note}
                </p>
              )}

              <Button
                className="w-full"
                data-testid="damage-scope-cta"
                onClick={() => setApprovalOpen(true)}
              >
                Open LP analysis
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {data && target && (
        <IAMPermissionAnalysisModal
          isOpen={approvalOpen}
          onClose={() => setApprovalOpen(false)}
          roleName={
            String(data.remediation_action.payload.role_name || "") ||
            extractRoleName(data.principal_arn)
          }
          systemName={target.systemName}
          identityType="IAMRole"
          onRemediationSuccess={() => {
            setApprovalOpen(false)
          }}
        />
      )}
    </>
  )
}
