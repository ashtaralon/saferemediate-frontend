"use client"

import { useMemo, useRef, useState } from "react"
import { Fingerprint, History, KeyRound, ShieldQuestion } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { resolveIdentityAccess } from "./identity-access-contract"
import type { IdentityAccessExpectedScope } from "./identity-access-contract"
import type {
  IdentityAccessGap,
  IdentityAccessProjection,
  IdentityAccessRole,
  IdentityActionDetail,
  TopologyNode,
} from "./types"

function formatTimestamp(value: string | null): string {
  if (!value) return "Not recorded"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function GapList({ gaps, testId }: { gaps: IdentityAccessGap[]; testId: string }) {
  if (gaps.length === 0) return null
  return (
    <ul className="mt-2 space-y-1" data-testid={testId}>
      {gaps.map((gap, index) => (
        <li
          key={`${gap.code}:${index}`}
          className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-950"
          data-testid="topology-identity-access-gap"
          data-gap-code={gap.code}
        >
          <span className="font-mono font-semibold">{gap.code}</span>
          <span> · {gap.detail}</span>
        </li>
      ))}
    </ul>
  )
}

function EffectiveUnknown({ reasons }: { reasons: string[] }) {
  return (
    <div
      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"
      data-testid="topology-identity-effective-authorization"
      data-effective-decision="unknown"
    >
      <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-800">
        <ShieldQuestion className="h-3.5 w-3.5" aria-hidden />
        Effective authorization · Unknown
      </div>
      <div className="mt-1 text-[9px] leading-snug text-slate-600">
        Requires an exact action, resource, and request context. This snapshot does not project a current allow or deny decision.
      </div>
      <div className="mt-1 flex flex-wrap gap-1" data-testid="topology-identity-effective-gaps">
        {reasons.map(reason => (
          <span
            key={reason}
            className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[8px] text-slate-600"
            data-testid="topology-identity-effective-gap"
          >
            {reason}
          </span>
        ))}
      </div>
    </div>
  )
}

function actionUsageCopy(action: IdentityActionDetail): string {
  switch (action.usage_state) {
    case "SUCCESS_OBSERVED":
      return `Successful use observed${action.last_success_at ? ` · last ${formatTimestamp(action.last_success_at)}` : ""}`
    case "DENIED_ONLY":
      return "Denied attempts observed"
    case "NOT_OBSERVED":
      return action.coverage_state === "COMPLETE" && action.window_requirement_satisfied
        ? "No successful use observed in the stated window"
        : "No successful use returned; evidence is not complete"
    case "UNKNOWN":
      return "Historical use unknown"
  }
}

function ActionDetailRow({ action }: { action: IdentityActionDetail }) {
  return (
    <li
      className="rounded-md border border-slate-200 bg-white p-2"
      data-testid="topology-identity-action"
      data-action={action.action}
      data-configured-grant={action.configured_grant ? "true" : "false"}
      data-usage-state={action.usage_state}
      data-coverage-state={action.coverage_state}
      data-effective-decision="unknown"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-all font-mono text-[10px] font-semibold text-slate-900">{action.action}</div>
          <div className="mt-1 text-[9px] text-slate-600" data-testid="topology-identity-action-usage">
            {actionUsageCopy(action)} · coverage {action.coverage_state.toLowerCase().replaceAll("_", " ")}
          </div>
        </div>
        <span
          className="shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold"
          style={action.configured_grant
            ? { background: "#EEF2FF", borderColor: "#C7D2FE", color: "#3730A3" }
            : { background: "#F8FAFC", borderColor: "#E2E8F0", color: "#64748B" }}
          data-testid="topology-identity-action-configured"
        >
          {action.configured_grant ? "Configured grant" : "No configured grant"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-[9px] text-slate-600">
          <div>Workflow eligibility · {action.eligibility_state.replaceAll("_", " ").toLowerCase()}</div>
          <div>Evidence purity · {action.purity.replaceAll("_", " ").toLowerCase()}</div>
          <div>Corroboration · {action.corroboration_state.replaceAll("_", " ").toLowerCase()}</div>
          <div>Observation window · {formatTimestamp(action.observation_window_start)} – {formatTimestamp(action.observation_window_end)}</div>
          {action.denial_layer ? <div>Denial layer · {action.denial_layer}</div> : null}
          {action.hold_reason ? <div>Hold · {action.hold_reason}</div> : null}
          {action.denied_hold_expires_at ? <div>Hold expires · {formatTimestamp(action.denied_hold_expires_at)}</div> : null}
          {action.reevaluation_basis ? <div>Reevaluation · {action.reevaluation_basis}</div> : null}
          <div>Decision as of · {formatTimestamp(action.decision_as_of)}</div>
        </div>
        <EffectiveUnknown reasons={action.effective_authorization.reason_codes} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3" data-testid="topology-identity-authorization-layers">
        {Object.entries(action.authorization_layers).map(([layer, verdict]) => (
          <div key={layer} className="rounded border border-slate-100 bg-slate-50 px-1.5 py-1 text-[8px] text-slate-600">
            <div className="font-mono">{layer}</div>
            <div className="font-semibold text-slate-800">{verdict}</div>
          </div>
        ))}
      </div>
    </li>
  )
}

function ExactCount({ value, unavailable }: { value: number | null; unavailable?: boolean }) {
  return (
    <span className="text-[18px] font-semibold tabular-nums text-slate-900">
      {unavailable || value === null ? "—" : value}
    </span>
  )
}

function RoleCard({
  role,
  systemName,
  workloadName,
  onFocusWorkload,
}: {
  role: IdentityAccessRole
  systemName: string
  workloadName: (id: string) => string
  onFocusWorkload: (id: string) => void
}) {
  const configuredUnavailable = role.configured_grants.state !== "ready"
  const observedUnavailable = role.observed_use.state !== "ready"
  const coverage = role.observed_use.coverage_counts
  return (
    <li
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
      data-testid="topology-identity-role"
      data-role-id={role.role_id}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-slate-950">{role.name}</div>
          <div className="mt-0.5 break-all font-mono text-[9px] text-slate-500">{role.role_arn}</div>
          <div className="mt-0.5 font-mono text-[9px] text-slate-500">RoleId · {role.role_id}</div>
        </div>
        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-700">
          {role.lifecycle_state}
        </span>
      </div>
      <a
        href={`/iam/shared-roles?system_name=${encodeURIComponent(systemName)}&role_ref=${encodeURIComponent(role.role_arn)}`}
        className="mt-2 inline-flex rounded text-[9px] font-semibold text-indigo-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        data-testid="topology-identity-role-link"
      >
        Check shared-role status
      </a>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-indigo-100 bg-indigo-50 p-2" data-testid="topology-identity-configured-grants">
          <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-indigo-800">
            <KeyRound className="h-3 w-3" aria-hidden /> Configured grants
          </div>
          <ExactCount value={role.configured_grants.exact_action_count} unavailable={configuredUnavailable} />
          <div className="text-[9px] text-indigo-700">
            {configuredUnavailable ? "Canonical configured grants unavailable" : "exact configured actions"}
          </div>
        </div>
        <div className="rounded-md border border-teal-100 bg-teal-50 p-2" data-testid="topology-identity-observed-use">
          <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-teal-800">
            <History className="h-3 w-3" aria-hidden /> Historical use
          </div>
          {observedUnavailable ? (
            <div className="mt-1 text-[10px] text-teal-900">Canonical observations unavailable</div>
          ) : (
            <div className="mt-1 space-y-0.5 text-[9px] tabular-nums text-teal-900">
              <div>{role.observed_use.successful_action_count} successful · {role.observed_use.denied_only_action_count} denied-only</div>
              <div>{role.observed_use.not_observed_action_count} not observed · {role.observed_use.unknown_action_count} unknown</div>
              <div data-testid="topology-identity-coverage-counts">
                Coverage: {coverage?.complete} complete · {coverage?.partial} partial · {coverage?.unknown} unknown
              </div>
            </div>
          )}
        </div>
        <EffectiveUnknown reasons={role.effective_authorization.reason_codes} />
      </div>

      <div className="mt-3" data-testid="topology-identity-role-workloads">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-600">
          Attached workloads ({role.workload_ids.length})
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {role.workload_ids.map(workloadId => (
            <button
              key={workloadId}
              type="button"
              onClick={() => onFocusWorkload(workloadId)}
              className="max-w-full truncate rounded border border-slate-300 bg-slate-50 px-1.5 py-1 text-left font-mono text-[9px] font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              title={`${workloadName(workloadId)} · ${workloadId}`}
              data-testid="topology-identity-workload-link"
              data-workload-id={workloadId}
            >
              {workloadName(workloadId)}
            </button>
          ))}
        </div>
        <div className="mt-1 text-[9px] text-slate-500">Attachment · {role.attachment_modes.join(", ")}</div>
      </div>

      <GapList gaps={role.gaps} testId="topology-identity-role-gaps" />

      <details className="mt-3 rounded-md border border-slate-200 bg-slate-50" data-testid="topology-identity-action-details">
        <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500">
          Action evidence · {role.action_details_total === null ? "unavailable" : `${role.action_details_total} exact`}
        </summary>
        <div className="border-t border-slate-200 p-2">
          {role.action_details_total === null ? (
            <div className="text-[10px] text-slate-600" data-testid="topology-identity-actions-unavailable">
              Canonical action evidence is unavailable for this role.
            </div>
          ) : role.action_details.length === 0 ? (
            <div className="text-[10px] text-slate-600" data-testid="topology-identity-actions-empty">
              No action records are configured or observed for this role.
            </div>
          ) : (
            <ul className="space-y-2" role="list">
              {role.action_details.map(action => <ActionDetailRow key={action.action} action={action} />)}
            </ul>
          )}
          {role.action_details_truncated ? (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-950" data-testid="topology-identity-actions-truncated">
              Showing {role.action_details_returned} of {role.action_details_total} exact action records. Totals include omitted details.
            </div>
          ) : null}
        </div>
      </details>
    </li>
  )
}

function AuthorityLine({ projection }: { projection: IdentityAccessProjection }) {
  return (
    <div className="mt-3 border-t border-slate-200 pt-2 text-[9px] leading-snug text-slate-500" data-testid="topology-identity-authority">
      <div>
        Inventory · {projection.inventory_authority
          ? `generation ${projection.inventory_authority.generation} · ${formatTimestamp(projection.inventory_authority.projected_through)}`
          : "unavailable"}
      </div>
      <div>
        Decisions · {projection.decision_authority
          ? `generation ${projection.decision_authority.generation} · ${formatTimestamp(projection.decision_authority.projected_through)}`
          : "unavailable"}
      </div>
    </div>
  )
}

export function IdentityAccessControl({
  responseContractVersion,
  identityAccess,
  snapshotStale,
  nodes,
  onSelect,
  compact,
  expectedScope,
}: {
  responseContractVersion: unknown
  identityAccess: unknown
  snapshotStale: boolean
  nodes: TopologyNode[]
  onSelect: (id: string) => void
  compact: boolean
  expectedScope?: IdentityAccessExpectedScope
}) {
  const [open, setOpen] = useState(false)
  const pendingWorkloadFocus = useRef<string | null>(null)
  const resolution = useMemo(
    () => resolveIdentityAccess(responseContractVersion, identityAccess, expectedScope),
    [responseContractVersion, identityAccess, expectedScope],
  )
  const projection = resolution.projection
  const nodeNames = useMemo(() => new Map(nodes.map(node => [node.id, node.name])), [nodes])
  const roleCount = projection?.roles_total
  const stateLabel = snapshotStale ? "stale" : resolution.state

  const focusWorkload = (workloadId: string) => {
    pendingWorkloadFocus.current = workloadId
    onSelect(workloadId)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={compact
            ? "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[9px] font-semibold"
            : "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold"}
          style={{
            background: resolution.state === "ready" && !snapshotStale ? "#EEF2FF" : "#FFFBEB",
            border: `1px solid ${resolution.state === "ready" && !snapshotStale ? "#C7D2FE" : "#FCD34D"}`,
            color: resolution.state === "ready" && !snapshotStale ? "#3730A3" : "#92400E",
          }}
          aria-label={`Identity and access, ${roleCount === null || roleCount === undefined ? "unavailable" : `${roleCount} role${roleCount === 1 ? "" : "s"}`}`}
          aria-expanded={open}
          data-testid="topology-identity-access-trigger"
          data-identity-status={resolution.state}
          data-snapshot-stale={snapshotStale ? "true" : "false"}
          data-role-count={roleCount ?? "unavailable"}
        >
          <Fingerprint className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
          Identity &amp; access{typeof roleCount === "number" ? ` (${roleCount})` : ""}
          {stateLabel !== "ready" ? <span className="font-normal">· {stateLabel}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={{ top: 56, right: 12, bottom: 12, left: 12 }}
        className="z-[250] w-[min(96vw,780px)] max-h-[min(78vh,680px)] overflow-y-auto bg-white p-0 opacity-100 shadow-2xl"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #CBD5E1", opacity: 1 }}
        role="dialog"
        aria-label="Identity and access details"
        data-testid="topology-identity-access-panel"
        data-identity-status={resolution.state}
        data-snapshot-stale={snapshotStale ? "true" : "false"}
        onCloseAutoFocus={event => {
          const workloadId = pendingWorkloadFocus.current
          if (!workloadId) return
          event.preventDefault()
          pendingWorkloadFocus.current = null
          const target = Array.from(document.querySelectorAll<HTMLElement>("[data-flow-id]"))
            .find(element => element.dataset.flowId === workloadId)
          target?.focus()
        }}
      >
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-950">
                <Fingerprint className="h-4 w-4 text-indigo-600" aria-hidden />
                Identity &amp; access
              </div>
              <div className="mt-0.5 text-[10px] text-slate-600">
                Configured grants, historical use, and effective authorization are separate facts.
              </div>
            </div>
            <div className="flex gap-1">
              <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-700">
                {resolution.state}
              </span>
              {snapshotStale ? (
                <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-800" data-testid="topology-identity-access-stale">
                  Stale snapshot
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="p-4">
          {resolution.state === "unavailable" || !projection ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3" data-testid="topology-identity-access-unavailable">
              <div className="text-[11px] font-semibold text-amber-950">Identity &amp; access unavailable</div>
              <div className="mt-1 text-[10px] leading-snug text-amber-900">{resolution.reason}</div>
              <div className="mt-1 text-[10px] text-amber-900">No zero-role, unused, allow, or deny conclusion is available.</div>
              {projection ? <GapList gaps={projection.gaps} testId="topology-identity-access-gaps" /> : null}
              {projection ? <AuthorityLine projection={projection} /> : null}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-600">
                <span data-testid="topology-identity-role-totals">
                  {projection.roles_total} exact role{projection.roles_total === 1 ? "" : "s"} · {projection.roles_returned} returned
                </span>
                <span className="font-mono">{projection.scope.account_id} · {projection.scope.region}</span>
              </div>

              {projection.status === "partial" ? (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-950" data-testid="topology-identity-access-partial">
                  Identity evidence is partial. Available configured attachments remain visible; unavailable decision totals stay unknown.
                </div>
              ) : null}
              {projection.roles_omitted_unresolved && projection.roles_omitted_unresolved > 0 ? (
                <div className="mt-2 text-[10px] text-amber-900" data-testid="topology-identity-roles-unresolved">
                  {projection.roles_omitted_unresolved} attached role{projection.roles_omitted_unresolved === 1 ? " is" : "s are"} omitted because stable RoleId could not be resolved.
                </div>
              ) : null}
              {projection.roles_truncated ? (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-950" data-testid="topology-identity-roles-truncated">
                  Showing {projection.roles_returned} of {projection.roles_total} exact roles. Counts include omitted details.
                </div>
              ) : null}
              <GapList gaps={projection.gaps} testId="topology-identity-access-gaps" />

              {projection.status === "ready" && projection.roles_total === 0 ? (
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-700" data-testid="topology-identity-access-empty">
                  No IAM roles are attached to resources in this Estate scope.
                </div>
              ) : (
                <ul className="mt-3 space-y-3" role="list" data-testid="topology-identity-role-list">
                  {projection.roles.map(role => (
                    <RoleCard
                      key={role.role_id}
                      role={role}
                      systemName={projection.scope.system_name}
                      workloadName={id => nodeNames.get(id) ?? id}
                      onFocusWorkload={focusWorkload}
                    />
                  ))}
                </ul>
              )}
              {projection.status === "partial" && projection.roles.length === 0 ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-950" data-testid="topology-identity-role-details-unavailable">
                  No exact role details are available in the returned projection. The reported totals and gaps remain authoritative.
                </div>
              ) : null}
              <AuthorityLine projection={projection} />
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
