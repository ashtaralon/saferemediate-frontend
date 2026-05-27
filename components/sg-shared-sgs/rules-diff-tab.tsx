"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RuleRow, type SGRule } from "./rule-row"
import { fetchSGStagePreview } from "@/lib/api-client"

// SG-9d Rules-diff tab. One collapsible per proposed group, expanded
// by default. Inside: two-column rule list with the ACTUAL rules
// (not just a count). Each list capped at 5 rows with "Show all".
// At the bottom: "Identical to source SG. v1 clones rules verbatim."
// — the line that kills the "did we drop rules I need?" panic.
// SG-5 evidence (external/self refs) banners ABOVE the rules when
// present, since they affect whether STAGED is permitted on the group.

interface GroupRules {
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

export function RulesDiffTab({
  planId,
  sourceSGId,
  groups,
  membershipExternalIn,
  membershipExternalOut,
  membershipSelfRefs,
  scrollToGroupId,
}: {
  planId: string
  sourceSGId: string | undefined
  groups: GroupRules[]
  membershipExternalIn: MembershipFinding[]
  membershipExternalOut: MembershipFinding[]
  membershipSelfRefs: MembershipFinding[]
  /** When BeforeAfterCards triggers a jump, parent passes the id here
   *  so the matching group auto-expands and scrolls into view. */
  scrollToGroupId?: string | null
}) {
  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No eligible groups in this plan. Inspect blocked consumers
          and data caveats in the Overview tab.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground px-1">
        Source SG{" "}
        <span className="font-mono">{sourceSGId || "—"}</span>{" "}
        is cloned 1:1 into each scoped SG below. v1 does not modify rules.
      </div>

      {groups.map((g) => (
        <GroupRulesCard
          key={g.group_id}
          group={g}
          planId={planId}
          autoExpand={g.group_id === scrollToGroupId}
          membership={{
            externalIn: membershipExternalIn.filter(
              (m) => !m.source_sg_id || m.source_sg_id === sourceSGId
            ),
            externalOut: membershipExternalOut.filter(
              (m) => !m.source_sg_id || m.source_sg_id === sourceSGId
            ),
            selfRefs: membershipSelfRefs,
          }}
        />
      ))}
    </div>
  )
}

function GroupRulesCard({
  group,
  planId,
  autoExpand,
  membership,
}: {
  group: GroupRules
  planId: string
  autoExpand: boolean
  membership: {
    externalIn: MembershipFinding[]
    externalOut: MembershipFinding[]
    selfRefs: MembershipFinding[]
  }
}) {
  const [expanded, setExpanded] = useState(true)
  const [showAllIn, setShowAllIn] = useState(false)
  const [showAllOut, setShowAllOut] = useState(false)
  const [preview, setPreview] = useState<any>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Auto-scroll if BeforeAfterCards triggered a jump.
  const ref = (el: HTMLDivElement | null) => {
    if (autoExpand && el) {
      setExpanded(true)
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" })
      })
    }
  }

  const inbound = group.proposed_inbound_rules || []
  const outbound = group.proposed_outbound_rules || []
  const visibleIn = showAllIn ? inbound : inbound.slice(0, 5)
  const visibleOut = showAllOut ? outbound : outbound.slice(0, 5)

  const hasMembershipFlag =
    membership.externalIn.length +
      membership.externalOut.length +
      membership.selfRefs.length >
    0

  const handlePreview = async () => {
    setPreviewLoading(true)
    setPreviewError(null)
    setPreview(null)
    try {
      const r = await fetchSGStagePreview(planId, group.group_id)
      setPreview(r)
    } catch (e: any) {
      setPreviewError(String(e?.message ?? e))
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <Card ref={ref as any} id={`group-${group.group_id}`}>
      <CardContent className="p-0">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors text-left"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[12px] truncate text-foreground">
              {group.proposed_group_name}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              <b className="text-foreground">{group.grouping_key?.system_name || "—"}</b>
              {" · "}
              {group.grouping_key?.consumer_type || "—"}
              {" · "}
              {(group.consumers || []).length} consumer
              {(group.consumers || []).length === 1 ? "" : "s"}
              {" · "}
              <span className="font-mono">{group.proposed_vpc_id || "—"}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-[11px] h-7"
            onClick={(e) => {
              e.stopPropagation()
              handlePreview()
            }}
            disabled={previewLoading}
          >
            {previewLoading ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : null}
            Preview STAGED
          </Button>
        </button>

        {expanded && (
          <div className="px-3 pb-3 space-y-3">
            {hasMembershipFlag && (
              <MembershipBanner
                externalIn={membership.externalIn}
                externalOut={membership.externalOut}
                selfRefs={membership.selfRefs}
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <RuleColumn
                title="Inbound"
                rules={visibleIn}
                total={inbound.length}
                showAll={showAllIn}
                onShowAll={() => setShowAllIn(true)}
              />
              <RuleColumn
                title="Outbound"
                rules={visibleOut}
                total={outbound.length}
                showAll={showAllOut}
                onShowAll={() => setShowAllOut(true)}
              />
            </div>

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Identical to source SG. v1 clones rules verbatim — no
              permission changes on the consumer.
            </div>

            {previewError && (
              <div className="text-[11px] text-red-700 dark:text-red-300 p-2 rounded bg-red-50 dark:bg-red-950/30">
                {previewError}
              </div>
            )}
            {preview && <StagedPreviewBlock preview={preview} />}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RuleColumn({
  title,
  rules,
  total,
  showAll,
  onShowAll,
}: {
  title: string
  rules: SGRule[]
  total: number
  showAll: boolean
  onShowAll: () => void
}) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1.5 bg-zinc-50 dark:bg-zinc-900/40 border-b border-zinc-200 dark:border-zinc-800">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {title}{" "}
          <span className="tabular-nums text-foreground">({total})</span>
        </div>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {rules.length === 0 ? (
          <div className="p-3 text-[11px] text-muted-foreground text-center">
            no {title.toLowerCase()} rules
          </div>
        ) : (
          rules.map((r, i) => <RuleRow key={i} rule={r} />)
        )}
      </div>
      {!showAll && total > rules.length && (
        <button
          onClick={onShowAll}
          className="w-full py-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors border-t border-zinc-200 dark:border-zinc-800"
        >
          Show all {total} rules
        </button>
      )}
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
        <span className="text-[11px] uppercase tracking-wide font-medium text-amber-800 dark:text-amber-200">
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
      <div className="text-[10px] text-amber-700 dark:text-amber-300">
        These do not block CREATE_ONLY. They do block STAGED swap because
        a peer SG that referenced the source would lose the reference
        after detach.
      </div>
    </div>
  )
}

function StagedPreviewBlock({ preview }: { preview: any }) {
  const summary = preview.summary || {}
  const blockers = preview.overall_blockers || []
  const consumers: any[] = preview.consumers || []
  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-2.5 space-y-2 bg-zinc-50/40 dark:bg-zinc-900/30">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          STAGED preview
        </span>
        <Badge variant="outline" className="text-[10px]">
          {summary.ratio_label || "—"} swappable
        </Badge>
      </div>
      {blockers.length > 0 && (
        <ul className="text-[11px] space-y-0.5">
          {blockers.map((b: any, i: number) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 text-red-600 shrink-0" />
              <span className="font-mono">{b.code}</span>
              <span className="text-muted-foreground">{b.message}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1">
        {consumers.slice(0, 5).map((c) => (
          <div
            key={c.consumer_id}
            className="font-mono text-[10px] flex items-center gap-2"
          >
            <span className="truncate">{c.consumer_id}</span>
            {c.actionable ? (
              <span className="text-emerald-600">
                {c.sgs_to_remove?.length ? `−${c.sgs_to_remove.join(",")} ` : ""}
                {c.sgs_to_add?.length ? `+${c.sgs_to_add.join(",")}` : ""}
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-300">
                {(c.blockers || []).map((b: any) => b.code).join(" · ")}
              </span>
            )}
          </div>
        ))}
        {consumers.length > 5 && (
          <div className="text-[10px] text-muted-foreground">
            +{consumers.length - 5} more…
          </div>
        )}
      </div>
    </div>
  )
}
