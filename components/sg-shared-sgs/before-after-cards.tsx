"use client"

import { useState } from "react"
import { Info, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RuleRow, type SGRule } from "./rule-row"
import { StagedPreviewBlock } from "./staged-preview-block"
import type { SharedSGBeforeSummary } from "@/lib/types"

// SG-9d centerpiece — STACKED (was side-by-side). Stacked because
// rules need horizontal room: every inbound and outbound rule of the
// source SG is rendered inline in the BEFORE card, and every cloned
// rule of every proposed scoped SG is rendered inline in the AFTER
// card. At half-width with rules visible the columns wrapped poorly.
//
// Left-border tones (semantic only):
//   BEFORE = amber (over-shared resource, needs attention)
//   AFTER  = emerald (decoupled posture, lower blast radius)
//
// The Phase-1 honesty note ("same rules cloned 1:1 — no narrowing in
// this plan, Phase 2 narrows") sits in BOTH the AFTER card footer
// AND on each scoped SG row, because Alon's natural question on
// seeing identical rules is "wait, where's the narrowing?" — the
// answer is "Phase 2."

interface Group {
  group_id: string
  proposed_group_name: string
  grouping_key?: {
    system_name?: string
    consumer_type?: string
    vpc_id?: string
  }
  proposed_vpc_id?: string
  proposed_inbound_rules?: SGRule[]
  proposed_outbound_rules?: SGRule[]
  consumers?: any[]
}

interface MembershipFinding {
  source_sg_id?: string
  peer_sg_id?: string
  port_range?: string
  message?: string
}

export function BeforeAfterCards({
  planId,
  sgInfo,
  before,
  groups,
  systemNames,
  avgBlastAfter,
  reductionPct,
  membershipExternalIn,
  membershipExternalOut,
  membershipSelfRefs,
}: {
  planId: string
  sgInfo: {
    sg_id?: string
    sg_name?: string
    vpc_id?: string | null
  }
  before: SharedSGBeforeSummary | null
  groups: Group[]
  /** Actual system tag names — shown in the "spanning N systems"
   *  copy so the operator sees which apps share this SG. */
  systemNames: string[]
  avgBlastAfter: number | null
  reductionPct: number | null
  membershipExternalIn: MembershipFinding[]
  membershipExternalOut: MembershipFinding[]
  membershipSelfRefs: MembershipFinding[]
}) {
  // v1 clones rules verbatim, so any group's proposed rules == source
  // rules. Use the first group's rules as the source projection.
  // (If 0 eligible groups, BEFORE card still renders without rules.)
  const sourceInbound = groups[0]?.proposed_inbound_rules || []
  const sourceOutbound = groups[0]?.proposed_outbound_rules || []
  const hasMembershipFlag =
    membershipExternalIn.length +
      membershipExternalOut.length +
      membershipSelfRefs.length >
    0

  return (
    <div className="space-y-4">
      <BeforeCard
        sgInfo={sgInfo}
        before={before}
        systemNames={systemNames}
        inbound={sourceInbound}
        outbound={sourceOutbound}
      />
      <AfterCard
        planId={planId}
        groups={groups}
        avgBlastAfter={avgBlastAfter}
        reductionPct={reductionPct}
        hasMembershipFlag={hasMembershipFlag}
        membershipExternalIn={membershipExternalIn}
        membershipExternalOut={membershipExternalOut}
        membershipSelfRefs={membershipSelfRefs}
      />
    </div>
  )
}

// Friendly labels for the consumer-kind breakdown. Cyntro's internal
// names ("LambdaFunction", "NetworkInterface") are jargon to an
// operator — replace with the AWS-doc terms ("Lambda", "ENI") so the
// line reads naturally: "1 Lambda · 1 LoadBalancer · 9 ENIs".
const KIND_LABEL: Record<string, { singular: string; plural: string }> = {
  LambdaFunction:   { singular: "Lambda",       plural: "Lambdas" },
  LoadBalancer:     { singular: "LoadBalancer", plural: "LoadBalancers" },
  NetworkInterface: { singular: "ENI",          plural: "ENIs" },
  EC2Instance:      { singular: "EC2",          plural: "EC2s" },
  DBInstance:       { singular: "RDS",          plural: "RDS instances" },
  Service:          { singular: "EC2",          plural: "EC2s" }, // legacy stub label
}

function kindLabel(kind: string, count: number): string {
  const m = KIND_LABEL[kind]
  if (!m) return `${count} ${kind}`
  return `${count} ${count === 1 ? m.singular : m.plural}`
}

function BeforeCard({
  sgInfo,
  before,
  systemNames,
  inbound,
  outbound,
}: {
  sgInfo: { sg_id?: string; sg_name?: string; vpc_id?: string | null }
  before: SharedSGBeforeSummary | null
  systemNames: string[]
  inbound: SGRule[]
  outbound: SGRule[]
}) {
  return (
    <Card className="border-l-4 border-l-amber-500 overflow-hidden">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-amber-700 dark:text-amber-300 font-medium">
            Before · Today
          </span>
          <span className="text-[10px] uppercase tracking-wider font-medium text-zinc-600 dark:text-zinc-300">
            1 shared SG
          </span>
        </div>

        <div className="space-y-1">
          <div className="font-mono text-[12px] break-all text-foreground">
            {sgInfo.sg_id || "—"}
          </div>
          <div className="text-sm text-zinc-700 dark:text-zinc-200">
            {sgInfo.sg_name || "—"}
          </div>
          <div className="text-[11px] text-zinc-600 dark:text-zinc-300 font-mono">
            VPC {sgInfo.vpc_id || "—"}
          </div>
        </div>

        <div className="space-y-1.5 border-t border-zinc-200 dark:border-zinc-800 pt-3">
          <div className="text-[11px] uppercase tracking-wider font-medium text-zinc-600 dark:text-zinc-300">
            Currently attached to
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-semibold tabular-nums">
              {before?.consumer_count ?? "—"}
            </span>
            <span className="text-sm text-zinc-700 dark:text-zinc-200">
              AWS resource{before?.consumer_count === 1 ? "" : "s"}
            </span>
          </div>
          {before && (
            <div className="text-[13px] text-foreground">
              {Object.entries(before.consumer_kinds)
                .sort(([, a], [, b]) => b - a)
                .map(([k, n]) => kindLabel(k, n))
                .join(" · ")}
            </div>
          )}
          <div className="text-[12px] text-zinc-700 dark:text-zinc-200 pt-1">
            These resources serve{" "}
            <b className="tabular-nums">{before?.system_count ?? "—"}</b>{" "}
            application{before?.system_count === 1 ? "" : "s"}
            {systemNames.length > 0 && (
              <>
                {": "}
                <span className="font-mono text-[11px] text-foreground">
                  {systemNames.join(", ")}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
          <RuleColumn title="Inbound" rules={inbound} />
          <RuleColumn title="Outbound" rules={outbound} />
        </div>

        {before && (before.rules.unused_phase2 > 0 || before.rules.high_risk_phase2 > 0) && (
          <Phase2Note
            unused={before.rules.unused_phase2}
            highRisk={before.rules.high_risk_phase2}
          />
        )}

        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 space-y-1">
          <div className="text-[11px] uppercase tracking-wider font-medium text-zinc-600 dark:text-zinc-300">
            Lateral exposure
          </div>
          <div className="text-sm">
            If any consumer is compromised:{" "}
            <b className="text-amber-700 dark:text-amber-300 tabular-nums">
              {before?.blast_radius_if_any_compromised ?? "—"} others
            </b>{" "}
            exposed
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AfterCard({
  planId,
  groups,
  avgBlastAfter,
  reductionPct,
  hasMembershipFlag,
  membershipExternalIn,
  membershipExternalOut,
  membershipSelfRefs,
}: {
  planId: string
  groups: Group[]
  avgBlastAfter: number | null
  reductionPct: number | null
  hasMembershipFlag: boolean
  membershipExternalIn: MembershipFinding[]
  membershipExternalOut: MembershipFinding[]
  membershipSelfRefs: MembershipFinding[]
}) {
  const hasGroups = groups.length > 0
  return (
    <Card className="border-l-4 border-l-emerald-500 overflow-hidden">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-medium">
            After · Proposed
          </span>
          <span className="text-[10px] uppercase tracking-wider font-medium text-zinc-600 dark:text-zinc-300">
            {groups.length} scoped SG{groups.length === 1 ? "" : "s"}
          </span>
        </div>

        {!hasGroups ? (
          <div className="text-sm text-zinc-700 dark:text-zinc-200 py-4 text-center">
            No eligible groups. See <b>blocked consumers</b> in Overview tab.
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <ScopedSGCard
                key={g.group_id}
                group={g}
                planId={planId}
                membership={hasMembershipFlag ? {
                  externalIn: membershipExternalIn,
                  externalOut: membershipExternalOut,
                  selfRefs: membershipSelfRefs,
                } : null}
              />
            ))}
          </div>
        )}

        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 space-y-1">
          <div className="text-[11px] uppercase tracking-wider font-medium text-zinc-600 dark:text-zinc-300">
            Lateral exposure
          </div>
          <div className="text-sm">
            Avg after split:{" "}
            <b className="text-emerald-700 dark:text-emerald-300 tabular-nums">
              {avgBlastAfter != null ? avgBlastAfter.toFixed(1) : "—"} others
            </b>
            {reductionPct != null && (
              <span className="text-zinc-700 dark:text-zinc-200">
                {" "}↘ <b className="tabular-nums">{reductionPct.toFixed(0)}%</b> reduction per consumer
              </span>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200 border-t border-zinc-200 dark:border-zinc-800 pt-3">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-500" />
          <span>
            <b className="text-foreground">Phase 1 (this plan)</b> attaches each scoped SG
            only to its system&apos;s consumers — same rules as the source, no permission
            removal. <b className="text-foreground">Phase 2</b> drops rules with no observed
            traffic per system once evidence completeness is HIGH.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function ScopedSGCard({
  group,
  planId,
  membership,
}: {
  group: Group
  planId: string
  membership: {
    externalIn: MembershipFinding[]
    externalOut: MembershipFinding[]
    selfRefs: MembershipFinding[]
  } | null
}) {
  const [expanded, setExpanded] = useState(true)
  const inbound = group.proposed_inbound_rules || []
  const outbound = group.proposed_outbound_rules || []
  const consumers = group.consumers || []
  const consumerType = group.grouping_key?.consumer_type || "—"
  const systemName = group.grouping_key?.system_name || "—"

  return (
    <div className="rounded-md border border-emerald-200/60 dark:border-emerald-900/40 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 p-3 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-emerald-600 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-emerald-600 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm">
            <b className="text-foreground">{systemName}</b>
            <span className="text-zinc-700 dark:text-zinc-200"> · {consumerType}</span>
            <span className="ml-2 text-[11px] text-zinc-600 dark:text-zinc-300 tabular-nums">
              {consumers.length} consumer{consumers.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300 truncate mt-0.5">
            {group.proposed_group_name}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-emerald-200/60 dark:border-emerald-900/40">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
            <RuleColumn title="Inbound" rules={inbound} />
            <RuleColumn title="Outbound" rules={outbound} />
          </div>

          <div className="flex items-center gap-2 text-[11px] text-zinc-700 dark:text-zinc-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            Cloned 1:1 from source SG · no permission delta on the consumer
          </div>

          {consumers.length > 0 && (
            <ConsumersList consumers={consumers} consumerType={consumerType} />
          )}

          {membership && (membership.externalIn.length > 0 || membership.externalOut.length > 0 || membership.selfRefs.length > 0) && (
            <MembershipBanner
              externalIn={membership.externalIn}
              externalOut={membership.externalOut}
              selfRefs={membership.selfRefs}
            />
          )}

          <StagedPreviewBlock planId={planId} groupId={group.group_id} />
        </div>
      )}
    </div>
  )
}

function ConsumersList({
  consumers,
  consumerType,
}: {
  consumers: any[]
  consumerType: string
}) {
  const [showAll, setShowAll] = useState(false)
  const collapseAt = 6
  const visible = showAll ? consumers : consumers.slice(0, collapseAt)
  const kindLabel = KIND_LABEL[consumerType]?.plural || consumerType

  return (
    <div className="rounded-md border border-emerald-200/60 dark:border-emerald-900/40 overflow-hidden">
      <div className="px-3 py-1.5 bg-emerald-50/40 dark:bg-emerald-950/20 border-b border-emerald-200/60 dark:border-emerald-900/40 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider font-medium text-emerald-800 dark:text-emerald-200">
          Will attach to these {kindLabel}
          <span className="text-foreground tabular-nums ml-1">({consumers.length})</span>
        </span>
      </div>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {visible.map((c, i) => (
          <li key={c.consumer_id || c.consumer_arn || i} className="px-3 py-1.5 grid grid-cols-[1fr_auto] gap-3 items-baseline">
            <div className="min-w-0">
              <div className="text-[12px] text-foreground truncate">
                {c.consumer_name || c.consumer_id || c.consumer_arn || "—"}
              </div>
              {c.consumer_name && c.consumer_id && c.consumer_name !== c.consumer_id && (
                <div className="text-[10px] font-mono text-zinc-600 dark:text-zinc-300 truncate">
                  {c.consumer_id}
                </div>
              )}
            </div>
            {c.system_name && (
              <div className="text-[10px] font-mono text-zinc-600 dark:text-zinc-300 shrink-0">
                {c.system_name}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!showAll && consumers.length > collapseAt && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors border-t border-emerald-200/60 dark:border-emerald-900/40"
        >
          Show all {consumers.length} {kindLabel.toLowerCase()}
        </button>
      )}
    </div>
  )
}

function RuleColumn({ title, rules }: { title: string; rules: SGRule[] }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1.5 bg-zinc-50 dark:bg-zinc-900/40 border-b border-zinc-200 dark:border-zinc-800">
        <div className="text-[11px] uppercase tracking-wider font-medium text-zinc-700 dark:text-zinc-200">
          {title} <span className="tabular-nums text-foreground">({rules.length})</span>
        </div>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {rules.length === 0 ? (
          <div className="p-3 text-[11px] text-zinc-600 dark:text-zinc-300 text-center">
            no {title.toLowerCase()} rules
          </div>
        ) : (
          rules.map((r, i) => <RuleRow key={i} rule={r} />)
        )}
      </div>
    </div>
  )
}

function Phase2Note({ unused, highRisk }: { unused: number; highRisk: number }) {
  return (
    <div className="rounded-md bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-2.5 text-[12px] text-zinc-700 dark:text-zinc-200 flex items-start gap-2">
      <span className="inline-flex items-center px-1.5 py-0 rounded-sm bg-slate-200 dark:bg-slate-700 text-[9px] uppercase tracking-wider text-slate-700 dark:text-slate-200 font-medium shrink-0 mt-0.5">
        phase 2
      </span>
      <span>
        Of the rules above,{" "}
        {unused > 0 && (
          <>
            <b className="tabular-nums">{unused}</b> have no observed traffic in the
            last 30 days
          </>
        )}
        {unused > 0 && highRisk > 0 && " and "}
        {highRisk > 0 && (
          <>
            <b className="tabular-nums">{highRisk}</b> are high-risk
            (broad CIDR or wildcard port)
          </>
        )}
        . Phase 2 narrows them per system once evidence is HIGH; this plan
        does not change any rules.
      </span>
    </div>
  )
}

function MembershipBanner({
  externalIn,
  externalOut,
  selfRefs,
}: {
  externalIn: MembershipFinding[]
  externalOut: MembershipFinding[]
  selfRefs: MembershipFinding[]
}) {
  return (
    <div className="rounded-md border border-amber-300 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-950/20 p-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
        <span className="text-[11px] uppercase tracking-wider font-medium text-amber-800 dark:text-amber-200">
          SG-5 membership findings
        </span>
        <Badge
          variant="outline"
          className="text-[9px] uppercase tracking-wider border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-200"
        >
          STAGED may be blocked
        </Badge>
      </div>
      <ul className="text-[11px] space-y-0.5 text-amber-900 dark:text-amber-100">
        {externalIn.length > 0 && (
          <li>
            <b>{externalIn.length}</b> external inbound SG-references —
            another SG sends traffic to this one
          </li>
        )}
        {externalOut.length > 0 && (
          <li>
            <b>{externalOut.length}</b> external outbound SG-references —
            this SG references another by id
          </li>
        )}
        {selfRefs.length > 0 && (
          <li>
            <b>{selfRefs.length}</b> self-references — rule names this SG itself
          </li>
        )}
      </ul>
    </div>
  )
}
