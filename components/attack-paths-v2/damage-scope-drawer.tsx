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
import { DamageScopeApprovalModal } from "./damage-scope-approval-modal"

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
  scope_observed: Record<string, unknown>
  scope_post_lp: {
    kept_actions: string[]
    removed_actions: string[]
    headline: string
    informational_note?: string
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
  }
  remediation_action: {
    endpoint: string
    method: string
    payload: Record<string, unknown>
  }
}

function severityFromPercent(pct: number): "LOW" | "MEDIUM" | "HIGH" {
  if (pct >= 70) return "HIGH"
  if (pct >= 40) return "MEDIUM"
  return "LOW"
}

function severityClass(level: string) {
  const l = level.toUpperCase()
  if (l === "HIGH") return "bg-red-500/20 text-red-200 border-red-500/40"
  if (l === "MEDIUM") return "bg-amber-500/20 text-amber-200 border-amber-500/40"
  return "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
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
    <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{title}</div>
      <p className="text-sm font-medium text-slate-100">{headline}</p>
      {bullets.length > 0 && (
        <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
          {bullets.slice(0, 8).map((b) => (
            <li key={b}>{b}</li>
          ))}
          {bullets.length > 8 && (
            <li className="list-none pl-0 text-slate-500">+{bullets.length - 8} more</li>
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
}

export function DamageScopeDrawer({ target, open, onOpenChange }: DamageScopeDrawerProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DamageScopePayload | null>(null)
  const [approvalOpen, setApprovalOpen] = useState(false)

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
          className="w-full sm:max-w-[480px] bg-slate-950 border-slate-800 text-slate-100 overflow-y-auto"
          data-testid="damage-scope-drawer"
        >
          <SheetHeader>
            <SheetTitle className="text-slate-100">Damage scope</SheetTitle>
            <SheetDescription className="text-slate-400">
              {target?.nodeName || target?.nodeId || "Data resource"} · path{" "}
              {target?.pathId}
            </SheetDescription>
          </SheetHeader>

          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading scope…
            </div>
          )}

          {error && !loading && (
            <p className="text-sm text-red-300 px-4">{error}</p>
          )}

          {data && !loading && (
            <div className="px-4 pb-6 space-y-4">
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${severityClass(sev)}`}
                data-testid="damage-reduction-badge"
              >
                {pct}% damage reduction · {sev}
              </div>
              <p className="text-sm text-slate-300">{data.narrative.summary}</p>

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
                <p className="text-xs text-slate-500 border-l-2 border-slate-600 pl-3">
                  {data.scope_post_lp.informational_note}
                </p>
              )}

              <Button
                className="w-full"
                data-testid="damage-scope-cta"
                onClick={() => setApprovalOpen(true)}
              >
                Review & approve remediation
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {data && target && (
        <DamageScopeApprovalModal
          open={approvalOpen}
          onOpenChange={setApprovalOpen}
          lpConfidence={data.lp_confidence}
          remediationAction={data.remediation_action}
          roleName={String(data.remediation_action.payload.role_name || "")}
          onSuccess={() => {
            setApprovalOpen(false)
            onOpenChange(false)
          }}
        />
      )}
    </>
  )
}
