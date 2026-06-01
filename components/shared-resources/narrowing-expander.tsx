"use client"

// Drop-in expandable "Show narrowing analysis" footer for any IAM-role
// or SG card in the existing per-resource-analysis surface.
//
// Wraps the 3-column KEEP / NARROW AWAY / INVESTIGATE primitive from
// the canonical NarrowingDiffPanel, but takes simpler props
// (resourceType + identifier) so it can be dropped onto cards that
// don't carry the full SharedResourceRow shape.
//
// Discipline:
//  - pattern_render_the_answer_not_the_inventory — the expander is
//    the answer-rendering hook that turns the existing inventory
//    cards into actionable surfaces. Operator clicks → sees the
//    keep / narrow / investigate triage inline.
//  - feedback_signal_language — the toggle label is descriptive
//    ("Narrowing analysis"), not framing pressure.
//  - pattern_no_phantom_capabilities_in_ui — collapsed state shows
//    a neutral chip-style button; expanded state shows real data
//    OR the honest empty-state per-column.

import { useState } from "react"
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react"
import { NarrowingDiffPanel } from "./narrowing-diff-panel"
import type { SharedResourceRow } from "./types"

interface Props {
  resourceType: "iam-role" | "security-group"
  /** For IAM: the role_name. For SG: the sg_id. */
  identifier: string
  /** Optional human-readable name for the header. Falls back to identifier. */
  displayName?: string
}

export function NarrowingExpander({ resourceType, identifier, displayName }: Props) {
  const [open, setOpen] = useState(false)

  // Construct a minimal stub-row that satisfies NarrowingDiffPanel's
  // prop contract. NarrowingDiffPanel only reads row.type +
  // (row.role_name OR row.sg_id) to build the fetch URL, so the rest
  // of the SharedResourceRow shape can be filled with safe defaults.
  // Cast at the boundary to avoid leaking optional-everywhere into
  // the strict canonical SharedResourceRow type.
  const stubRow: SharedResourceRow =
    resourceType === "iam-role"
      ? ({
          type: "iam-role",
          role_name: identifier,
          role_arn: identifier,
          resource_type: "IAMRole",
          consumer_count: 0,
          consumer_kinds: {},
          system_tags: [],
          cross_system: false,
          has_active_plan: false,
          active_plan_id: null,
          allowed_count: 0,
          keep_count: 0,
          narrow_count: 0,
          investigation_count: 0,
          narrowable_pct: 0,
          headline_state: "no_lp_data",
          is_platform_owned: false,
          sort_score: 0,
        } satisfies SharedResourceRow)
      : ({
          type: "security-group",
          sg_id: identifier,
          sg_name: displayName ?? identifier,
          vpc_id: "",
          consumer_count: 0,
          consumer_breakdown: {},
          rule_summary: {
            inbound: 0,
            outbound: 0,
            unused: 0,
            high_risk: 0,
            has_public_ingress: false,
          },
          traffic_ports_observed: 0,
          has_blocked_reasons: false,
          blocked_reasons: [],
          allowed_count: 0,
          keep_count: 0,
          narrow_count: 0,
          investigation_count: 0,
          narrowable_pct: 0,
          headline_state: "no_rule_data",
          is_platform_owned: false,
          sort_score: 0,
        } satisfies SharedResourceRow)

  return (
    <div
      className="mt-2 rounded-lg border border-slate-700/60 bg-slate-900/30 overflow-hidden"
      data-narrowing-expander="true"
      data-narrowing-expander-type={resourceType}
      data-narrowing-expander-identifier={identifier}
      data-narrowing-expander-state={open ? "open" : "closed"}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="w-full flex items-center justify-between gap-2 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-teal-400" />
          Narrowing analysis
          <span className="text-[10px] text-slate-500 font-normal ml-1">
            (KEEP · NARROW AWAY · INVESTIGATE)
          </span>
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        )}
      </button>
      {open && (
        <div className="border-t border-slate-700/60 px-4 py-3">
          <NarrowingDiffPanel row={stubRow} />
        </div>
      )}
    </div>
  )
}
