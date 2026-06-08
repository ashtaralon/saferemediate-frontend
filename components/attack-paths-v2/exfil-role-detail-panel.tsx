"use client"

/**
 * RoleDetailPanel — slide-in details surface for an IAM role on the
 * EXFIL canvas. Built 2026-05-27 after Alon's "i cant understand
 * nothing" pushback on the prior all-stacked-on-one-chip rendering.
 *
 * The role chip on the canvas stays COMPACT (name + perm gauge +
 * one-line narrative). Clicking it opens this panel from the right
 * with the same data organized into TABS so the operator picks the
 * dimension they want to inspect, one at a time.
 *
 * Tabs:
 *   Lateral   — ALSO REACHES + SHARED WITH (the cross-path reach)
 *   Sessions  — ASSUMED BY (observed STS-assumed sessions)
 *   Policies  — POLICIES ATTACHED (managed + inline)
 *   Actions   — ACTIONS USED (distinct iam_action observed)
 *
 * Data shape mirrors SecurityCheckpoint exactly — no new field on
 * the role chip is needed; the panel reads what the chip already
 * carries.
 */

import { useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, ExternalLink, X } from "lucide-react"

type LateralJewel = {
  id: string
  name: string
  type: string
  hits: number
}
type LateralConsumer = {
  id: string
  name: string
  type: string
  system_name: string | null
}
type Session = {
  id: string
  session_name: string
  calls: number
  last_seen: string | null
}
type Policy = {
  name: string
  attachment_type: string | null
  is_aws_managed: boolean | null
}
type Action = {
  action: string
  calls: number
}

export interface RoleDetailPanelProps {
  roleId: string
  roleName: string
  usedCount: number
  totalCount: number
  gapCount: number
  alsoReaches: LateralJewel[]
  sharedWith: LateralConsumer[]
  assumedBy: Session[]
  policiesAttached: Policy[]
  actionsUsed: Action[]
  onClose: () => void
}

type TabKey = "lateral" | "sessions" | "policies" | "actions"

export function RoleDetailPanel(props: RoleDetailPanelProps) {
  const {
    roleName,
    usedCount,
    totalCount,
    gapCount,
    alsoReaches,
    sharedWith,
    assumedBy,
    policiesAttached,
    actionsUsed,
    onClose,
  } = props

  const [activeTab, setActiveTab] = useState<TabKey>("lateral")

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: "lateral", label: "Lateral", count: alsoReaches.length + sharedWith.length },
    { key: "sessions", label: "Sessions", count: assumedBy.length },
    { key: "policies", label: "Policies", count: policiesAttached.length },
    { key: "actions", label: "Actions", count: actionsUsed.length },
  ]

  return (
    <div
      className="absolute right-0 top-0 h-full w-[440px] max-w-[90vw] bg-slate-950 border-l border-slate-700 z-40 shadow-2xl shadow-black/60 flex flex-col"
      role="dialog"
      aria-label={`Role details for ${roleName}`}
    >
      {/* Header */}
      <header className="px-4 py-3 border-b border-slate-800 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">
            IAM Role · details
          </div>
          <div className="text-sm font-mono text-slate-100 truncate" title={roleName}>
            {roleName}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs text-slate-400 tabular-nums">
              <strong className="text-slate-200">{usedCount}</strong>
              {" / "}
              <strong className="text-slate-200">{totalCount}</strong> perms used
            </span>
            {gapCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 font-semibold">
                {gapCount} unused
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 shrink-0"
          aria-label="Close details"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900/40">
        {tabs.map((t) => {
          const isActive = activeTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={
                "flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors " +
                (isActive
                  ? "border-violet-500 text-slate-100 bg-slate-900"
                  : "border-transparent text-slate-400 hover:text-slate-200")
              }
            >
              {t.label}
              {t.count > 0 && (
                <span
                  className={
                    "ml-1.5 text-[10px] px-1 py-0.5 rounded tabular-nums " +
                    (isActive ? "bg-violet-500/20 text-violet-200" : "bg-slate-800 text-slate-400")
                  }
                >
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Body — only the active tab renders */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {activeTab === "lateral" && (
          <LateralTab alsoReaches={alsoReaches} sharedWith={sharedWith} />
        )}
        {activeTab === "sessions" && <SessionsTab sessions={assumedBy} />}
        {activeTab === "policies" && <PoliciesTab policies={policiesAttached} />}
        {activeTab === "actions" && <ActionsTab actions={actionsUsed} />}
      </div>
    </div>
  )
}

// ─── Lateral tab ─────────────────────────────────────────────────

function LateralTab({
  alsoReaches,
  sharedWith,
}: {
  alsoReaches: LateralJewel[]
  sharedWith: LateralConsumer[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const systemName = searchParams?.get("system") ?? null

  const onJewelClick = useCallback(
    (jewelId: string) => {
      const params = new URLSearchParams()
      if (systemName) params.set("system", systemName)
      params.set("jewel", jewelId)
      params.set("view", "exfil")
      router.push(`/attack-paths-v2?${params.toString()}`)
    },
    [router, systemName],
  )

  if (alsoReaches.length === 0 && sharedWith.length === 0) {
    return (
      <EmptyState
        title="No lateral reach"
        body="This role doesn't reach any other crown jewels and isn't shared with any other workload."
      />
    )
  }

  const workloadIcon = (t: string) =>
    t === "EC2Instance"
      ? "EC2"
      : t === "LambdaFunction"
        ? "λ"
        : t === "IAMUser"
          ? "User"
          : t === "ECSTask" || t === "ECSService"
            ? "ECS"
            : t

  return (
    <div className="space-y-4">
      {alsoReaches.length > 0 && (
        <section>
          <SectionHeader
            tone="fuchsia"
            label="Also reaches"
            sub={`${alsoReaches.length} other ${alsoReaches.length === 1 ? "jewel" : "jewels"} via this role — click to switch view`}
          />
          <div className="space-y-1.5">
            {alsoReaches.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => onJewelClick(j.id)}
                className="w-full flex items-center gap-2 rounded border border-fuchsia-500/30 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 hover:border-fuchsia-400/60 px-2.5 py-1.5 text-left transition-colors cursor-pointer"
                title={`Switch to EXFIL view for ${j.name}`}
              >
                <span className="text-fuchsia-300 font-bold text-xs">→</span>
                <span className="text-xs text-slate-200 font-mono truncate flex-1">
                  {j.name}
                </span>
                {j.hits > 0 && (
                  <span className="text-[10px] text-fuchsia-300/90 font-mono tabular-nums shrink-0">
                    {j.hits >= 1000 ? `${(j.hits / 1000).toFixed(0)}K` : String(j.hits)} hits
                  </span>
                )}
                <ExternalLink className="h-3 w-3 text-fuchsia-300 shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {sharedWith.length > 0 && (
        <section>
          <SectionHeader
            tone="amber"
            label="Shared with"
            sub={`${sharedWith.length} other ${sharedWith.length === 1 ? "workload" : "workloads"} carry this same role — same key, different foothold`}
          />
          <div className="space-y-1.5">
            {sharedWith.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5"
                title={`${c.type}: ${c.name}${c.system_name ? ` (system: ${c.system_name})` : ""}`}
              >
                <span className="text-[10px] uppercase tracking-wider text-amber-300 font-bold shrink-0">
                  {workloadIcon(c.type)}
                </span>
                <span className="text-xs text-slate-200 font-mono truncate flex-1">
                  {c.name}
                </span>
                {c.system_name && (
                  <span className="text-[10px] text-amber-300/70 truncate max-w-[120px]">
                    {c.system_name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Sessions tab ────────────────────────────────────────────────

function SessionsTab({ sessions }: { sessions: Session[] }) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No assumed sessions observed"
        body="No STS-assumed-role calls observed against this role in CloudTrail. The role may be configured for use but not yet exercised, or its sessions may be too old to appear in the current window."
      />
    )
  }
  return (
    <section>
      <SectionHeader
        tone="cyan"
        label="Assumed by"
        sub={`${sessions.length} session${sessions.length === 1 ? "" : "s"} observed — each is one principal that actually called this role`}
      />
      <div className="space-y-1.5">
        {sessions.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 rounded border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5"
            title={s.last_seen ? `Last seen ${s.last_seen}` : "Last-seen timestamp unavailable"}
          >
            <span className="text-xs text-slate-200 font-mono truncate flex-1">
              {s.session_name}
            </span>
            <span className="text-[10px] text-cyan-300/90 font-mono tabular-nums shrink-0">
              {s.calls} call{s.calls === 1 ? "" : "s"}
            </span>
            {s.last_seen && (
              <span className="text-[10px] text-cyan-300/60 shrink-0 hidden sm:inline">
                {s.last_seen.slice(0, 10)}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Policies tab ────────────────────────────────────────────────

function PoliciesTab({ policies }: { policies: Policy[] }) {
  if (policies.length === 0) {
    return (
      <EmptyState
        title="No policies attached"
        body="No IAM policies are wired to this role node in the graph. Either none are actually attached (unusual), or the policy ingestion pass hasn't covered this account yet."
      />
    )
  }
  return (
    <section>
      <SectionHeader
        tone="rose"
        label="Policies attached"
        sub={`${policies.length} polic${policies.length === 1 ? "y" : "ies"} grant this role its powers`}
      />
      <div className="space-y-1.5">
        {policies.map((p, idx) => {
          const attachmentLabel = p.is_aws_managed
            ? "AWS-managed"
            : p.attachment_type === "HAS_INLINE_POLICY"
              ? "inline"
              : p.attachment_type ?? "attached"
          return (
            <div
              key={`${p.name}:${idx}`}
              className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5"
              title={`${p.name} (${attachmentLabel})`}
            >
              <span className="text-xs text-slate-200 font-mono truncate flex-1">
                {p.name}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-rose-300/80 shrink-0 font-semibold">
                {attachmentLabel}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Actions tab ─────────────────────────────────────────────────

function ActionsTab({ actions }: { actions: Action[] }) {
  if (actions.length === 0) {
    return (
      <EmptyState
        title="No actions observed"
        body="No ACTUAL_API_CALL edges observed for this role in CloudTrail. The role may be configured but not yet exercised, or the time window may not cover its activity."
      />
    )
  }
  const total = actions.reduce((s, a) => s + a.calls, 0)
  return (
    <section>
      <SectionHeader
        tone="lime"
        label="Actions used"
        sub={`${actions.length} distinct iam_action${actions.length === 1 ? "" : "s"} observed · ${total} total call${total === 1 ? "" : "s"} in window`}
      />
      <div className="space-y-1">
        {actions.map((a) => (
          <div
            key={a.action}
            className="flex items-center gap-2 rounded border border-lime-500/30 bg-lime-500/10 px-2.5 py-1.5"
            title={`${a.action}: ${a.calls} call${a.calls === 1 ? "" : "s"}`}
          >
            <span className="text-xs text-slate-200 font-mono flex-1">{a.action}</span>
            <span className="text-[10px] text-lime-300/90 font-mono tabular-nums shrink-0">
              {a.calls} call{a.calls === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Shared subcomponents ────────────────────────────────────────

function SectionHeader({
  tone,
  label,
  sub,
}: {
  tone: "fuchsia" | "amber" | "cyan" | "rose" | "lime"
  label: string
  sub: string
}) {
  const toneClass: Record<string, string> = {
    fuchsia: "text-fuchsia-300",
    amber: "text-amber-300",
    cyan: "text-cyan-300",
    rose: "text-rose-300",
    lime: "text-lime-300",
  }
  return (
    <div className="mb-2">
      <div className={`text-[10px] uppercase tracking-wider font-bold ${toneClass[tone]}`}>
        {label}
      </div>
      <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-slate-700/50 bg-slate-900/40 p-4">
      <div className="text-xs font-semibold text-slate-300 mb-1">{title}</div>
      <div className="text-[11px] text-slate-500 leading-relaxed">{body}</div>
    </div>
  )
}
