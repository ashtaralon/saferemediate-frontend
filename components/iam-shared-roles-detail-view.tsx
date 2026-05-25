"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Globe2,
  HelpCircle,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { approveSplitPlan, fetchSplitPlan } from "@/lib/api-client"
import type {
  ConsumerEvidence,
  EvidenceState,
  SplitPlan,
  SplitPlanGroup,
  SplitPlanState,
} from "@/lib/types"

interface Props {
  planId: string
}

const STATE_COLORS: Record<SplitPlanState, string> = {
  PROPOSED: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-700/50",
  APPROVED: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-700/50",
  EXECUTING: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-700/50",
  EXECUTED: "bg-zinc-100 text-zinc-900 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700",
  REJECTED: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/40 dark:text-red-200 dark:border-red-700/50",
  EXPIRED: "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700",
}

const EVIDENCE_COLORS: Record<EvidenceState, string> = {
  HIGH: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-700/50",
  NONE: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700",
  CONFLICTED: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-700/50",
  COMPLEX_POLICY: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-700/50",
}

export default function IAMSharedRolesDetailView({ planId }: Props) {
  const [plan, setPlan] = useState<SplitPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSplitPlan(planId)
      .then((p) => {
        if (!cancelled) setPlan(p)
      })
      .catch((e: any) => {
        if (!cancelled) setError(String(e?.message ?? e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [planId, reloadKey])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-zinc-700 dark:text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Loading plan…</span>
      </div>
    )
  }

  if (error || !plan) {
    return (
      <div className="p-6">
        <BackLink />
        <Card className="border-l-4 border-l-red-600 mt-4">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium">Could not load plan</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-400 break-all">
                {error || "Empty response"}
              </p>
              <Button size="sm" variant="outline" onClick={reload}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <BackLink />

      <PlanHeader plan={plan} onApproved={reload} />
      <DiscoveryFactsPanel plan={plan} />
      <DataCaveatsPanel caveats={plan.data_caveats} />
      <EligibleGroupsPanel groups={plan.eligible_groups} />
      <BlockedConsumersPanel blocked={plan.blocked_consumers} />
      <RawPanel plan={plan} />
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/iam/shared-roles"
      className="inline-flex items-center text-sm text-zinc-700 dark:text-zinc-400 hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4 mr-1" />
      Back to shared roles
    </Link>
  )
}

function PlanHeader({
  plan,
  onApproved,
}: {
  plan: SplitPlan
  onApproved: () => void
}) {
  return (
    <header className="space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {plan.shared_role.role_name}
          </h1>
          <p className="text-xs font-mono text-zinc-700 dark:text-zinc-400 break-all mt-1">
            {plan.shared_role.role_arn}
          </p>
        </div>
        <Badge variant="outline" className={`${STATE_COLORS[plan.state]} text-sm`}>
          {plan.state}
        </Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs text-zinc-700 dark:text-zinc-400">
        <MetaLine label="Plan ID">{plan.plan_id}</MetaLine>
        <MetaLine label="Plan hash">{plan.plan_hash.slice(0, 16)}…</MetaLine>
        <MetaLine label="Created">{formatTime(plan.created_at)}</MetaLine>
        <MetaLine label="Expires">
          {formatTime(plan.expires_at)}
          {plan.expired && <span className="text-red-600 ml-1">(expired)</span>}
        </MetaLine>
        <MetaLine label="Requested by">{plan.requested_by}</MetaLine>
        <MetaLine label="Modes enabled">
          {plan.execution_modes_enabled.join(", ") || "—"}
        </MetaLine>
      </div>
      <ApprovalPanel plan={plan} onApproved={onApproved} />
    </header>
  )
}

function MetaLine({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <span className="uppercase tracking-wide font-medium">{label}: </span>
      <span className="font-mono">{children}</span>
    </div>
  )
}

function ApprovalPanel({
  plan,
  onApproved,
}: {
  plan: SplitPlan
  onApproved: () => void
}) {
  const [approvedBy, setApprovedBy] = useState("")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  if (plan.state !== "PROPOSED") {
    return (
      <Card className="border-l-4 border-l-zinc-300">
        <CardContent className="py-3 text-sm text-zinc-700 dark:text-zinc-400">
          Approval not available in state <span className="font-mono">{plan.state}</span>.
        </CardContent>
      </Card>
    )
  }

  if (plan.expired) {
    return (
      <Card className="border-l-4 border-l-zinc-400">
        <CardContent className="py-3 text-sm text-zinc-700 dark:text-zinc-400">
          Plan has expired — re-generate to approve.
        </CardContent>
      </Card>
    )
  }

  const submit = async () => {
    if (!approvedBy.trim()) {
      setSubmitError("Approver identity is required")
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      await approveSplitPlan(plan.plan_id, approvedBy.trim(), note.trim() || undefined)
      onApproved()
    } catch (e: any) {
      setSubmitError(String(e?.message ?? e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-l-4 border-l-emerald-600">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Approve this plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Approver identity (email or name)"
            value={approvedBy}
            onChange={(e) => setApprovedBy(e.target.value)}
            disabled={submitting}
            className="h-9 px-3 text-sm rounded-md border bg-background"
          />
          <div className="text-xs text-zinc-700 dark:text-zinc-400 self-center">
            Self-attested until SSO. Recorded on the audit node.
          </div>
        </div>
        <Textarea
          placeholder="Optional approval note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={submitting}
          rows={2}
          className="text-sm"
        />
        {submitError && (
          <p className="text-xs text-red-600 break-all">{submitError}</p>
        )}
        <div className="flex items-center gap-2">
          <Button onClick={submit} disabled={submitting || !approvedBy.trim()}>
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            {submitting ? "Approving…" : "Approve plan"}
          </Button>
          <span className="text-[11px] text-zinc-700 dark:text-zinc-400">
            Approval is required before execution. Execution is not yet enabled in this build.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function DiscoveryFactsPanel({ plan }: { plan: SplitPlan }) {
  const facts = plan.discovery_facts
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-700 dark:text-zinc-400">
          Discovery
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Stat icon={<Users className="h-3.5 w-3.5" />} label="Consumers">
          {facts.consumer_count}
        </Stat>
        <Stat icon={<Globe2 className="h-3.5 w-3.5" />} label="Systems">
          {facts.system_tags.length === 0 ? (
            <span className="text-zinc-700 dark:text-zinc-400 text-base">untagged</span>
          ) : (
            <div className="flex flex-wrap gap-1 mt-1">
              {facts.system_tags.map((t) => (
                <Badge key={t} variant="outline" className="text-[11px]">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </Stat>
        <Stat
          icon={
            facts.cross_system ? (
              <ShieldAlert className="h-3.5 w-3.5 text-orange-600" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )
          }
          label="Sharing"
        >
          {facts.cross_system ? (
            <span className="text-orange-700 dark:text-orange-300">Cross-system</span>
          ) : (
            "Same-system"
          )}
        </Stat>
        <Stat icon={<HelpCircle className="h-3.5 w-3.5" />} label="Kinds">
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(facts.consumer_kinds).map(([k, n]) => (
              <Badge key={k} variant="secondary" className="text-[11px]">
                {k}: {n}
              </Badge>
            ))}
          </div>
        </Stat>
      </CardContent>
    </Card>
  )
}

function Stat({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-700 dark:text-zinc-400">
        {icon}
        {label}
      </div>
      <div className="text-lg font-semibold mt-0.5">{children}</div>
    </div>
  )
}

function DataCaveatsPanel({ caveats }: { caveats: string[] }) {
  if (!caveats || caveats.length === 0) return null
  return (
    <Card className="border-l-4 border-l-amber-500">
      <CardHeader className="pb-2 flex flex-row items-center gap-2">
        <Clock className="h-4 w-4 text-amber-600" />
        <CardTitle className="text-sm font-medium">Data caveats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-zinc-700 dark:text-zinc-400">
        {caveats.map((c, i) => (
          <p key={i}>{c}</p>
        ))}
      </CardContent>
    </Card>
  )
}

function EligibleGroupsPanel({ groups }: { groups: SplitPlanGroup[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-700 dark:text-zinc-400">
          Eligible groups ({groups.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-400 py-2">
            No eligible groups in this plan. Every consumer is blocked — see below for reason codes.
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <EligibleGroupCard key={g.group_id} group={g} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EligibleGroupCard({ group }: { group: SplitPlanGroup }) {
  return (
    <Card className="border-l-4 border-l-emerald-600">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">{group.proposed_role_name}</div>
            <div className="text-[11px] font-mono text-zinc-700 dark:text-zinc-400 mt-0.5">
              {group.group_id}
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {group.grouping_key.system_name && (
              <Badge variant="outline" className="text-[11px]">
                {group.grouping_key.system_name}
              </Badge>
            )}
            {group.grouping_key.consumer_type && (
              <Badge variant="secondary" className="text-[11px]">
                {group.grouping_key.consumer_type}
              </Badge>
            )}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-700 dark:text-zinc-400 mb-1">
            Consumers ({group.consumers.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {group.consumers.map((c) => (
              <Badge key={c.consumer_id} variant="outline" className="text-[11px] font-mono">
                {c.consumer_name || c.consumer_id}
              </Badge>
            ))}
          </div>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-zinc-700 dark:text-zinc-400 hover:text-foreground">
            Proposed policy document
          </summary>
          <pre className="mt-2 p-2 rounded-md bg-muted text-[11px] overflow-x-auto">
            {JSON.stringify(group.proposed_policy_document, null, 2)}
          </pre>
        </details>
      </CardContent>
    </Card>
  )
}

function BlockedConsumersPanel({ blocked }: { blocked: ConsumerEvidence[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-700 dark:text-zinc-400">
          Blocked consumers ({blocked.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {blocked.length === 0 ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-400 py-2">
            No blocked consumers — all eligible.
          </p>
        ) : (
          <div className="space-y-2">
            {blocked.map((c) => (
              <BlockedConsumerRow key={c.consumer_id} consumer={c} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BlockedConsumerRow({ consumer }: { consumer: ConsumerEvidence }) {
  return (
    <div className="border rounded-md p-3 space-y-2 text-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{consumer.consumer_name || consumer.consumer_id}</div>
          <div className="text-[11px] font-mono text-zinc-700 dark:text-zinc-400 break-all">
            {consumer.consumer_id}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {consumer.consumer_type && (
            <Badge variant="secondary" className="text-[11px]">
              {consumer.consumer_type}
            </Badge>
          )}
          {consumer.system_name && (
            <Badge variant="outline" className="text-[11px]">
              {consumer.system_name}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`${EVIDENCE_COLORS[consumer.evidence_state]} text-[11px]`}
          >
            {consumer.evidence_state}
          </Badge>
        </div>
      </div>
      {consumer.blockers.length > 0 && (
        <ul className="text-xs text-zinc-700 dark:text-zinc-400 space-y-0.5 list-disc list-inside">
          {consumer.blockers.map((b, i) => (
            <li key={i} className="break-words">{b}</li>
          ))}
        </ul>
      )}
      {consumer.observed_actions.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-zinc-700 dark:text-zinc-400 hover:text-foreground">
            Observed actions ({consumer.observed_actions.length})
          </summary>
          <div className="mt-1 flex flex-wrap gap-1">
            {consumer.observed_actions.map((a) => (
              <Badge key={a} variant="outline" className="text-[10px] font-mono">
                {a}
              </Badge>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function RawPanel({ plan }: { plan: SplitPlan }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-zinc-700 dark:text-zinc-400 hover:text-foreground p-2">
        Raw plan JSON
      </summary>
      <pre className="mt-2 p-3 rounded-md bg-muted text-[10px] overflow-x-auto leading-relaxed">
        {JSON.stringify(plan, null, 2)}
      </pre>
    </details>
  )
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}
