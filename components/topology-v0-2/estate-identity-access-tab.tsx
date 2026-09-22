"use client"

/**
 * Estate · Identity & access — the evidence frame around the shared canvas.
 *
 * Renders the `estate-identity-access/v1` block that rides on the SAME
 * topology-risk payload the Estate map already fetched. It issues no request of
 * its own: no route serves this block separately, so a fetch here would 404.
 *
 * Every decision about what may be shown lives in
 * ./estate-identity-access-model. This file renders that view model and judges
 * nothing, which is why the honesty rules are executable without a DOM.
 *
 * The map itself is NOT drawn here (CF01 · D1). The identity lens is rendered
 * on the shared Estate canvas — the same AwsFrame, chips, FlowOverlay,
 * selection and DetailPanel the Network view uses — and the host passes that
 * canvas in through the `canvas` slot. This component supplies the words
 * around it: a compact scope/freshness/coverage indicator, visible honesty
 * warnings, then the map. Receipts, hashes, query names and the capability
 * matrix live in an Evidence drawer so they are not the first thing a reader
 * sees.
 *
 * The one rule that governs the whole surface: a blank panel is a claim. A
 * snapshot with no identity block, a projection that refused, and a projection
 * that read the canonical generation and found no bindings are three different
 * facts, and each gets its own words.
 */

import type { ReactNode } from "react"
import { AlertTriangle, Info, ShieldCheck } from "lucide-react"

import {
  buildIdentityIndicator,
  buildIdentityView,
  identityEmptyClaim,
  identityGraphViewForPayload,
  IDENTITY_FAMILIES_WITHOUT_COVERAGE_RECEIPT,
  IDENTITY_FAMILY_COVERAGE_MISSING_LINK,
  type AuthorityReceipt,
  type IdentityAccountContext,
  type IdentityCoverageLimit,
  type IdentityGap,
  type IdentityIndicator,
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
          data-receipt-scope={item.projectionScope}
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
                {item.generation}
              </dd>
            </div>
            <div>
              <dt className="inline">source vector </dt>
              <dd className="inline">{item.sourceVectorHash}</dd>
            </div>
            <div>
              <dt className="inline">receipt </dt>
              <dd className="inline" data-testid="identity-receipt-hash">
                {item.projectionReceiptHash ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="inline">projected through </dt>
              <dd className="inline">{item.projectedThrough}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  )
}

/**
 * Per-role gaps, for the roles that have one.
 *
 * The map carries the relationships; this carries the reasons a particular
 * role's decisions were withheld. Only roles WITH a gap appear, so this never
 * becomes a card per role standing in for the map.
 */
function RoleGaps({ view }: { view: IdentityView }) {
  const withGaps = view.roles.filter(role => role.gaps.length > 0)
  if (withGaps.length === 0) return null
  return (
    <div data-testid="identity-role-gaps" className="mt-2 space-y-1.5">
      {withGaps.map(role => (
        <div
          key={role.role_id}
          data-testid="identity-role-gap"
          data-role-id={role.role_id}
          className="rounded border px-2.5 py-2 text-[11px]"
          style={{ borderColor: WARN_LINE, background: WARN_BG }}
        >
          <span className="font-semibold" style={{ color: INK }}>
            {role.name ?? role.role_id}
          </span>
          <span className="ml-1.5" style={{ color: WARN }}>
            decision evidence withheld — no configured or observed counts are shown for
            this role, which is not the same as zero.
          </span>
          <GapList gaps={role.gaps} testId="identity-role-gap-list" />
        </div>
      ))}
    </div>
  )
}

function CapabilityMatrix({ view }: { view: IdentityView }) {
  return (
    <section data-testid="identity-capability-matrix" className="mt-3">
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

function accountContextTone(state: IdentityAccountContext["state"]): "teal" | "warn" | "neutral" {
  if (state === "in_organization" || state === "standalone") return "teal"
  if (state === "unknown" || state === "refused" || state === "not_carried") return "warn"
  return "neutral"
}

/**
 * One chip standing in for the full limitation list.
 *
 * The limits are honesty-critical, so they are never dropped — the full list
 * lives in Evidence and this names what is missing rather than only counting
 * it. A bare "4 limits" would be a number a reader has to go and decode; the
 * first two labels plus "+N" keeps the meaning on screen at a fraction of the
 * height.
 */
function CoverageLimitsCompact({ limits }: { limits: IdentityCoverageLimit[] }) {
  if (limits.length === 0) return null
  const named = limits.slice(0, 2).map(l => l.label).join(", ")
  const rest = limits.length > 2 ? ` +${limits.length - 2}` : ""
  return (
    <span
      data-testid="identity-coverage-limits-compact"
      data-limit-count={String(limits.length)}
      title={limits.map(l => `${l.label}: ${l.detail}`).join("\n\n")}
    >
      <Chip tone="warn" testId="identity-coverage-limit-summary" label={`not shown: ${named}${rest}`} />
    </span>
  )
}

/** The scope check as ONE verdict; the field-by-field line lives in Evidence. */
function ScopeVerdictChip({ binding }: { binding: ScopeBinding | null }) {
  if (!binding) return null
  if (binding.mismatches.length > 0) {
    return (
      <Chip
        tone="warn"
        testId="identity-scope-verdict"
        label={`workload scope mismatch · ${binding.mismatches.map(m => m.field).join(", ")}`}
      />
    )
  }
  if (binding.verified.length === 0) return null
  return (
    <Chip
      tone="teal"
      testId="identity-scope-verdict"
      label={`workload scope matches · ${binding.verified.length} field${binding.verified.length === 1 ? "" : "s"}`}
    />
  )
}

function CoverageIndicator({ indicator, compact = false }: { indicator: IdentityIndicator; compact?: boolean }) {
  const freshness: string[] = []
  if (indicator.inventoryGeneration !== null) {
    freshness.push(
      `inventory generation ${indicator.inventoryGeneration}` +
        (indicator.inventoryCertified ? " (certified)" : ""),
    )
  }
  if (indicator.decisionGeneration !== null) {
    freshness.push(`decision generation ${indicator.decisionGeneration}`)
  }
  const coverage =
    indicator.familiesAvailable !== null && indicator.familiesTotal !== null
      ? `${indicator.familiesAvailable} of ${indicator.familiesTotal} families servable`
      : indicator.matrixUnavailableReason
        ? "family coverage not shown"
        : null
  return (
    <div
      data-testid="identity-coverage-indicator"
      data-identity-state={indicator.state}
      data-identity-graph-state={indicator.graphState}
      className="mt-1.5 flex flex-wrap items-center gap-1.5"
    >
      <Chip
        testId="identity-coverage-state"
        tone={indicator.tone === "ok" ? "teal" : indicator.tone === "warn" ? "warn" : "neutral"}
        label={indicator.stateLabel}
      />
      {indicator.scopeLine ? (
        <Chip
          testId="identity-coverage-scope"
          tone={indicator.scopeMismatch ? "warn" : indicator.scopeVerified ? "teal" : "neutral"}
          label={`Workload scope: ${indicator.scopeLine}`}
        />
      ) : null}
      {/* Generation diagnostics and the family-coverage count are Evidence
          material: they describe how the reading was produced, not what the
          map is showing. At 768px they cost two of the seven rows that pushed
          the map below the fold. Rendered in full inside the drawer. */}
      {!compact && freshness.length > 0 ? (
        <Chip testId="identity-coverage-freshness" label={freshness.join(" · ")} />
      ) : null}
      {!compact && coverage ? <Chip testId="identity-coverage-families" label={coverage} /> : null}
      {indicator.graphState === "ready" || indicator.graphState === "partial" ? (
        <Chip
          testId="identity-coverage-graph"
          tone={indicator.graphState === "partial" ? "warn" : "teal"}
          label={
            indicator.graphState === "partial"
              ? `graph read with gaps · ${indicator.graphEdges} relationships`
              : `${indicator.graphEdges} relationships · ${indicator.graphNodes} identity nodes`
          }
        />
      ) : indicator.graphState === "absent" ? (
        <Chip testId="identity-coverage-graph" tone="warn" label="identity graph not carried" />
      ) : (
        <Chip testId="identity-coverage-graph" tone="warn" label={`identity graph ${indicator.graphState}`} />
      )}
      <AccountContextChip context={indicator.accountContext} />
    </div>
  )
}

function AccountContextChip({ context }: { context: IdentityAccountContext }) {
  return (
    <span data-testid="identity-account-context" data-account-context={context.state} title={context.detail}>
      <Chip testId="identity-account-context-label" tone={accountContextTone(context.state)} label={context.label} />
    </span>
  )
}

function CoverageLimits({ limits }: { limits: IdentityCoverageLimit[] }) {
  if (limits.length === 0) return null
  return (
    <ul data-testid="identity-coverage-limits" className="mt-2 flex flex-wrap gap-1.5">
      {limits.map(limit => (
        <li
          key={limit.key}
          data-testid="identity-coverage-limit"
          data-limit-key={limit.key}
          data-limit-status={limit.status}
          className="rounded border px-1.5 py-0.5 text-[10px]"
          style={{ borderColor: WARN_LINE, background: WARN_BG, color: WARN }}
          title={limit.detail}
        >
          <span className="font-semibold">{limit.label}</span>
          <span className="ml-1" style={{ color: MUTED }}>
            {limit.status.replace(/_/g, " ")}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function EstateIdentityAccessTab({
  payload,
  canvas,
}: {
  payload: TopologyRiskResponse | null | undefined
  /**
   * The shared Estate canvas with the identity lens applied. Rendered in place
   * of the retired custom SVG map, only in the states where a map may be
   * drawn (ready). Absent means the host chose to render the canvas itself.
   */
  canvas?: ReactNode
}) {
  const view = buildIdentityView(payload)
  const graph = identityGraphViewForPayload(payload, view)
  const indicator = buildIdentityIndicator(view, graph)
  const emptyClaim = identityEmptyClaim(view, graph)
  /**
   * TWO INDEPENDENT SOURCES FEED THIS CANVAS, and either one alone is reason
   * enough to draw it.
   *
   *   - the v1 roles projection supplies WORKLOAD_USES_ROLE and
   *     ROLE_ACTION_DECISION;
   *   - the nested identity graph supplies the other eleven families.
   *
   * `scripts/estate_identity_access.py` deliberately isolates
   * `_read_identity_graph` failures precisely so the rest of the projection
   * stays readable, so gating on either source ALONE throws away data the
   * producer went out of its way to preserve. Both directions have now been
   * shipped as defects and each is pinned by a host test:
   *
   *   roles-only gate  -> empty roles + a ready 13-edge graph drew nothing;
   *   graph-only gate  -> one valid role binding + an absent or unavailable
   *                       graph drew nothing, though the lens had 2 edges.
   *
   * The nested graph's partial/missing warning belongs BESIDE whatever the
   * other source could still answer, never in place of it.
   */
  const graphHasData =
    graph.nodes.length > 0 || graph.edges.length > 0 || view.roles.length > 0

  /**
   * Only a canvas that is ACTUALLY on screen can carry the coverage paragraph.
   * Deciding that from `graphHasData` alone assumed a host that always supplies
   * one, so a host that supplies none dropped the paragraph entirely — the
   * long form appeared zero times and nothing noticed. Whether the slot is
   * filled is the thing to test, not whether it could have been.
   */
  const canvasCarriesCoverage = graphHasData && canvas != null
  const bad = view.state === "unavailable" || view.state === "invalid" || view.state === "scope_mismatch"
  const mapReady = view.state === "ready" || view.state === "incomplete"

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
            {/*
              COMPACT HEADER. At 768px this block was ~7 rows of chips — the
              contract version, the projection status word, generation
              numbers, the family count, five scope fields and four limitation
              chips — and the map started below the fold, which defeats a
              map-first view on tablet.
              What stays is what a reader acts on: state, scope, what the graph
              holds, the account's org placement, and a named summary of what
              is NOT shown. The contract version, status word, generation
              diagnostics, per-field scope check and the full limitation list
              describe how the reading was produced, so they moved into
              Evidence. Nothing was deleted.
            */}
            <CoverageIndicator indicator={indicator} compact />
            <div className="mt-1.5" data-testid="identity-graph-scope" data-scope-status={indicator.graphScopeStatus}>
              <Chip
                testId="identity-graph-scope-label"
                tone={indicator.graphScopeStatus === "matched" ? "teal" : "warn"}
                label={indicator.graphScopeLine}
              />
              <p className="mt-1 text-[11px]" style={{ color: MUTED }}>{indicator.graphScopeDetail}</p>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <ScopeVerdictChip binding={view.scopeBinding} />
              <CoverageLimitsCompact limits={indicator.limits} />
            </div>
          </div>
        </div>
      </header>

      <GapList gaps={view.gaps} testId="identity-projection-gaps" />

      {mapReady ? (
        <section className="mt-3" data-testid="identity-map-section">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
              Identity relationships on the estate canvas
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
          <div className="mt-1.5 space-y-2">
            {/*
              The canvas is rendered whenever the producer supplied graph data,
              and the notices below sit BESIDE it rather than replacing it.
              Previously an empty roles projection removed the map entirely, so
              a customer with users, policies and accounts but no workload role
              bindings saw a blank panel and a confident message telling them
              the blank was the answer. Roles being empty is a statement about
              roles, not about the graph.
            */}
            {graphHasData ? (
              <div data-testid="identity-canvas-slot">{canvas ?? null}</div>
            ) : null}
            {view.state === "incomplete" ? (
              // Roles the producer counted but could not render. A banner, not
              // a replacement: whatever graph data exists is still drawn above.
              <div
                data-testid="identity-incomplete"
                className="rounded-lg border px-3 py-2.5 text-[11px]"
                style={{ borderColor: WARN_LINE, background: WARN_BG, color: INK }}
              >
                <span className="font-semibold" style={{ color: WARN }}>
                  {graphHasData
                    ? "Some roles could not be rendered — the map below is not the whole picture."
                    : "The map is empty because these roles could not be rendered, not because none exist."}
                </span>{" "}
                {view.detail}
              </div>
            ) : null}
            {emptyClaim === "qualified_empty" ? (
              // A QUALIFIED empty. The role-binding half is backed by the
              // inventory receipt; the other half is not, and says so. The
              // producer derives readiness from the absence of gaps, so it
              // cannot distinguish a family that returned no rows from one
              // that was never read — and a frontend must not certify that on
              // its behalf.
              <div
                data-testid="identity-empty-authoritative"
                data-identity-empty-claim="qualified_empty"
                className="rounded-lg border px-3 py-2.5 text-[11px]"
                style={{ borderColor: LINE, background: "#FFFFFF", color: INK }}
              >
                <span className="font-semibold">
                  No workload-to-role binding exists in the generation that was read.
                </span>{" "}
                That part is an answer, not a missing read — the receipts in Evidence name the
                generation and its binding completeness.
                {/*
                  The canvas notice already carries this paragraph when the
                  canvas is on screen. Printing the same three lines twice on
                  one view made the qualified empty read as noise rather than
                  as an answer, so the long form appears here only when there
                  is no canvas to carry it.
                */}
                {canvasCarriesCoverage ? (
                  <span
                    data-testid="identity-empty-coverage-pointer"
                    className="mt-1.5 block"
                    style={{ color: WARN }}
                  >
                    Absence of the other{" "}
                    {IDENTITY_FAMILIES_WITHOUT_COVERAGE_RECEIPT.length} relationship families is
                    unknown rather than zero — see the note on the canvas.
                  </span>
                ) : (
                  <span
                    data-testid="identity-empty-coverage-caveat"
                    className="mt-1.5 block"
                    style={{ color: WARN }}
                  >
                    {IDENTITY_FAMILY_COVERAGE_MISSING_LINK} Unknown rather than zero here:{" "}
                    <span className="font-mono">{IDENTITY_FAMILIES_WITHOUT_COVERAGE_RECEIPT.join(", ")}</span>.
                  </span>
                )}
              </div>
            ) : null}
            {!graphHasData && emptyClaim === "unread" && view.state !== "incomplete" ? (
              <div
                data-testid="identity-graph-unread"
                className="rounded-lg border px-3 py-2.5 text-[11px]"
                style={{ borderColor: WARN_LINE, background: WARN_BG, color: INK }}
              >
                <span className="font-semibold" style={{ color: WARN }}>
                  No identity relationship is drawn, and that is not a statement that none exist.
                </span>{" "}
                {view.detail}
              </div>
            ) : null}
          </div>
          <RoleGaps view={view} />
        </section>
      ) : null}

      <details
        data-testid="identity-evidence-drawer"
        className="mt-3 rounded-lg border px-3 py-2"
        style={{ borderColor: LINE, background: "#FFFFFF" }}
      >
        <summary
          className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: MUTED }}
          data-testid="identity-evidence-summary"
        >
          Evidence — receipts, family coverage, projection hashes
        </summary>
        <p className="mt-1.5 text-[11px]" style={{ color: MUTED }}>
          Technical receipts and the installed-path capability matrix. They describe how this
          reading was produced, not a claim that every family is drawn on the map.
        </p>
        {/* Everything the compact header stopped showing. Moved here, not
            dropped: a reader who wants the contract version, the generation
            numbers, the per-field scope check or the full limitation list
            finds all of it one click away. */}
        <section className="mt-3" data-testid="identity-evidence-diagnostics">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
            Contract, generation and scope
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {view.contractVersion ? (
              <Chip testId="identity-contract-version" label={view.contractVersion} />
            ) : null}
            {view.projectionStatus ? (
              <Chip testId="identity-projection-status" label={`status ${view.projectionStatus}`} />
            ) : null}
          </div>
          {/* Only the chips the compact header drops — the indicator itself
              stays single, so its test ids remain unique on the page. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {indicator.inventoryGeneration !== null || indicator.decisionGeneration !== null ? (
              <Chip
                testId="identity-coverage-freshness"
                label={[
                  indicator.inventoryGeneration !== null
                    ? `inventory generation ${indicator.inventoryGeneration}${indicator.inventoryCertified ? " (certified)" : ""}`
                    : null,
                  indicator.decisionGeneration !== null
                    ? `decision generation ${indicator.decisionGeneration}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ) : null}
            {indicator.familiesAvailable !== null && indicator.familiesTotal !== null ? (
              <Chip
                testId="identity-coverage-families"
                label={`${indicator.familiesAvailable} of ${indicator.familiesTotal} families servable`}
              />
            ) : null}
          </div>
          <div className="mt-1.5">
            <ScopeBindingLine binding={view.scopeBinding} />
          </div>
          <CoverageLimits limits={indicator.limits} />
        </section>
        <section className="mt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
            Projection authority
          </h3>
          <div className="mt-1.5">
            <Receipts receipts={view.receipts} />
          </div>
        </section>
        <CapabilityMatrix view={view} />
        <p className="mt-3 text-[10px] leading-relaxed" style={{ color: MUTED }}>
          Read from the <span className="font-mono">estate-identity-access/v1</span> block on this
          estate&apos;s topology-risk payload. This tab issues no request of its own and performs no
          graph traversal.
        </p>
      </details>
    </div>
  )
}
