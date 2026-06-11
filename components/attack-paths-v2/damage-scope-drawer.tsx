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
import { Loader2 } from "lucide-react"
import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"

export type DamageScopeTarget = {
  nodeId: string
  nodeName?: string
  nodeType?: string
  systemName: string
  pathId: string
}

export type DamageScopePayload = {
  node_id: string
  node_type: string
  principal_arn: string
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
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const syncPortal = () => {
      setPortalContainer(portalContainerRef?.current ?? null)
    }
    syncPortal()
    document.addEventListener("fullscreenchange", syncPortal)
    return () => document.removeEventListener("fullscreenchange", syncPortal)
  }, [portalContainerRef])

  useEffect(() => {
    if (open) setPortalContainer(portalContainerRef?.current ?? null)
  }, [open, portalContainerRef])

  const fetchScope = useCallback(async (t: DamageScopeTarget) => {
    setLoading(true)
    setError(null)
    setData(null)
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
    }
  }, [open, target, fetchScope])

  const pct = data?.damage_reduction_percent ?? 0
  const sev = severityFromPercent(pct)

  const observedBullets: string[] = []
  if (data?.scope_observed) {
    const o = data.scope_observed
    for (const p of (o.read_prefixes as string[]) || []) observedBullets.push(`Read: /${p}/`)
    for (const p of (o.write_prefixes as string[]) || []) observedBullets.push(`Write: /${p}/`)
    for (const p of (o.delete_prefixes as string[]) || []) observedBullets.push(`Delete: /${p}/`)
    if (typeof o.hit_count === "number") observedBullets.push(`Hits: ${o.hit_count}`)
  }

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
            <SheetTitle className="text-foreground">Damage scope</SheetTitle>
            <SheetDescription className="text-muted-foreground">
              {target?.nodeName || target?.nodeId || "Data resource"} · path{" "}
              {target?.pathId}
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
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${severityClass(sev)}`}
                data-testid="damage-reduction-badge"
              >
                {pct}% damage reduction · {sev}
              </div>
              <p className="text-sm text-foreground">{data.narrative.summary}</p>

              <ScopeCard
                title="Today (configured)"
                headline={data.scope_today.headline}
                bullets={data.scope_today.actions}
              />
              <ScopeCard
                title="Observed on this path"
                headline={String(data.scope_observed.headline || "")}
                bullets={observedBullets}
              />
              <ScopeCard
                title="Post-LP (predicted)"
                headline={data.scope_post_lp.headline}
                bullets={[
                  ...data.scope_post_lp.kept_actions.slice(0, 4).map((a) => `Keep: ${a}`),
                  ...data.scope_post_lp.removed_actions.slice(0, 4).map((a) => `Remove: ${a}`),
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
