"use client"

/**
 * Unified Orphan Resources panel — a read-only surface that currently presents
 * NO orphan findings, and says why for each family.
 *
 * `lib/orphan-availability.ts` is the capability contract. It keeps READ
 * support and ACTION support apart, and at the moment every entry in both is
 * false, so this page issues no request at all.
 *
 * Three families are refused at the serving boundary: their populations come
 * from a live account enumeration (`iam:ListRoles`, `iam:ListPolicies`,
 * `s3:ListBuckets`) and `live_aws_forbidden()` is true on every HTTP call
 * path, so asking is guaranteed to answer 503.
 *
 * The fourth looked serveable and is not, which is the harder case. The
 * security-group endpoint reads collected graph facts and never calls AWS —
 * but it hands those rows to the legacy `determine_status_and_severity`
 * calculator, counts orphan/unused from what that returns, drops every row the
 * calculator calls active, and ships `status`, `severity`, `recommendation`,
 * `safe_to_delete` and `confidence`. The population is selected by that
 * judgement, so no part of the response can be quoted without quoting it.
 * Hiding one column did not contain that; not reading it does. P4D.4 owns
 * migrating the judgement into the Decision Layer, and this page shows it
 * again when that lands.
 *
 * Scope, for accuracy: the SG read would be **deployment-scoped**, not
 * account-wide — `resolve_system_name(None)` resolves one system from the
 * deployment's tenant pin, answers 422 naming them when the tenant has
 * several, and 503 when it can resolve none.
 *
 * No Quarantine or Delete control is rendered either. Those routes refuse
 * every request-path call at the boundary, and `/api/quarantine/pre-check`
 * requires a `systemName` this view does not carry. They return with a
 * controlled execution route (P8 / P4D.4).
 */

import { useState } from "react"
import { AlertTriangle, Database, Info, Key, Lock, Server, Shield } from "lucide-react"
import { BackToDashboard } from "@/components/back-to-dashboard"
import {
  ACTION_UNAVAILABLE_NOTE,
  anyActionSupported,
  declaredUnavailable,
  readSupportedFamilies,
  SCOPE_NOTE,
  type OrphanFamily,
  type Unavailable,
} from "@/lib/orphan-availability"

type TabKey = "summary" | OrphanFamily

const TAB_META: Record<OrphanFamily, { label: string; icon: any; description: string }> = {
  iam_role: {
    label: "IAM Roles",
    icon: Key,
    description: "Roles with no recent AssumeRole events and no fresh graph edges.",
  },
  s3_bucket: {
    label: "S3 Buckets",
    icon: Database,
    description: "Buckets with no observed read/write access in the lookback window.",
  },
  iam_policy: {
    label: "IAM Policies",
    icon: Lock,
    description: "Customer-managed policies with zero attachments and no permissions-boundary usage.",
  },
  security_group: {
    label: "Security Groups",
    icon: Shield,
    description: "Unattached SGs, once the orphan judgement itself is served by the Decision Layer.",
  },
}

const FAMILIES: OrphanFamily[] = ["iam_role", "s3_bucket", "iam_policy", "security_group"]

export function OrphanResourcesPanel() {
  const [activeTab, setActiveTab] = useState<TabKey>("summary")

  // No fetch, no findings state, no counts. Every family is unavailable, and
  // its reason comes from the declared contract rather than from a request
  // that was always going to be refused or always going to carry a verdict.
  // There is deliberately no dormant rendering path for a finding: a table
  // that formats `status`, `severity` or `recommendation` is one flag away
  // from presenting the legacy classifier as Decision authority again.
  const unavailable: Record<OrphanFamily, Unavailable | undefined> = {
    iam_role: declaredUnavailable("iam_role"),
    s3_bucket: declaredUnavailable("s3_bucket"),
    iam_policy: declaredUnavailable("iam_policy"),
    security_group: declaredUnavailable("security_group"),
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto p-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <BackToDashboard
              className="p-2 -ml-2 rounded-lg hover:bg-slate-800 transition-colors mt-1 shrink-0"
              iconClassName="w-5 h-5 text-slate-300"
            />
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-amber-300" />
                Orphan Resources
              </h1>
              <p className="text-slate-400 text-sm mt-1 max-w-3xl">
                Read-only view of resources with no observed use. No family can be
                presented here yet — each card and tab says which reason applies.{" "}
                {SCOPE_NOTE}
              </p>
            </div>
          </div>
        </header>

        {!anyActionSupported() && (
          // Rendered from the capability matrix, not from a literal: when an
          // action becomes available this banner goes away on its own.
          <div className="mb-4 p-3 rounded border border-slate-700 bg-slate-900/50 text-slate-400 text-xs flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" />
            <span>{ACTION_UNAVAILABLE_NOTE}</span>
          </div>
        )}

        <div className="flex gap-2 border-b border-slate-800 mb-4">
          {(["summary", ...FAMILIES] as TabKey[]).map((k) => {
            const isActive = activeTab === k
            const label = k === "summary" ? "Summary" : TAB_META[k].label
            return (
              <button
                key={k}
                onClick={() => setActiveTab(k)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? "border-amber-400 text-amber-200"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {activeTab === "summary" ? (
          <SummaryGrid unavailable={unavailable} />
        ) : (
          <UnavailableState detail={unavailable[activeTab]} />
        )}
      </div>
    </div>
  )
}

function SummaryGrid({
  unavailable,
}: {
  unavailable: Record<OrphanFamily, Unavailable | undefined>
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {FAMILIES.map((family) => (
        <SummaryCard key={family} family={family} unavailable={unavailable[family]} />
      ))}
    </div>
  )
}

/**
 * A card with no numbers in it.
 *
 * There is no counts branch to fall back to. Orphan, stale and unused totals
 * are outputs of the legacy classifier for every family that has them, so this
 * page has no total it is entitled to print — and a card that could print one
 * under a flag is the same defect waiting to be re-enabled.
 */
function SummaryCard({
  family,
  unavailable,
}: {
  family: OrphanFamily
  unavailable?: Unavailable
}) {
  const meta = TAB_META[family]
  const Icon = meta.icon
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-slate-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            {meta.label}
          </h3>
        </div>
        <span className="text-xs text-slate-500">not available</span>
      </div>
      <div className="rounded border border-slate-700 bg-slate-950/40 p-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Not available
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {unavailable?.reason ?? "No reason recorded for this family."}
        </p>
      </div>
      <p className="mt-3 text-xs text-slate-500">{meta.description}</p>
    </div>
  )
}

/** Nothing was read, so nothing is claimed. */
function UnavailableState({ detail }: { detail?: Unavailable }) {
  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-slate-700 bg-slate-950/40 p-6 text-center">
      <Server className="w-8 h-8 mx-auto mb-3 opacity-40 text-slate-500" />
      <div className="text-sm font-semibold text-slate-300">Not available</div>
      <p className="mt-2 text-xs text-slate-500">
        {detail?.reason ?? "No reason recorded for this family."}
      </p>
      <p className="mt-3 text-[11px] text-slate-600">
        No request was issued, and no action is offered. Orphan and quarantine
        capability for this surface is owned by P4D.4.
      </p>
    </div>
  )
}
