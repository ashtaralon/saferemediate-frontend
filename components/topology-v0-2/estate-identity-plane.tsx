"use client"

/**
 * Estate · Identity & access — the frame-side pieces of the identity lens.
 *
 * CF01. The Identity & access view is the same AwsFrame the Network view
 * draws: same VPC frames, subnet grid, rails, chips, FlowOverlay, selection,
 * fullscreen zoom/pan and DetailPanel. The lens swaps only the frame's
 * INPUTS (estate-identity-twin.ts): IAM roles as a rail lane, reached AWS
 * services as regional / trigger chips, trust principals in the top strip,
 * and identity lines in place of traffic. This module keeps what the frame
 * needs beside that: the props contract, the legend, the not-an-answer
 * notice, the footer that counts every hidden set, and the identity-node →
 * TopologyNode adapter the DetailPanel consumes.
 *
 * The earlier identity plane band — sixteen kind-rows of chips under the
 * frame with one orthogonal line per relationship — was retired here: it
 * was a second grammar on one canvas, and unreadable at estate scale.
 */

import {
  IDENTITY_KIND_LABEL,
  gapNamesItsCause,
  type IdentityFamilyVerdict,
  type IdentityLens,
  type IdentityLensNode,
  type IdentityLensNodeKind,
} from "./estate-identity-access-model"
import type { IdentityTwin } from "./estate-identity-twin"
import { IDENTITY_KIND_LEGEND_ITEMS, IDENTITY_LEGEND_ITEMS } from "./flow-visuals"
import type { TopologyNode } from "./types"

/** What the frame needs from the host to draw the lens. */
export interface IdentityLensFrameProps {
  lens: IdentityLens
  /** The frame inputs derived from the lens: rail nodes, strip nodes, captions, counts. */
  twin: IdentityTwin
  focusedNodeId: string | null
}

/**
 * The topology `type` an identity node is drawn with. IAMRole / IAMPolicy /
 * IAMUser resolve to official icons through the presentation catalog; the
 * rest are text glyphs registered in aws-frame.tsx `nodeIcon`.
 */
export const IDENTITY_TOPOLOGY_TYPE: Record<IdentityLensNodeKind, string> = {
  workload: "Workload",
  iam_role: "IAMRole",
  iam_user: "IAMUser",
  iam_policy: "IAMPolicy",
  iam_group: "IAMGroup",
  service_principal: "ServicePrincipal",
  federated_principal: "FederatedPrincipal",
  aws_account_principal: "AWSAccountPrincipal",
  credential: "IAMCredential",
  protected_resource: "ProtectedResource",
  resource_policy: "ResourcePolicy",
  decision: "ActionDecision",
  // CF01 lane F — distinct from AWSAccountPrincipal. One icon for both would
  // make a trusted external account look like this estate's own account.
  aws_account: "AWSAccount",
  organization: "Organization",
  organizational_unit: "OrganizationalUnit",
  control_policy: "ControlPolicy",
}

/**
 * An identity-plane node as the TopologyNode the shared chip and the shared
 * DetailPanel consume. `subnet_id`/`score`/`stale` are null because the
 * producer states none of them for an identity node — this is the minimum
 * the chip needs, not a claim about placement or posture.
 */
export function identityNodeAsTopologyNode(node: IdentityLensNode): TopologyNode {
  return {
    id: node.id,
    name: node.label,
    type: IDENTITY_TOPOLOGY_TYPE[node.kind],
    subnet_id: null,
    score: null,
    stale: null,
    is_jewel: false,
    // `resource_id` stays absent: the id is a canvas anchor
    // (`__identity:<kind>:<key>__`), so `inspectableResourceId` returns null
    // and the panel requests nothing from Inventory for it.
  }
}

/**
 * The line under an identity chip's name: what this thing IS, and which
 * account it belongs to.
 *
 * Built only from producer fields (kind, arn, resource_uid). The chip's own id
 * is a canvas anchor and stays internal — rendering `__identity:iam_role:…`
 * told a reader nothing and, truncated, actively hid the account that
 * distinguishes two roles with the same name. Cross-account principals are the
 * case that matters: a trusted external account must never read as the
 * tenant's own.
 */
export function identityChipSubtitle(node: IdentityLensNode): string {
  // arn:aws:iam::416651950952:role/web -> 416651950952
  const fromArn = typeof node.arn === "string" ? node.arn.split(":")[4] : undefined
  // aws:iam:role:416651950952:web -> 416651950952
  const fromUid =
    !fromArn && typeof node.resourceUid === "string" ? node.resourceUid.split(":")[3] : undefined
  const account = fromArn || fromUid
  // The account is the DISCRIMINATOR and must survive the chip width intact —
  // a truncated "416651950…" cannot be told from another account with the same
  // prefix, which is the whole reason it is shown. The kind is already stated
  // by the group header above the chip and by its icon, so spending the line
  // on "IAM role · " pushed the one distinguishing value off the end.
  if (account && /^\d{12}$/.test(account)) return `acct ${account}`
  return IDENTITY_KIND_LABEL[node.kind]
}

/**
 * CF01 — the footer under the legend: every set the twin did NOT draw, as a
 * number. A lane of nine role chips over an account of forty-two roles must
 * say so, or the map reads as the account's IAM.
 */
export function IdentityTwinFooter({
  lens,
  twin,
  compact = false,
}: {
  lens: IdentityLens
  twin: IdentityTwin
  compact?: boolean
}) {
  const c = twin.counts
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  const parts: Array<{ key: string; text: string }> = [
    { key: "bound-roles", text: `${plural(c.boundRoles, "role")} bound to a workload on this canvas` },
  ]
  if (c.rolesUsageNotComputed > 0) {
    parts.push({ key: "usage-not-computed", text: `${c.rolesUsageNotComputed} of them: usage not computed (no reach line)` })
  }
  if (c.boundWorkloadsOffCanvas > 0) {
    parts.push({ key: "workloads-off-canvas", text: `${plural(c.boundWorkloadsOffCanvas, "bound workload")} outside this canvas scope` })
  }
  if (c.externalRoles > 0) {
    parts.push({ key: "external-roles", text: `${plural(c.externalRoles, "role")} assumable from outside, not run by a workload here` })
  }
  if (c.legacyLines > 0) {
    parts.push({ key: "legacy-lines", text: `${plural(c.legacyLines, "observed access line")} from the legacy graph · unverified, never moving` })
  }
  if (c.otherAccountRoles > 0) {
    parts.push({ key: "other-roles", text: `${plural(c.otherAccountRoles, "other role")} in the account, not drawn` })
  }
  if (c.serviceLinkedRoles > 0) {
    parts.push({ key: "service-linked", text: `${plural(c.serviceLinkedRoles, "service-linked role")} (by name), not drawn` })
  }
  if (c.users > 0) parts.push({ key: "users", text: `${plural(c.users, "IAM user")} in the graph, not drawn` })
  if (c.reachNotDrawn > 0) {
    parts.push({ key: "reach-not-drawn", text: `${plural(c.reachNotDrawn, "reached service")} with no place on this canvas (listed on the role chip)` })
  }
  if (c.targetsNotOnMap > 0) {
    parts.push({ key: "targets-not-on-map", text: `${plural(c.targetsNotOnMap, "protected resource")} not on this map` })
  }
  if (c.endpointPolicyRows > 0) {
    parts.push({ key: "endpoint-policy", text: `${plural(c.endpointPolicyRows, "VPC endpoint policy row")} projected` })
  }
  const unavailable = lens.families.filter(f => f.status === "unavailable").length
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 ${compact ? "px-1 py-0.5" : "px-2 py-1"}`}
      style={{ color: "#5A6B7A" }}
      data-testid="identity-twin-footer"
      data-flow-obstacle="identity-footer"
    >
      {parts.map(part => (
        <span key={part.key} className="text-[9px] font-medium whitespace-nowrap" data-testid={`identity-twin-footer-${part.key}`}>
          {part.text}
        </span>
      ))}
      {unavailable > 0 ? (
        <span className="text-[9px] font-medium whitespace-nowrap" data-testid="identity-twin-footer-unavailable" style={{ color: "#92400E" }}>
          {unavailable} relationship famil{unavailable === 1 ? "y" : "ies"} not on the canonical path (see legend)
        </span>
      ) : null}
    </div>
  )
}

/** The explicit not-an-answer state. Never a blank band. */
export function IdentityLensNotice({ lens }: { lens: IdentityLens }) {
  // The model decides this, not the view. `lens.state` alone is the v1 ROLES
  // projection's word: a payload can read its roles perfectly and still have
  // failed to read its identity graph, and keying the calm "this is an answer"
  // styling off `state === "ready"` rendered that failure as a confident empty.
  const emptyAnswer = lens.emptyAnswer
  return (
    <div
      className="rounded-lg border px-3 py-2.5 text-[11px]"
      style={
        emptyAnswer
          ? { borderColor: "#CBD5E1", background: "#FFFFFF", color: "#1A2330" }
          : { borderColor: "#F2C94C", background: "#FFFBEB", color: "#1A2330" }
      }
      data-testid="identity-lens-notice"
      data-identity-empty-answer={emptyAnswer ? "true" : "false"}
      role="status"
    >
      <div className="font-semibold" style={{ color: emptyAnswer ? "#1A2330" : "#92400E" }}>
        {lens.headline}
      </div>
      <div className="mt-0.5" style={{ color: "#5A6B7A" }}>
        {lens.detail}
      </div>
      {!emptyAnswer ? (
        <div className="mt-1 font-semibold" style={{ color: "#92400E" }}>
          No identity relationship is drawn on this canvas. That is not a statement that there
          are no identities, roles or grants in this scope — the evidence is not available here.
        </div>
      ) : (
        // Even the backed empty is QUALIFIED. The producer derives readiness
        // from the absence of gaps, so a family that returned no rows and one
        // that was never read are indistinguishable to it; only the
        // workload-to-role binding carries a completeness receipt.
        <div
          className="mt-1"
          style={{ color: "#92400E" }}
          data-testid="identity-lens-notice-coverage"
        >
          {lens.coverageMissingLink} Unknown rather than zero here:{" "}
          <span className="font-mono">{lens.familiesWithoutCoverageReceipt.join(", ")}</span>.
        </div>
      )}
      {lens.gaps.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 font-mono text-[10px]" style={{ color: "#92400E" }}>
          {lens.gaps.slice(0, 8).map((gap, index) => {
            // A gap code printed beside its detail READS AS A NAMED FINDING.
            // Some of these codes name no cause at all: the producer emits them
            // when a failure occurred that its contract cannot classify, and
            // their detail carries only the exception TYPE. Printing such a
            // token the same way as a real diagnosis invites a reader to treat
            // "ValueError" as the finding. The code stays — support needs it,
            // and the producer's own words are never rewritten here — but it is
            // marked as a refusal whose cause was not established.
            const named = gapNamesItsCause(gap.code)
            return (
              <li
                key={`${gap.code}-${index}`}
                data-testid="identity-lens-notice-gap"
                data-gap-code={gap.code}
                data-gap-names-cause={named ? "true" : "false"}
              >
                {gap.code} — <span style={{ color: "#1A2330" }}>{gap.detail}</span>
                {named ? null : (
                  <span
                    data-testid="identity-lens-notice-gap-unnamed"
                    style={{ color: "#92400E" }}
                  >
                    {" "}
                    (the producer could not name a cause — this is a refusal, not a diagnosis)
                  </span>
                )}
              </li>
            )
          })}
          {lens.gaps.length > 8 ? <li>+{lens.gaps.length - 8} more gaps</li> : null}
        </ul>
      ) : null}
    </div>
  )
}

function verdictTone(row: IdentityFamilyVerdict): { color: string; bg: string } {
  if (row.status === "available") return { color: "#0E8B7A", bg: "#E6FBF7" }
  if (row.status === "no_verdict") return { color: "#5A6B7A", bg: "#F8FAFC" }
  return { color: "#92400E", bg: "#FFFBEB" }
}

/** Replaces the traffic FlowLegend on the identity lens. */
export function IdentityLensLegend({ lens, twin, compact = false }: { lens: IdentityLens; twin?: IdentityTwin; compact?: boolean }) {
  const drawnFor = (family: string, fallback: number) =>
    twin ? (twin.counts.drawnByFamily[family] ?? 0) : fallback
  const available = lens.families.filter(f => f.status === "available")
  const unavailable = lens.families.filter(f => f.status === "unavailable")
  const noVerdict = lens.families.filter(f => f.status === "no_verdict")
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-y ${compact ? "px-1 py-1" : "px-2 py-1.5"}`}
      style={{ borderColor: "#E2E8F0", background: "rgba(255,255,255,0.86)" }}
      data-testid="identity-lens-legend"
      data-flow-obstacle="identity-legend"
      aria-label="Identity relationship legend"
    >
      <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "#475569" }}>
        Colour · kind of access
      </span>
      {IDENTITY_KIND_LEGEND_ITEMS.map(item => (
        <span
          key={item.kind}
          className="inline-flex items-center gap-1.5 whitespace-nowrap"
          data-testid={`identity-legend-kind-${item.kind}`}
          title={item.detail}
        >
          <span className="inline-block rounded-sm" style={{ width: 14, height: 8, background: item.color }} aria-hidden />
          <span className="text-[9px] font-medium" style={{ color: "#475569" }}>
            {item.label}
          </span>
        </span>
      ))}
      <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "#475569" }}>
        Style · evidence
      </span>
      {IDENTITY_LEGEND_ITEMS.map(item => (
        <span
          key={item.key}
          className="inline-flex items-center gap-1.5 whitespace-nowrap"
          data-testid={`identity-legend-${item.key}`}
          title={item.detail}
        >
          <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden>
            <path d="M1 4 H23" stroke={item.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={item.dash} />
            <path d="M21 1 L27 4 L21 7 Z" fill={item.color} />
          </svg>
          <span className="text-[9px] font-medium" style={{ color: "#475569" }}>
            {item.label}
          </span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-[9px] font-medium" style={{ color: "#0E8B7A" }} data-testid="identity-legend-motion">
        Moving = observed with a named generation · a configured or trust line never moves
      </span>
      <details className="ml-auto text-[9px]" data-testid="identity-legend-families">
        <summary className="cursor-pointer font-semibold" style={{ color: "#475569" }}>
          {available.length} famil{available.length === 1 ? "y" : "ies"} servable ·{" "}
          {unavailable.length} not on the canonical path
          {noVerdict.length > 0 ? ` · ${noVerdict.length} without a verdict` : ""}
        </summary>
        <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
          {lens.families.map(row => {
            const tone = verdictTone(row)
            return (
              <li
                key={row.family}
                className="rounded border px-1.5 py-0.5"
                style={{ borderColor: tone.color, background: tone.bg }}
                data-testid="identity-legend-family"
                data-family={row.family}
                data-status={row.status}
                data-drawn={String(drawnFor(row.family, row.drawn))}
                title={row.detail}
              >
                <span className="font-mono font-semibold" style={{ color: "#1A2330" }}>
                  {row.family}
                </span>{" "}
                <span style={{ color: tone.color }}>
                  {row.status === "available"
                    ? `${row.plane ?? "plane not asserted"} · ${drawnFor(row.family, row.drawn)} drawn`
                    : row.status === "no_verdict"
                      ? `no verdict carried · ${drawnFor(row.family, row.drawn)} drawn`
                      : `not drawn — ${row.reason_codes.join(", ")}`}
                </span>
              </li>
            )
          })}
        </ul>
      </details>
    </div>
  )
}
