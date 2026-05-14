// lib/decision-routing.ts
//
// v4.4 §11E canonical routing decision — 4-state — and a vocabulary
// mapper for it. Foundation for convergence across the codebase's
// currently-coexisting decision vocabularies. Adopted on top of (not
// replacing) the legacy `DecisionOutcomeCanonical` in lib/types.ts so
// migration can happen component-by-component without breaking the wire.

/**
 * Convergent routing decision per v4.4 §11E. Four states, ordered from
 * strictest (INSUFFICIENT_DATA) to most permissive (AUTO).
 */
export type RoutingDecision =
  | "AUTO"
  | "STAGED_AUTO"
  | "SUGGEST"
  | "INSUFFICIENT_DATA"

/**
 * Strictness order: lower index = more conservative.
 *   INSUFFICIENT_DATA < SUGGEST < STAGED_AUTO < AUTO
 *
 * When reconciling multiple verdicts (e.g. pipeline vs agent reviewer
 * in iam-permission-analysis-modal), prefer the lower-rank value — the
 * system should never over-permit when any source is more conservative.
 */
const RANK: Record<RoutingDecision, number> = {
  INSUFFICIENT_DATA: 0,
  SUGGEST: 1,
  STAGED_AUTO: 2,
  AUTO: 3,
}

/**
 * Map any known decision string to the canonical 4-state.
 *
 * Returns `null` for unknown / nullish input — callers should treat null
 * as "unknown/pending", never as a default routing. The helper deliberately
 * does NOT fall through to AUTO; an unrecognised value must surface as
 * uncertain rather than silently being classified as safe-to-apply.
 *
 * Mapping table (case-insensitive on input):
 *
 *   → AUTO              : AUTO_EXECUTE, AUTO_REMEDIATE, EXECUTE,
 *                          auto_execute, AUTO
 *   → STAGED_AUTO       : CANARY_FIRST, CANARY, REQUIRE_APPROVAL,
 *                          human_approval, STAGED_AUTO
 *   → SUGGEST           : MANUAL_REVIEW, REVIEW, manual_review, SUGGEST
 *   → INSUFFICIENT_DATA : BLOCK, BLOCKED, blocked, EXCLUDE,
 *                          INSUFFICIENT_DATA
 *
 * The four input vocabularies this helper consolidates:
 *
 *   1. 6-state `DecisionOutcomeCanonical` in lib/types.ts — the backend
 *      wire format (AUTO_EXECUTE / REQUIRE_APPROVAL / CANARY_FIRST /
 *      MANUAL_REVIEW / BLOCK / EXCLUDE). Named "Canonical" but predates
 *      v4.4 §11E.
 *   2. 4-state lowercase-snake bucket in iam-permission-analysis-modal.tsx
 *      `canonicalToBucket` (blocked / manual_review / human_approval /
 *      auto_execute).
 *   3. 4-state SCREAMING_SNAKE in s3-remediation-card / sg-remediation-card
 *      (already AUTO / STAGED_AUTO / SUGGEST / INSUFFICIENT_DATA).
 *   4. 4-state in simulate-modal.tsx (EXECUTE / CANARY / REVIEW / BLOCK),
 *      and the AUTO_REMEDIATE / CANARY / REQUIRE_APPROVAL / BLOCK shape
 *      its switch reads from `simulation.decision.action`.
 *
 * Semantic notes:
 *
 *   - REQUIRE_APPROVAL → STAGED_AUTO (not SUGGEST) mirrors the legacy
 *     `canonicalToBucket` in iam-permission-analysis-modal:1761, which
 *     lumps REQUIRE_APPROVAL with CANARY_FIRST as `human_approval`. This
 *     keeps that modal's semantics intact if/when it migrates.
 *   - EXCLUDE → INSUFFICIENT_DATA collapses the per-permission "explicit
 *     exclude" outcome into the routing-level "we will not auto-act"
 *     bucket. They are semantically distinct (EXCLUDE = decided not to,
 *     INSUFFICIENT_DATA = couldn't decide) but v4.4 §11E only has the
 *     latter at the routing layer. If a caller needs the distinction,
 *     branch on the raw input before normalising.
 */
export function toRoutingDecision(input: unknown): RoutingDecision | null {
  if (input == null) return null
  if (typeof input !== "string" && typeof input !== "number") return null
  const s = String(input).trim().toUpperCase()
  if (s === "") return null

  switch (s) {
    case "AUTO":
    case "STAGED_AUTO":
    case "SUGGEST":
    case "INSUFFICIENT_DATA":
      return s as RoutingDecision

    case "AUTO_EXECUTE":
    case "AUTO_REMEDIATE":
    case "EXECUTE":
      return "AUTO"

    case "CANARY_FIRST":
    case "CANARY":
    case "REQUIRE_APPROVAL":
    case "HUMAN_APPROVAL":
      return "STAGED_AUTO"

    case "MANUAL_REVIEW":
    case "REVIEW":
      return "SUGGEST"

    case "BLOCK":
    case "BLOCKED":
    case "EXCLUDE":
      return "INSUFFICIENT_DATA"

    default:
      return null
  }
}

const LABELS: Record<RoutingDecision, string> = {
  AUTO: "Safe to apply",
  STAGED_AUTO: "Canary first",
  SUGGEST: "Review required",
  INSUFFICIENT_DATA: "Blocked — insufficient evidence",
}

/**
 * Short human-readable label for a routing decision. Designed for badge
 * and chip surfaces. For longer copy (modal headlines, banners), write
 * context-specific text — these labels are intentionally tight.
 */
export function routingLabel(d: RoutingDecision | null): string {
  if (!d) return "Pending"
  return LABELS[d]
}

/**
 * Numeric rank — lower = more conservative. Use for sorting or
 * comparison logic. Order: INSUFFICIENT_DATA(0) < SUGGEST(1) <
 * STAGED_AUTO(2) < AUTO(3).
 */
export function routingRank(d: RoutingDecision): number {
  return RANK[d]
}

/**
 * Return the stricter (lower-rank) of two routing decisions. Treats null
 * as INSUFFICIENT_DATA (strictest possible). Useful when the UI must
 * reconcile multiple sources (e.g. pipeline verdict + agent reviewer in
 * iam-permission-analysis-modal:1775–1785) — the system should never
 * over-permit when one source is more conservative.
 */
export function stricter(
  a: RoutingDecision | null,
  b: RoutingDecision | null,
): RoutingDecision {
  const aa: RoutingDecision = a ?? "INSUFFICIENT_DATA"
  const bb: RoutingDecision = b ?? "INSUFFICIENT_DATA"
  return RANK[aa] <= RANK[bb] ? aa : bb
}
