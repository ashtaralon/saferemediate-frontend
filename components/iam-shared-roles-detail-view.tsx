"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Clock,
  Loader2,
  ShieldAlert,
  ShieldCheck,
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

// ─── Color maps ────────────────────────────────────────────────────

const STATE_COLORS: Record<SplitPlanState, string> = {
  PROPOSED: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-700/50",
  APPROVED: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-700/50",
  EXECUTING: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-700/50",
  EXECUTED: "bg-zinc-100 text-zinc-900 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700",
  REJECTED: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/40 dark:text-red-200 dark:border-red-700/50",
  EXPIRED: "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700",
}

const EVIDENCE_COLORS: Record<EvidenceState, string> = {
  HIGH: "bg-emerald-100 text-emerald-900 border-emerald-300",
  NONE: "bg-zinc-100 text-zinc-700 border-zinc-300",
  CONFLICTED: "bg-orange-100 text-orange-900 border-orange-300",
  COMPLEX_POLICY: "bg-purple-100 text-purple-900 border-purple-300",
}

// Operator-facing translation of machine reason codes.
// Raw codes still travel in the JSON for engineers.
const REASON_LABELS: Record<string, string> = {
  no_observed_actions: "Awaiting first observed activity",
  missing_session_issuer_attribution: "Per-role attribution pending data plane fix",
  out_of_scope_actions: "Observed activity includes actions outside this role's policy",
}

function humanReason(code: string): string {
  // Codes are of the form "key: description" — split and look up the key.
  const key = code.split(":")[0]?.trim()
  return key ? (REASON_LABELS[key] ?? code) : code
}

// ─── Root component ────────────────────────────────────────────────

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
      <div className="p-6 max-w-5xl">
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
    <div className="p-6 space-y-5 max-w-5xl">
      <BackLink />
      <PlanHero plan={plan} />
      <WhatWeHave plan={plan} />
      <WhyItMatters plan={plan} />
      <WhatCyntroWillDo />
      <WhereThisStands plan={plan} />
      <ApprovalAction plan={plan} onApproved={reload} />
      <ConsumersAndGroups plan={plan} />
      <EngineeringDetails plan={plan} />
    </div>
  )
}

// ─── Section: BackLink ─────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/iam/shared-roles"
      className="inline-flex items-center text-sm text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
    >
      <ChevronLeft className="h-4 w-4 mr-1" />
      Back to shared roles
    </Link>
  )
}

// ─── Section: PlanHero ─────────────────────────────────────────────

function PlanHero({ plan }: { plan: SplitPlan }) {
  return (
    <header className="space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h1 className="text-3xl font-bold tracking-tight">
          {plan.shared_role.role_name}
        </h1>
        <Badge variant="outline" className={`${STATE_COLORS[plan.state]} text-sm shrink-0`}>
          {plan.state}
        </Badge>
      </div>
      <p className="text-sm text-zinc-700 dark:text-zinc-400 font-mono break-all">
        {plan.shared_role.role_arn}
      </p>
    </header>
  )
}

// ─── Section: What we have ─────────────────────────────────────────

function WhatWeHave({ plan }: { plan: SplitPlan }) {
  const count = plan.discovery_facts.consumer_count
  const kindSummary = summarizeKinds(plan.discovery_facts.consumer_kinds, count)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
          What we have
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-base leading-relaxed">
          This IAM role is attached to{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">
            {count} {kindSummary}
          </strong>
          . Every one of them gets the{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">
            same full set of permissions
          </strong>{" "}
          — including the permissions only some of them actually need.
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Section: Why it matters ───────────────────────────────────────

function WhyItMatters({ plan }: { plan: SplitPlan }) {
  const cross = plan.discovery_facts.cross_system
  const systems = plan.discovery_facts.system_tags
  const count = plan.discovery_facts.consumer_count

  return (
    <Card
      className={
        cross
          ? "border-l-4 border-l-orange-600"
          : "border-l-4 border-l-zinc-300 dark:border-l-zinc-700"
      }
    >
      <CardHeader className="pb-2 flex flex-row items-center gap-2">
        {cross ? (
          <ShieldAlert className="h-4 w-4 text-orange-600" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
        )}
        <CardTitle className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
          Why it matters
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-base leading-relaxed">
          If any one of these {count} principals is compromised, the attacker
          inherits the{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">
            full union
          </strong>{" "}
          of every permission this role grants — not just the permissions that
          principal actually uses. This is{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">
            blast radius
          </strong>
          .
        </p>
        {cross ? (
          <p className="text-base leading-relaxed text-orange-800 dark:text-orange-200 font-medium">
            ⚠ This role bridges {systems.length} systems
            {systems.length > 0 ? ` (${systems.join(" + ")})` : ""}. A compromise
            crosses team boundaries. This is the highest-severity sharing
            pattern.
          </p>
        ) : (
          <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            All consumers belong to the same system
            {systems.length === 1 ? ` (${systems[0]})` : ""}. The blast radius
            is contained within one team.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Section: What Cyntro will do ──────────────────────────────────

function WhatCyntroWillDo() {
  // Static product description. Same on every plan page — not data.
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
          What Cyntro will do
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2 text-base leading-relaxed list-decimal list-inside marker:text-zinc-500 marker:font-semibold">
          <li>Watch each consumer's actual API activity.</li>
          <li>Group consumers that need the same set of permissions.</li>
          <li>Propose one tighter, scoped IAM role per group.</li>
          <li>
            When you approve, create the new roles in AWS — unattached, safe to
            inspect.
          </li>
          <li>
            (Future) Swap each consumer over to its scoped role, with snapshot
            and rollback.
          </li>
        </ol>
      </CardContent>
    </Card>
  )
}

// ─── Section: Where this plan stands ───────────────────────────────

type ChecklistStatus = "done" | "ready" | "pending" | "blocked"

function WhereThisStands({ plan }: { plan: SplitPlan }) {
  const consumerCount = plan.discovery_facts.consumer_count
  const eligibleGroupCount = plan.eligible_groups.length
  const blockedCount = plan.blocked_consumers.length
  const observedCount = consumerCount - blockedCount
  const hasGroups = eligibleGroupCount > 0
  const isApprovable = plan.state === "PROPOSED" && hasGroups && !plan.expired

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
          Where this plan stands
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ChecklistItem status="done" label="Shared role identified" />
        <ChecklistItem
          status="done"
          label={`${consumerCount} consumers identified`}
        />
        <ChecklistItem
          status={observedCount > 0 ? "done" : "pending"}
          label={
            observedCount > 0
              ? `Observed activity available for ${observedCount} of ${consumerCount} consumers`
              : `Awaiting first observed activity: ${blockedCount} of ${consumerCount}`
          }
          hint={
            observedCount === 0
              ? "Cyntro hasn't yet seen these consumers make API calls. Check back as data accumulates."
              : null
          }
        />
        <ChecklistItem
          status={hasGroups ? "done" : "pending"}
          label={
            hasGroups
              ? `Groups proposed: ${eligibleGroupCount}`
              : "Groups proposed: 0 (will appear once activity is observed)"
          }
        />
        <ChecklistItem
          status={
            plan.state === "APPROVED"
              ? "done"
              : plan.state === "EXECUTED"
              ? "done"
              : isApprovable
              ? "ready"
              : "blocked"
          }
          label={
            plan.state === "APPROVED"
              ? "Approved"
              : plan.state === "EXECUTED"
              ? "Executed"
              : isApprovable
              ? "Ready for approval"
              : "Approval: not meaningful yet"
          }
          hint={
            !hasGroups && plan.state === "PROPOSED"
              ? "There are no proposed groups to approve. Approval activates when at least one group has observed activity."
              : null
          }
        />
      </CardContent>
    </Card>
  )
}

function ChecklistItem({
  status,
  label,
  hint,
}: {
  status: ChecklistStatus
  label: string
  hint?: string | null
}) {
  const icon =
    status === "done" ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
    ) : status === "ready" ? (
      <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
    ) : status === "pending" ? (
      <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
    ) : (
      <Circle className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
    )
  return (
    <div className="flex items-start gap-2.5">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && (
          <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            {hint}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Section: Approval action ──────────────────────────────────────

function ApprovalAction({
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

  const eligibleCount = plan.eligible_groups.length

  // Terminal states first.
  if (plan.state === "APPROVED") {
    return (
      <Card className="border-l-4 border-l-emerald-600">
        <CardContent className="py-3 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>
            This plan has been approved. Execution (creating the new roles in
            AWS) ships in a future step.
          </span>
        </CardContent>
      </Card>
    )
  }

  if (plan.state !== "PROPOSED") {
    return (
      <Card className="border-l-4 border-l-zinc-400">
        <CardContent className="py-3 text-sm text-zinc-700 dark:text-zinc-400">
          Approval not available in state{" "}
          <span className="font-mono">{plan.state}</span>.
        </CardContent>
      </Card>
    )
  }

  if (plan.expired) {
    return (
      <Card className="border-l-4 border-l-zinc-500">
        <CardContent className="py-3 text-sm text-zinc-700 dark:text-zinc-400">
          This plan has expired. Re-generate to approve.
        </CardContent>
      </Card>
    )
  }

  // 0 eligible groups: disabled button with honest copy.
  if (eligibleCount === 0) {
    return (
      <Card className="border-l-4 border-l-zinc-300 dark:border-l-zinc-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Approve this plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-400">
            There's nothing to approve yet. Once at least one group of
            consumers has observed activity, this button activates.
          </p>
          <Button disabled className="opacity-60 cursor-not-allowed">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Approve plan
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Active approval form — only when there's something to approve.
  const submit = async () => {
    if (!approvedBy.trim()) {
      setSubmitError("Approver identity is required")
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      await approveSplitPlan(
        plan.plan_id,
        approvedBy.trim(),
        note.trim() || undefined
      )
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
        <p className="text-sm text-zinc-700 dark:text-zinc-400">
          Approving locks in the {eligibleCount} proposed group
          {eligibleCount === 1 ? "" : "s"} and unlocks the next step (creating
          the new roles in AWS).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Your identity (email or name)"
            value={approvedBy}
            onChange={(e) => setApprovedBy(e.target.value)}
            disabled={submitting}
            className="h-9 px-3 text-sm rounded-md border bg-background"
          />
          <div className="text-xs text-zinc-600 dark:text-zinc-400 self-center">
            Self-attested until SSO. Recorded on the audit log.
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
        <Button onClick={submit} disabled={submitting || !approvedBy.trim()}>
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          )}
          {submitting ? "Approving…" : "Approve plan"}
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Section: Consumers and groups ─────────────────────────────────

function ConsumersAndGroups({ plan }: { plan: SplitPlan }) {
  const eligible = plan.eligible_groups
  const blocked = plan.blocked_consumers
  const hasGroups = eligible.length > 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
          {hasGroups
            ? `Proposed scoped roles (${eligible.length})`
            : `Consumers on this role (${blocked.length})`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasGroups && (
          <div className="space-y-3">
            {eligible.map((g) => (
              <EligibleGroupCard key={g.group_id} group={g} />
            ))}
          </div>
        )}
        {blocked.length > 0 && (
          <details className={hasGroups ? "mt-2" : ""}>
            <summary className="cursor-pointer text-sm font-medium text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-zinc-50">
              {hasGroups
                ? `Show ${blocked.length} consumer${blocked.length === 1 ? "" : "s"} awaiting evidence`
                : `Show consumer list`}
            </summary>
            <div className="mt-3 space-y-2">
              {blocked.map((c) => (
                <ConsumerRow key={c.consumer_id} consumer={c} />
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

function ConsumerRow({ consumer }: { consumer: ConsumerEvidence }) {
  const reason =
    consumer.blockers.length > 0
      ? humanReason(consumer.blockers[0])
      : consumer.evidence_state === "HIGH"
      ? "Ready to group"
      : "Status pending"
  return (
    <div className="flex items-start gap-3 p-3 border rounded-md">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">
          {consumer.consumer_name || consumer.consumer_id}
        </div>
        <div className="text-xs font-mono text-zinc-600 dark:text-zinc-400 break-all">
          {consumer.consumer_id}
        </div>
        {consumer.system_name && (
          <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            System: {consumer.system_name}
          </div>
        )}
      </div>
      <div className="text-xs text-zinc-700 dark:text-zinc-400 shrink-0 text-right max-w-[45%]">
        {reason}
      </div>
    </div>
  )
}

function EligibleGroupCard({ group }: { group: SplitPlanGroup }) {
  return (
    <Card className="border-l-4 border-l-emerald-600">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">
              {group.proposed_role_name}
            </div>
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
            Consumers in this group ({group.consumers.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {group.consumers.map((c) => (
              <Badge
                key={c.consumer_id}
                variant="outline"
                className="text-[11px] font-mono"
              >
                {c.consumer_name || c.consumer_id}
              </Badge>
            ))}
          </div>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
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

// ─── Section: Engineering details (collapsed) ──────────────────────

function EngineeringDetails({ plan }: { plan: SplitPlan }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 p-2">
        Engineering details
      </summary>
      <div className="mt-2 p-4 border rounded-md space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs text-zinc-800 dark:text-zinc-200">
          <MetaLine label="Plan ID">{plan.plan_id}</MetaLine>
          <MetaLine label="Plan hash">{plan.plan_hash.slice(0, 16)}…</MetaLine>
          <MetaLine label="Created">{formatTime(plan.created_at)}</MetaLine>
          <MetaLine label="Expires">
            {formatTime(plan.expires_at)}
            {plan.expired && (
              <span className="text-red-600 ml-1">(expired)</span>
            )}
          </MetaLine>
          <MetaLine label="Requested by">{plan.requested_by}</MetaLine>
          <MetaLine label="Modes enabled">
            {plan.execution_modes_enabled.join(", ") || "—"}
          </MetaLine>
        </div>
        {plan.data_caveats.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
              Data caveats (engineering)
            </div>
            {plan.data_caveats.map((c, i) => (
              <p
                key={i}
                className="text-xs text-zinc-700 dark:text-zinc-400 leading-relaxed"
              >
                {c}
              </p>
            ))}
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
            Raw plan JSON
          </summary>
          <pre className="mt-2 p-3 rounded-md bg-muted text-[10px] overflow-x-auto leading-relaxed">
            {JSON.stringify(plan, null, 2)}
          </pre>
        </details>
      </div>
    </details>
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
    <div className="font-mono">
      <span className="uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
        {label}:
      </span>{" "}
      <span>{children}</span>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────

function summarizeKinds(
  kinds: Record<string, number>,
  total: number
): string {
  // "18 Lambda functions" if homogeneous; "12 principals (8 Lambda, 4 EC2)"
  // if mixed. Names are operator-friendly, not raw kind labels.
  const entries = Object.entries(kinds).filter(([, n]) => n > 0)
  if (entries.length === 0) return "principals"
  if (entries.length === 1) {
    return friendlyKind(entries[0][0], entries[0][1])
  }
  const sorted = [...entries].sort((a, b) => b[1] - a[1])
  const breakdown = sorted
    .map(([k, n]) => `${n} ${friendlyKind(k, n, /*short*/ true)}`)
    .join(", ")
  return `principals (${breakdown})`
}

function friendlyKind(kind: string, n: number, short = false): string {
  // Map graph labels to operator-friendly names.
  const map: Record<string, [string, string]> = {
    LambdaFunction: ["Lambda function", "Lambda functions"],
    Lambda: ["Lambda function", "Lambda functions"],
    EC2Instance: ["EC2 instance", "EC2 instances"],
    InstanceProfile: ["instance profile", "instance profiles"],
    IAMRole: ["IAM role", "IAM roles"],
    Service: ["service", "services"],
    Resource: ["resource", "resources"],
  }
  const [singular, plural] = map[kind] || [kind, kind]
  if (short) {
    // Compact form for multi-kind breakdown, e.g. "Lambda" not "Lambda functions"
    const shortMap: Record<string, string> = {
      LambdaFunction: "Lambda",
      Lambda: "Lambda",
      EC2Instance: "EC2",
      InstanceProfile: "InstanceProfile",
      IAMRole: "IAMRole",
      Service: "Service",
      Resource: "Resource",
    }
    return shortMap[kind] || kind
  }
  return n === 1 ? singular : plural
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}
