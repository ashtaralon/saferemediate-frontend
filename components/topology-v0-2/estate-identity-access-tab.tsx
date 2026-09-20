"use client"

/**
 * Estate · Identity & access tab.
 *
 * Renders the `estate-identity-access/v1` block that rides on the SAME
 * topology-risk payload the Estate map already fetched. It issues no request of
 * its own: no route serves this block separately, so a fetch here would 404.
 *
 * Every decision about what may be shown lives in
 * ./estate-identity-access-model. This file renders that view model and judges
 * nothing, which is why the honesty rules are executable without a DOM.
 *
 * The one rule that governs the whole surface: a blank panel is a claim. A
 * snapshot with no identity block, a projection that refused, and a projection
 * that read the canonical generation and found no bindings are three different
 * facts, and each gets its own words.
 */

import { AlertTriangle, ArrowRight, Info, ShieldCheck } from "lucide-react"

import {
  buildIdentityView,
  type AuthorityReceipt,
  type GraphDecisionNode,
  type GraphRoleNode,
  type IdentityGap,
  type IdentityView,
  type RelationshipCapability,
  type ScopeBinding,
} from "./estate-identity-access-model"
import type { TopologyRiskResponse } from "./types"

const INK = "#1A2330"
const MUTED = "#5A6B7A"
const LINE = "#CBD5E1"
const TEAL = "#0E8B7A"
const TEAL_BG = "#E6FBF7"
const WARN = "#92400E"
const WARN_BG = "#FFFBEB"
const WARN_LINE = "#F2C94C"

function Chip({
  label,
  tone = "neutral",
  testId,
}: {
  label: string
  tone?: "neutral" | "teal" | "warn"
  testId?: string
}) {
  const style =
    tone === "teal"
      ? { borderColor: TEAL, background: TEAL_BG, color: TEAL }
      : tone === "warn"
        ? { borderColor: WARN_LINE, background: WARN_BG, color: WARN }
        : { borderColor: LINE, background: "#FFFFFF", color: MUTED }
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={style}
    >
      {label}
    </span>
  )
}

/**
 * The plane a number stands on. Rendered only where the payload supports it —
 * an unread family has no plane, and labelling one would turn a configured
 * capability into observed evidence.
 */
function PlaneChip({ plane }: { plane: string | null }) {
  if (!plane) return <Chip label="plane not asserted" testId="identity-plane-none" />
  return <Chip label={plane.replace(/_/g, " ")} tone="teal" testId="identity-plane" />
}

function GapList({ gaps, testId }: { gaps: IdentityGap[]; testId: string }) {
  if (gaps.length === 0) return null
  return (
    <ul data-testid={testId} className="mt-2 space-y-1.5">
      {gaps.map((gap, index) => (
        <li
          key={`${gap.code}-${index}`}
          data-testid="identity-gap"
          data-gap-code={gap.code}
          className="rounded border px-2 py-1.5 text-[11px]"
          style={{ borderColor: WARN_LINE, background: WARN_BG, color: WARN }}
        >
          <span className="font-mono font-semibold">{gap.code}</span>
          <span className="ml-1.5" style={{ color: INK }}>
            {gap.detail}
          </span>
          {Object.entries(gap)
            .filter(([key]) => key !== "code" && key !== "detail")
            .map(([key, value]) => (
              <span key={key} className="ml-1.5 font-mono text-[10px]" style={{ color: MUTED }}>
                {key}={String(Array.isArray(value) ? value.join(",") : value)}
              </span>
            ))}
        </li>
      ))}
    </ul>
  )
}

function ScopeBindingLine({ binding }: { binding: ScopeBinding | null }) {
  if (!binding) return null
  return (
    <div data-testid="identity-scope-binding" className="flex flex-wrap items-center gap-1.5">
      {binding.verified.map(item => (
        <Chip
          key={`v-${item.field}`}
          tone="teal"
          testId="identity-scope-verified"
          label={`${item.field} ✓ ${item.value}`}
        />
      ))}
      {binding.echoedOnly.map(item => (
        <Chip
          key={`e-${item.field}`}
          testId="identity-scope-echoed"
          label={`${item.field} (echoed, not checked) ${item.value}`}
        />
      ))}
      {binding.mismatches.map(item => (
        <Chip
          key={`m-${item.field}`}
          tone="warn"
          testId="identity-scope-mismatch"
          label={`${item.field} ✗ identity ${item.identity} vs topology ${item.topology}`}
        />
      ))}
    </div>
  )
}

function Receipts({ receipts }: { receipts: AuthorityReceipt[] }) {
  if (receipts.length === 0) {
    return (
      <p data-testid="identity-receipts-none" className="text-[11px]" style={{ color: MUTED }}>
        No projection authority was read, so there is no generation or receipt to show.
      </p>
    )
  }
  return (
    <div data-testid="identity-receipts" className="grid gap-2 sm:grid-cols-2">
      {receipts.map(item => (
        <div
          key={item.label}
          data-testid="identity-receipt"
          data-receipt-scope={item.projectionScope ?? ""}
          className="rounded border px-2.5 py-2 text-[11px]"
          style={{ borderColor: LINE, background: "#FFFFFF" }}
        >
          <div className="font-semibold" style={{ color: INK }}>
            {item.label}
          </div>
          <dl className="mt-1 space-y-0.5 font-mono text-[10px]" style={{ color: MUTED }}>
            <div>
              <dt className="inline">generation </dt>
              <dd className="inline" data-testid="identity-receipt-generation">
                {item.generation ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="inline">source vector </dt>
              <dd className="inline">{item.sourceVectorHash ?? "—"}</dd>
            </div>
            <div>
              <dt className="inline">receipt </dt>
              <dd className="inline" data-testid="identity-receipt-hash">
                {item.projectionReceiptHash ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="inline">projected through </dt>
              <dd className="inline">{item.projectedThrough ?? "—"}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  )
}

function DecisionCell({ node }: { node: GraphDecisionNode }) {
  if (node.state !== "ready") {
    return (
      <div
        data-testid="identity-decision"
        data-decision-state="unavailable"
        className="rounded border px-2.5 py-2 text-[11px]"
        style={{ borderColor: WARN_LINE, background: WARN_BG }}
      >
        <div className="font-semibold" style={{ color: WARN }}>
          Decision evidence unavailable
        </div>
        <p className="mt-0.5" style={{ color: INK }}>
          No configured or observed action counts are shown for this role, because none were
          read. That is not zero.
        </p>
        <GapList gaps={node.gaps} testId="identity-decision-gaps" />
      </div>
    )
  }
  return (
    <div
      data-testid="identity-decision"
      data-decision-state="ready"
      className="rounded border px-2.5 py-2 text-[11px]"
      style={{ borderColor: LINE, background: "#FFFFFF" }}
    >
      <div className="flex items-center gap-1.5">
        <Chip label="configured" tone="teal" />
        <span data-testid="identity-configured-count" style={{ color: INK }}>
          <span className="font-semibold tabular-nums">{node.configuredGrantCount ?? "—"}</span>{" "}
          actions granted by policy
        </span>
      </div>
      {node.observed ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Chip label="observed" tone="teal" />
          <span data-testid="identity-observed-counts" style={{ color: INK }}>
            <span className="font-semibold tabular-nums">{node.observed.successful ?? "—"}</span>{" "}
            used ·{" "}
            <span className="font-semibold tabular-nums">{node.observed.deniedOnly ?? "—"}</span>{" "}
            denied-only ·{" "}
            <span className="font-semibold tabular-nums">{node.observed.notObserved ?? "—"}</span>{" "}
            not observed
          </span>
          {node.observed.lastSuccessAt ? (
            <span className="font-mono text-[10px]" style={{ color: MUTED }}>
              last success {node.observed.lastSuccessAt}
            </span>
          ) : null}
        </div>
      ) : (
        <p data-testid="identity-observed-absent" className="mt-1.5" style={{ color: MUTED }}>
          Observed use was not read for this role, so no usage counts are shown.
        </p>
      )}
      <p
        data-testid="identity-effective-authorization"
        className="mt-1.5 text-[10px]"
        style={{ color: MUTED }}
      >
        Effective authorization: {node.effectiveAuthorization.availability}
        {node.effectiveAuthorization.reasonCodes.length > 0
          ? ` — ${node.effectiveAuthorization.reasonCodes.join(", ")}`
          : ""}
        . This view does not compute whether a call would be allowed.
      </p>
    </div>
  )
}

function IdentityGraphView({ view }: { view: IdentityView }) {
  const roles = view.graph.nodes.filter((node): node is GraphRoleNode => node.kind === "role")
  const decisions = new Map(
    view.graph.nodes
      .filter((node): node is GraphDecisionNode => node.kind === "decision")
      .map(node => [node.roleId, node] as const),
  )
  return (
    <div data-testid="identity-graph" className="space-y-2">
      {roles.map(role => {
        const workloadEdges = view.graph.edges.filter(
          edge => edge.family === "WORKLOAD_USES_ROLE" && edge.to === role.id,
        )
        const decisionEdge = view.graph.edges.find(
          edge => edge.family === "ROLE_ACTION_DECISION" && edge.from === role.id,
        )
        const decision = decisions.get(role.roleId)
        return (
          <div
            key={role.id}
            data-testid="identity-graph-row"
            data-role-id={role.roleId}
            className="grid gap-2 rounded-lg border p-2.5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.4fr)] md:items-center"
            style={{ borderColor: LINE, background: "#F8FAFC" }}
          >
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                Workload
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {workloadEdges.map(edge => (
                  <li
                    key={edge.from}
                    data-testid="identity-workload"
                    className="truncate font-mono text-[11px]"
                    style={{ color: INK }}
                    title={edge.from.replace(/^workload:/, "")}
                  >
                    {edge.from.replace(/^workload:/, "")}
                    <span className="ml-1.5 not-italic" style={{ color: MUTED }}>
                      {edge.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <ArrowRight className="hidden h-3.5 w-3.5 md:block" style={{ color: MUTED }} aria-hidden />

            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                Role
              </div>
              <div className="truncate text-[12px] font-semibold" style={{ color: INK }} title={role.roleArn ?? role.roleId}>
                {role.label}
              </div>
              <div className="font-mono text-[10px]" style={{ color: MUTED }}>
                {role.roleId}
              </div>
              {role.lifecycleState ? <Chip label={role.lifecycleState} /> : null}
            </div>

            <div className="hidden items-center gap-1 md:flex">
              <ArrowRight className="h-3.5 w-3.5" style={{ color: MUTED }} aria-hidden />
              <Chip
                testId="identity-decision-plane"
                label={decisionEdge?.plane ?? "configured"}
                tone={decisionEdge?.plane === "observed" ? "teal" : "neutral"}
              />
            </div>

            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                Decision
              </div>
              {decision ? <DecisionCell node={decision} /> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CapabilityMatrix({ view }: { view: IdentityView }) {
  return (
    <section data-testid="identity-capability-matrix" className="mt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
        Relationship families
      </h3>
      <p className="mt-0.5 text-[11px]" style={{ color: MUTED }}>
        What the installed canonical data path can serve. This describes the data path, not this
        tenant&apos;s data, so it is the same whether or not roles were found.
      </p>
      {view.capabilitiesUnavailableReason ? (
        <div
          data-testid="identity-capability-unavailable"
          className="mt-2 rounded border px-2.5 py-2 text-[11px]"
          style={{ borderColor: WARN_LINE, background: WARN_BG, color: INK }}
        >
          {view.capabilitiesUnavailableReason}
        </div>
      ) : (
        <ul className="mt-2 space-y-1">
          {view.capabilities.map(row => (
            <CapabilityRow key={row.family} row={row} />
          ))}
        </ul>
      )}
    </section>
  )
}

function CapabilityRow({ row }: { row: RelationshipCapability }) {
  const available = row.status === "available"
  return (
    <li
      data-testid="identity-capability-row"
      data-family={row.family}
      data-status={row.status}
      className="rounded border px-2.5 py-2"
      style={{ borderColor: available ? TEAL : LINE, background: available ? TEAL_BG : "#FFFFFF" }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] font-semibold" style={{ color: INK }}>
          {row.family}
        </span>
        <Chip
          label={row.status}
          tone={available ? "teal" : "warn"}
          testId="identity-capability-status"
        />
        <PlaneChip plane={row.plane} />
        {row.reason_codes.map(code => (
          <Chip key={code} testId="identity-capability-reason" label={code} />
        ))}
      </div>
      <p className="mt-1 text-[11px]" style={{ color: available ? INK : MUTED }}>
        {row.detail}
      </p>
      {available ? (
        <p className="mt-0.5 font-mono text-[10px]" style={{ color: MUTED }}>
          writer {row.canonical_writer} · bounded read {row.bounded_read}
        </p>
      ) : null}
    </li>
  )
}

export function EstateIdentityAccessTab({
  payload,
}: {
  payload: TopologyRiskResponse | null | undefined
}) {
  const view = buildIdentityView(payload)
  const bad = view.state === "unavailable" || view.state === "invalid" || view.state === "scope_mismatch"

  return (
    <div data-testid="estate-identity-access" data-state={view.state} className="p-3">
      <header
        className="rounded-lg border px-3 py-2.5"
        style={{
          borderColor: bad ? WARN_LINE : LINE,
          background: bad ? WARN_BG : "#FFFFFF",
        }}
      >
        <div className="flex items-start gap-2">
          {bad ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: WARN }} aria-hidden />
          ) : view.state === "absent" ? (
            <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: MUTED }} aria-hidden />
          ) : (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: TEAL }} aria-hidden />
          )}
          <div className="min-w-0">
            <h2 data-testid="identity-headline" className="text-[13px] font-semibold" style={{ color: INK }}>
              {view.headline}
            </h2>
            <p data-testid="identity-detail" className="mt-0.5 text-[11px]" style={{ color: MUTED }}>
              {view.detail}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {view.contractVersion ? (
                <Chip testId="identity-contract-version" label={view.contractVersion} />
              ) : null}
              {view.projectionStatus ? (
                <Chip testId="identity-projection-status" label={`status ${view.projectionStatus}`} />
              ) : null}
            </div>
            <div className="mt-1.5">
              <ScopeBindingLine binding={view.scopeBinding} />
            </div>
          </div>
        </div>
      </header>

      <GapList gaps={view.gaps} testId="identity-projection-gaps" />

      <section className="mt-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
          Projection authority
        </h3>
        <div className="mt-1.5">
          <Receipts receipts={view.receipts} />
        </div>
      </section>

      {view.state === "ready" ? (
        <section className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
              Workload → role → decision
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]" style={{ color: MUTED }}>
              <span data-testid="identity-roles-counts">
                {view.rolesReturned} shown
                {view.rolesTotal !== null ? ` of ${view.rolesTotal}` : ""}
              </span>
              {view.rolesTruncated ? (
                <Chip tone="warn" testId="identity-roles-truncated" label="truncated" />
              ) : null}
              {view.rolesOmittedUnresolved ? (
                <Chip
                  tone="warn"
                  testId="identity-roles-omitted"
                  label={`${view.rolesOmittedUnresolved} omitted: no AWS RoleId`}
                />
              ) : null}
            </div>
          </div>
          <div className="mt-1.5">
            {view.emptyAuthoritative ? (
              <div
                data-testid="identity-empty-authoritative"
                className="rounded-lg border px-3 py-2.5 text-[11px]"
                style={{ borderColor: LINE, background: "#FFFFFF", color: INK }}
              >
                The active canonical generation was read and holds no workload-to-role binding in
                this scope. This is an answer, not a missing read — the receipts above name the
                generation it was read from.
              </div>
            ) : (
              <IdentityGraphView view={view} />
            )}
          </div>
        </section>
      ) : null}

      <CapabilityMatrix view={view} />

      <footer className="mt-4 text-[10px] leading-relaxed" style={{ color: MUTED }}>
        Read from the <span className="font-mono">estate-identity-access/v1</span> block on this
        estate&apos;s topology-risk payload. This tab issues no request of its own and performs no
        graph traversal.
      </footer>
    </div>
  )
}
