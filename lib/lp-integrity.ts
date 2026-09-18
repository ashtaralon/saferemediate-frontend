/**
 * Analysis integrity for Least-Privilege / Resource Risk surfaces.
 *
 * The backend (`unified/lp/endpoint.py`) tells us whether the analyzer sweep
 * that produced a payload actually completed. It deliberately does NOT tell us
 * whether anything may be mutated:
 *
 *   > Analyzer integrity can veto mutation, but it cannot authorize mutation.
 *
 * A complete sweep proves only that every analyzer returned. It proves nothing
 * about CloudTrail coverage, observation-window continuity, data-event
 * selectors, or a signed plan. So `analysis_complete === true` means "this
 * analysis may be PRESENTED as complete" and never "this may be APPLIED".
 * There is no `mutations_allowed` field and there must not be one — a field
 * that can say yes eventually gets set to yes.
 *
 * `mutationBlocked` below is a VETO derived from analysis state. It is not
 * permission. Apply authority comes from the mutation/coverage gate at the
 * apply endpoint, which enforces independently — the UI is a courtesy to an
 * honest operator, not a security boundary.
 */

export type LPServeState = "READY" | "INTEGRITY_HELD" | "NOT_READY"

/** The integrity fields any LP payload may carry. All optional: older
 *  responses (and cached ones written before the backend change) have none. */
export interface LPIntegrityFields {
  serve_state?: string
  analysis_complete?: boolean
  failedAnalyzers?: string[]
  failed_analyzers?: string[]
  integrityReason?: string
  counts_are_partial?: boolean
  /**
   * Set by the proxy (app/api/proxy/least-privilege/issues/route.ts) when it
   * served its last good payload because the live fetch failed. This is the
   * ONLY signal that a NOT_READY payload is a stale serve; the reason text is
   * prose and must never be pattern-matched for it (see lpIntegrityCopy).
   */
  fromStaleCache?: boolean
  /** Why the proxy fell back, e.g. "timeout". Display only. */
  staleReason?: string
}

export interface LPIntegrity {
  state: LPServeState
  /** True only when the backend positively said the sweep completed. */
  analysisComplete: boolean
  /** Veto on destructive controls. Never a grant. */
  mutationBlocked: boolean
  /** Counts and totals in this payload are a subset of unknown size. */
  countsArePartial: boolean
  failedAnalyzers: string[]
  reason: string | null
  /**
   * The proxy served a previous payload because the live fetch failed.
   * Typed, from the proxy — never inferred from `reason`. Absent means
   * "not a stale serve".
   */
  servedFromStaleCache?: boolean
  staleReason?: string | null
}

/**
 * Derive integrity from a payload.
 *
 * Absent fields resolve to NOT_READY, not READY. A payload with no integrity
 * information is one we cannot vouch for — treating silence as health is the
 * exact defect this whole change set exists to remove, and it would also mean
 * a backend rollback silently re-enabled Apply everywhere.
 */
export function deriveLPIntegrity(
  payload: LPIntegrityFields | null | undefined,
): LPIntegrity {
  const failed = payload?.failedAnalyzers ?? payload?.failed_analyzers ?? []

  // Explicit boolean check. `undefined` must not pass as complete, and a
  // truthy-ish value is not the same as `true`.
  const analysisComplete = payload?.analysis_complete === true

  let state: LPServeState
  if (payload?.serve_state === "READY" && analysisComplete) {
    state = "READY"
  } else if (payload?.serve_state === "NOT_READY") {
    state = "NOT_READY"
  } else if (payload?.serve_state === "INTEGRITY_HELD") {
    state = "INTEGRITY_HELD"
  } else {
    // Unknown or missing serve_state — including a stale cached payload from
    // before the backend emitted these fields.
    state = "NOT_READY"
  }

  return {
    state,
    analysisComplete,
    mutationBlocked: state !== "READY",
    countsArePartial: payload?.counts_are_partial === true || state !== "READY",
    failedAnalyzers: failed,
    reason: payload?.integrityReason ?? null,
    servedFromStaleCache: payload?.fromStaleCache === true,
    staleReason:
      typeof payload?.staleReason === "string" && payload.staleReason
        ? payload.staleReason
        : null,
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The explicit signed operator-override classification.
 *
 * WHY THIS IS SEPARATE FROM `mutationBlocked`. `mutationBlocked` is one boolean
 * over `state !== "READY"` and it stays exactly as it is: it vetoes ordinary
 * Apply, approval and execution, and it must keep doing so. But the backend's
 * operator-override branch (`api/iam_gap_analysis.py::_require_iam_mutation_authority`)
 * says in its own comment "Break-glass bypasses evidence-generation/certification
 * readiness", and then enforces a DIFFERENT, narrower set of blockers. Collapsing
 * both into one boolean is what made the mounted UI offer "Remediate Anyway",
 * really prepare a server-signed plan, and then refuse to confirm it — with a
 * reason naming the exact blocker class the backend override exists to pass.
 *
 * So this classifies the canonical package per CODE, using the producer's own
 * typed fields, and it fails closed on anything it does not recognise.
 *
 * `ActionReadiness.blockers` IS A UNION. `unified/readiness/canonical_package.py`
 * does `action_blockers.extend(mutation_authority.blockers)`, so operational
 * codes arrive mixed in with evidence ones. Reading "action has blockers"
 * wholesale would fold the operational refusals back into the soft set — the
 * original defect inverted. Every code is partitioned individually below.
 * ──────────────────────────────────────────────────────────────────────────── */

/** `EngineCertification.to_wire()`. */
export interface CanonicalEngineWire {
  certified?: boolean
  attestation_matches_build?: boolean
  build_sha?: string | null
  blockers?: unknown
}

/** `TenantGenerationReadiness.to_wire()`. */
export interface CanonicalGenerationWire {
  known?: boolean
  active_generation_id?: string | null
  negative_authority_permitted?: boolean
  coverage_state?: string
  blockers?: unknown
  readiness_failures?: unknown
  lane?: string | null
  decision_family?: string | null
}

/** `ActionReadiness.to_wire()`. */
export interface CanonicalActionWire {
  can_issue_plan?: boolean
  can_apply?: boolean
  remediable?: boolean
  blockers?: unknown
}

/** `CanonicalReadinessPackage.to_wire()`. */
export interface CanonicalReadinessWire {
  schema?: string
  serve_state?: string
  engine?: CanonicalEngineWire
  generation?: CanonicalGenerationWire
  action?: CanonicalActionWire
  fingerprint?: string
  probed_at?: string
  expires_at?: string
  cached?: boolean
  analysis_complete?: boolean | null
}

export const CANONICAL_READINESS_SCHEMA = "canonical-readiness/v1"

/**
 * Codes an explicit signed operator override MAY pass: evidence/generation and
 * certification-absence. Every one is emitted by
 * `unified/readiness/canonical_package.py`.
 */
export const OVERRIDABLE_EVIDENCE_BLOCKERS: ReadonlySet<string> = new Set([
  "ACTIVE_GENERATION_UNKNOWN",
  "GENERATION_NOT_READY",
  "DECISION_READINESS_NOT_READY",
  "TRAFFIC_INGEST_NOT_INCREMENTAL",
  "NEGATIVE_AUTHORITY_NOT_PERMITTED",
  "GENERATION_REFUSES_NEGATIVE_AUTHORITY",
  "PROJECTION_WATERMARK_STALE",
  "PROJECTION_WATERMARK_AHEAD",
  // Certification ABSENCE proved by a completed check. Attestation FAILURES are
  // hard below; ENGINE_CERTIFICATION_UNAVAILABLE is hard too, because
  // "unavailable" means the check did not produce an answer.
  "BUILD_SHA_UNKNOWN",
  "ENGINE_NOT_CERTIFIED",
  // An ordinary candidate-count veto, NOT activation proof. It may coexist with
  // awaiting-evidence actions, which is exactly what an explicit signed override
  // targets, so it does not veto THIS path. It still vetoes ordinary Apply,
  // which is gated by `mutationBlocked` and never by this function.
  "NO_UNUSED_CANDIDATE",
])

/** Integrity/attestation failures. A check ran and failed; never overridable. */
export const INTEGRITY_BLOCKERS: ReadonlySet<string> = new Set([
  "ATTESTATION_VERIFICATION_FAILED",
  "ATTESTATION_NOT_BOUND_TO_BUILD",
  "ENGINE_CERTIFICATION_UNAVAILABLE",
  "INTEGRITY_HELD",
])

/**
 * Operational authority. These reach `action.blockers` through the union with
 * `evaluate_iam_mutation_authority`, and the backend enforces every one of them
 * again even with a signed plan.
 */
export const OPERATIONAL_BLOCKERS: ReadonlySet<string> = new Set([
  "IAM_MUTATION_NOT_DECLARED",
  "WEB_GRAPH_READ_ONLY_BOUNDARY_UNPROVEN",
  "TENANT_LIFECYCLE_STATE_NOT_READY",
  "RELEASE_TIER_REFUSES_MUTATION",
  "SIGNED_PLAN_REQUIRED",
  "REMEDIATION_ASSUME_ROLE_DISABLED",
  "CUSTOMER_REMEDIATOR_NOT_CONFIGURED",
])

const KNOWN_SERVE_STATES: ReadonlySet<string> = new Set([
  "READY",
  "NOT_READY",
  "INTEGRITY_HELD",
])

/**
 * `TenantGenerationReadiness.readiness_failures` carries the upstream
 * `DecisionReadinessReport.failures` VERBATIM, and the blocker code does not
 * represent them: `generation_block_code` skips
 * `TRAFFIC_INGEST_NOT_INCREMENTAL` precisely when failures are present and
 * falls through to a generic code, while `generation_block_reason` appends the
 * failures separately. So they must be classified on their own.
 *
 * That vocabulary is large (~70 codes in `cyntro_data/decision_readiness.py`)
 * and its severity spread is wide: `SNAPSHOT_ROOT_HASH_MISMATCH`,
 * `SNAPSHOT_SHARD_ATTESTATION_FAILED`, `SNAPSHOT_AGGREGATE_HASH_MISMATCH`,
 * `DDB_PROJECTION_METADATA_MISMATCH` and `NEO4J_ACTIVE_POINTER_INVALID` are
 * corruption and mismatch facts, not "evidence has not arrived yet".
 *
 * This is therefore an ALLOWLIST, deliberately small: only failures meaning
 * the readiness ANSWER is absent or aged — not that stored data disagrees with
 * itself — are known evidence gaps. Every other failure refuses. Widening this
 * set is a decision for Root, not a default.
 */
export const OVERRIDABLE_READINESS_FAILURES: ReadonlySet<string> = new Set([
  "READINESS_CACHE_EMPTY",
  "READINESS_CACHE_STALE",
  "PROJECTION_WATERMARK_STALE",
  "PROJECTION_WATERMARK_AHEAD",
])

export type SignedOverrideClassification =
  /**
   * No readiness hold stands in the way; the ordinary rules apply.
   * `expiresAtMs` is the classified package's own expiry, carried so a caller
   * can re-check freshness at click time WITHOUT re-reading and without ever
   * extending the producer's 30-second window.
   */
  | { kind: "no_hold"; codes: []; expiresAtMs: number }
  /** A named evidence/certification hold an explicit signed override may pass. */
  | { kind: "evidence_hold"; codes: string[]; reason: string; expiresAtMs: number }
  /** Refused. `code` is the machine reason; `reason` is shown to the operator. */
  | { kind: "refused"; code: string; reason: string; codes: string[] }

/**
 * A REQUIRED canonical array. The producer's dataclasses declare
 * `blockers: tuple[str, ...]` and `readiness_failures: tuple[str, ...] = ()`,
 * and `to_wire()` is `asdict()`, so every one of them is always serialized.
 * Absence or null is therefore a malformed package, NOT an empty answer —
 * returning `[]` for a missing array is exactly how a missing-authority
 * package would read as "no blockers". The TypeScript interface marks these
 * optional because a wire type must describe what may arrive; validating the
 * producer's required contract is this function's job, not the interface's.
 */
function requiredStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== "string") return null
    out.push(item)
  }
  return out
}

/** A REQUIRED canonical boolean. `undefined`/null/truthy-ish all fail. */
function requiredBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Classify whether an EXPLICIT, exact, signed operator-override plan may be
 * confirmed against this canonical readiness package.
 *
 * Fails closed. Every one of these is a refusal, not a soft hold:
 *
 *  - no package, wrong `schema`, or `engine`/`generation`/`action` not objects;
 *  - any blocker / readiness_failures value that is not an array of strings;
 *  - `analysis_complete !== true` (an incomplete or unconfirmed sweep);
 *  - `serve_state` absent or not one the producer defines;
 *  - `expires_at` absent, unparseable, or in the past — the package is 30s
 *    fresh by construction (`_DEFAULT_TTL_SECONDS = 30`), so a stale one is
 *    re-probed, never replayed;
 *  - a stale-proxy serve, or any failed analyzer;
 *  - any integrity/attestation or operational code;
 *  - any code this build does not recognise.
 *
 * `ACTIVE_GENERATION_UNKNOWN` inside a valid, fresh, completed package is a
 * KNOWN evidence hold and is deliberately different from an absent or
 * malformed package, which is missing authority.
 *
 * This function authorizes nothing on its own: the caller must also hold an
 * active exact signed `operator_override` plan with valid bindings and expiry,
 * plus the operator's name, rationale and rollback acknowledgement, and the
 * backend independently revalidates authority, lineage, plan, scope and
 * snapshot before any write.
 */
export function classifySignedOverrideReadiness(input: {
  readiness: CanonicalReadinessWire | null | undefined
  integrity: LPIntegrity
  /**
   * The RAW outer LP payload. Required, because `LPIntegrity` is lossy at
   * exactly the place that matters here: `deriveLPIntegrity` maps an ABSENT or
   * UNRECOGNISED outer `serve_state` to `NOT_READY`, which is also what a
   * genuine backend NOT_READY produces. Reading only the derived state cannot
   * tell "the backend said not ready" from "this response never said
   * anything", so a nested valid NOT_READY beside an outer unknown would read
   * as a valid evidence hold. The raw fields are validated below.
   */
  payload: LPIntegrityFields | null | undefined
  now?: Date
}): SignedOverrideClassification {
  const { readiness, integrity, payload } = input
  const now = input.now ?? new Date()
  const refuse = (code: string, reason: string, codes: string[] = []) =>
    ({ kind: "refused", code, reason, codes }) as const

  // Raw outer authority, before anything derived is trusted.
  if (!isObject(payload)) {
    return refuse(
      "OUTER_PAYLOAD_ABSENT",
      "The analysis response carrying this readiness is missing, so its state cannot be established.",
    )
  }
  if (typeof payload.serve_state !== "string" || !KNOWN_SERVE_STATES.has(payload.serve_state)) {
    return refuse(
      "OUTER_SERVE_STATE_UNKNOWN",
      `The analysis response reports no recognised serve state (${String(payload.serve_state)}), which is not the same as a backend NOT_READY.`,
    )
  }
  if (payload.analysis_complete !== true) {
    return refuse(
      "OUTER_ANALYSIS_NOT_COMPLETE",
      "The analysis response carrying this readiness does not confirm a completed sweep.",
    )
  }

  if (!isObject(readiness)) {
    return refuse(
      "READINESS_PACKAGE_ABSENT",
      "No canonical readiness package accompanied this analysis, so the override cannot be judged.",
    )
  }
  if (readiness.schema !== CANONICAL_READINESS_SCHEMA) {
    return refuse(
      "READINESS_SCHEMA_UNKNOWN",
      `This build reads ${CANONICAL_READINESS_SCHEMA}; the response declared ${String(
        readiness.schema ?? "no schema",
      )}.`,
    )
  }
  if (!isObject(readiness.engine) || !isObject(readiness.generation) || !isObject(readiness.action)) {
    return refuse(
      "READINESS_PACKAGE_MALFORMED",
      "The readiness package is missing its engine, generation or action section.",
    )
  }
  if (readiness.analysis_complete !== true) {
    return refuse(
      "ANALYSIS_NOT_COMPLETE",
      "The analyzer sweep behind this view is not confirmed complete, so no override may be confirmed.",
    )
  }
  if (hasInconsistentAnalysisState(integrity)) {
    return refuse(
      "ANALYSIS_STATE_INCONSISTENT",
      "This response reports a completed analysis without confirming one, so it is not evidence either way.",
    )
  }
  if (typeof readiness.serve_state !== "string" || !KNOWN_SERVE_STATES.has(readiness.serve_state)) {
    return refuse(
      "SERVE_STATE_UNKNOWN",
      `The readiness package reports an unrecognised serve state (${String(readiness.serve_state)}).`,
    )
  }
  // INTEGRITY_HELD refuses on its own, from EITHER surface, whether or not a
  // separate blocker code happens to be present. It was previously only
  // "known", which let an integrity-held package through on an empty blocker
  // list.
  if (readiness.serve_state === "INTEGRITY_HELD" || integrity.state === "INTEGRITY_HELD") {
    return refuse(
      "INTEGRITY_HELD",
      "Analyzer integrity is held for this view, so no override may be confirmed against it.",
    )
  }
  // Freshness. The producer stamps a 30-second TTL, so this is the check that
  // forces a re-probe at confirmation rather than trusting the payload the page
  // loaded with.
  const expiresAt = typeof readiness.expires_at === "string" ? Date.parse(readiness.expires_at) : NaN
  const probedAt = typeof readiness.probed_at === "string" ? Date.parse(readiness.probed_at) : NaN
  if (!Number.isFinite(expiresAt) || !Number.isFinite(probedAt)) {
    return refuse(
      "READINESS_EXPIRY_UNREADABLE",
      "The readiness package does not carry a readable probe time and expiry, so its freshness cannot be established.",
    )
  }
  if (expiresAt <= probedAt) {
    return refuse(
      "READINESS_WINDOW_INVALID",
      "The readiness package expires at or before it was probed, so its window cannot be trusted.",
    )
  }
  if (expiresAt <= now.getTime()) {
    return refuse(
      "READINESS_EXPIRED",
      "The readiness facts behind this override have expired. Re-read the current facts before confirming.",
    )
  }
  // Stale-proxy serve and analyzer failures are typed stamps, never prose.
  if (isStaleServe(integrity)) {
    return refuse(
      "READINESS_STALE_SERVE",
      "This view is the proxy's last good payload, not a current read, so no override may be confirmed against it.",
    )
  }
  if (integrity.failedAnalyzers.length > 0) {
    return refuse(
      "ANALYZER_FAILED",
      `An analyzer did not finish (${integrity.failedAnalyzers.join(", ")}), so this analysis is incomplete.`,
      integrity.failedAnalyzers,
    )
  }

  const engineBlockers = requiredStringArray(readiness.engine.blockers)
  const generationBlockers = requiredStringArray(readiness.generation.blockers)
  const generationFailures = requiredStringArray(readiness.generation.readiness_failures)
  const actionBlockers = requiredStringArray(readiness.action.blockers)
  if (
    engineBlockers === null
    || generationBlockers === null
    || generationFailures === null
    || actionBlockers === null
  ) {
    return refuse(
      "READINESS_BLOCKERS_MALFORMED",
      "A required readiness blocker list is absent or is not an array of codes, so this package cannot be classified.",
    )
  }

  // Required canonical booleans. These are the authority facts; an absent or
  // non-boolean value is missing authority, never a permissive default.
  const certified = requiredBoolean(readiness.engine.certified)
  const attestationBound = requiredBoolean(readiness.engine.attestation_matches_build)
  const generationKnown = requiredBoolean(readiness.generation.known)
  const negativeAuthority = requiredBoolean(readiness.generation.negative_authority_permitted)
  const canApply = requiredBoolean(readiness.action.can_apply)
  const remediable = requiredBoolean(readiness.action.remediable)
  // can_issue_plan is TYPE-validated and deliberately NOT read as a veto: it
  // describes the ORDINARY plan path (it is false on the frozen fixture while
  // the server really did issue a signed break-glass plan), so an ordinary
  // false must never block an explicit signed override.
  const canIssuePlan = requiredBoolean(readiness.action.can_issue_plan)
  if (
    certified === null || attestationBound === null || generationKnown === null
    || negativeAuthority === null || canApply === null || remediable === null
    || canIssuePlan === null
  ) {
    return refuse(
      "READINESS_FACTS_MALFORMED",
      "A required readiness fact is absent or is not a boolean, so this package cannot be classified.",
    )
  }

  // The verbatim upstream failures, classified on their own because the
  // generation blocker does not represent them (see
  // OVERRIDABLE_READINESS_FAILURES).
  const unrecognisedFailures = generationFailures.filter(
    code => !OVERRIDABLE_READINESS_FAILURES.has(code),
  )
  if (unrecognisedFailures.length > 0) {
    return refuse(
      "READINESS_FAILURE_UNRECOGNISED",
      `The readiness report failed with ${unrecognisedFailures.join(", ")}, which this build will not treat as a mere evidence gap.`,
      unrecognisedFailures,
    )
  }

  // One partition over every code the package carries, from all three sections.
  const codes = Array.from(new Set([...engineBlockers, ...generationBlockers, ...actionBlockers]))
  const operational = codes.filter(code => OPERATIONAL_BLOCKERS.has(code))
  if (operational.length > 0) {
    return refuse(
      "OPERATIONAL_AUTHORITY_UNAVAILABLE",
      `The IAM write path is not operationally ready (${operational.join(", ")}). An override cannot satisfy this.`,
      operational,
    )
  }
  const integrityCodes = codes.filter(code => INTEGRITY_BLOCKERS.has(code))
  if (integrityCodes.length > 0) {
    return refuse(
      "INTEGRITY_HOLD",
      `Engine integrity is not established (${integrityCodes.join(", ")}). An override cannot satisfy this.`,
      integrityCodes,
    )
  }
  const unrecognised = codes.filter(code => !OVERRIDABLE_EVIDENCE_BLOCKERS.has(code))
  if (unrecognised.length > 0) {
    return refuse(
      "BLOCKER_UNRECOGNISED",
      `This build does not recognise ${unrecognised.join(", ")}, so it will not treat it as overridable.`,
      unrecognised,
    )
  }

  if (codes.length === 0 && generationFailures.length === 0) {
    // An empty blocker list is only credible alongside the positive authority
    // facts that would have produced it. Erased blockers beside
    // certified:false / known:false / negative_authority_permitted:false is an
    // inconsistent package, not a READY one -- and it is exactly the shape a
    // truncated or hand-edited payload takes.
    const coherentlyReady =
      certified && attestationBound && generationKnown && negativeAuthority
      && readiness.serve_state === "READY" && integrity.state === "READY"
    if (!coherentlyReady) {
      return refuse(
        "READINESS_FACTS_INCONSISTENT",
        "This package reports no readiness blockers while its own certification, generation or serve state does not support that, so it is not a usable answer.",
      )
    }
    return { kind: "no_hold", codes: [], expiresAtMs: expiresAt }
  }
  return {
    kind: "evidence_hold",
    expiresAtMs: expiresAt,
    codes: Array.from(new Set([...codes, ...generationFailures])),
    reason:
      integrity.reason
      ?? `Evidence readiness is incomplete (${[...codes, ...generationFailures].join(", ")}).`,
  }
}

/**
 * True when NOT_READY is the proxy's stale/timeout fallback, not "never
 * analyzed".
 *
 * Regression, 2026-09-02 (C1 / testbed-webshop, F2). This used to be a regex
 * over the reason text — /timed out|stale|last complete analysis|warming/ —
 * and the backend's readiness sentence "…remediation is not ready because
 * the active generation is unknown (PROJECTION_WATERMARK_STALE)." matched
 * "stale" inside the error code. A completed live analysis was titled "Live
 * analysis unavailable", which told the operator the backend was unreachable
 * or cached when it was neither. The stale serve is a proxy decision and the
 * proxy already stamps it (`fromStaleCache`); read the stamp, never the prose.
 */
export function isStaleServe(integrity: LPIntegrity): boolean {
  return integrity.servedFromStaleCache === true
}

/**
 * True when a backend reason ASSERTS the sweep finished.
 *
 * Pairing one of these with the "Analysis did not run" title contradicts it,
 * and that shipped: while the backend was restarting, the proxy served a stale
 * fallback with no `analysis_complete`, so `analysisComplete` derived to false
 * and the banner said all three of
 *
 *   title  "Analysis did not run"
 *   body   "Analysis complete; remediation is not ready because ..."
 *   footer "Remediation is unavailable until the analysis completes."
 *
 * A payload that reports a finished sweep in prose while withholding the
 * boolean is not evidence either way — it is an inconsistent payload, and the
 * honest banner says so rather than picking whichever half reads better.
 */
export function assertsAnalysisComplete(
  reason: string | null | undefined,
): boolean {
  if (!reason) return false
  return /analysis (is )?complete|analysis already ran/i.test(reason)
}

/** The payload contradicts itself: prose claims a finished sweep, the boolean
 *  does not confirm one. Neither half may be rendered as fact. */
export function hasInconsistentAnalysisState(integrity: LPIntegrity): boolean {
  return !integrity.analysisComplete && assertsAnalysisComplete(integrity.reason)
}

/** Footer under the banner title/body. Must not contradict them. */
export function lpIntegrityFooter(integrity: LPIntegrity): string | null {
  if (integrity.state === "READY") return null
  // Checked BEFORE analysisComplete: "until the analysis completes" asserts the
  // sweep has not finished, which contradicts a body reporting that it has.
  if (hasInconsistentAnalysisState(integrity)) {
    return "Counts and totals below are partial. Remediation stays blocked until a response with a confirmed analysis state is available."
  }
  if (integrity.analysisComplete) {
    // Must not name a cause. This said "until an authoritative generation is
    // active", which was false wherever a generation WAS active and some other
    // readiness check was the blocker — the banner body carries the real one.
    return "Analysis is complete, but remediation remains unavailable until the readiness blocker above is cleared."
  }
  return "Remediation is unavailable until the analysis completes. Counts and totals below are partial."
}

/**
 * Copy for the blocked-row callout.
 *
 * The queue counts every `BLOCK` decision, including ownership and other
 * non-evidence reasons. When analysis already ran, do not invent an
 * observation-gap explanation from that count.
 */
export function lpEvidenceGapCopy(integrity: LPIntegrity): {
  title: string
  body: string
} {
  if (integrity.analysisComplete) {
    return {
      title: "Some resources are also blocked",
      body:
        "Analysis already ran. A system-level readiness blocker applies — the banner above names it. Individual resources may have additional blockers; review the reason shown on each row.",
    }
  }
  return {
    title: "These resources don't have enough observation data to analyse",
    body:
      "Cyntro decides what can change from observed traffic and API calls. When VPC Flow Logs, S3 Data Events, or CloudTrail Data Events are missing for a resource, it stays in this queue as Blocked instead of being hidden or treated as safe.",
  }
}

/** Copy for the banner. Kept here so every surface says the same thing. */
export function lpIntegrityCopy(integrity: LPIntegrity): {
  title: string
  body: string
} {
  if (integrity.state === "NOT_READY") {
    // FIRST: a payload whose prose claims a finished sweep while the boolean
    // withholds one. Neither "did not run" nor "complete" may be stated, so
    // name the inconsistency instead of repeating either half.
    if (hasInconsistentAnalysisState(integrity)) {
      return {
        title: "Analysis state unavailable",
        body:
          "This response reports a completed analysis without confirming one — typically a cached reply served while the backend is restarting. Its counts are partial and remediation stays blocked. Reload once the backend is reachable.",
      }
    }
    // Stale-cache / timeout paths still show rows; "did not run" is a lie when
    // the proxy forced NOT_READY over a previous complete payload. Decided by
    // the proxy's typed stamp, never by words in the reason (F2).
    if (isStaleServe(integrity)) {
      return {
        title: "Live analysis unavailable",
        body:
          integrity.reason ??
          "Showing the last complete analysis. Remediation stays blocked until a fresh sweep succeeds.",
      }
    }
    if (integrity.analysisComplete) {
      return {
        title: "Remediation is not ready",
        body:
          integrity.reason ??
          // No cause here. The backend names the real blocker in `reason`; when
          // it is absent we do not know why, and the previous fallback asserted
          // "the active generation is unknown" — a specific, checkable claim
          // made from a missing field.
          "Analysis complete; remediation is not ready. The backend did not report which readiness check is blocking.",
      }
    }
    return {
      title: "Analysis did not run",
      body:
        integrity.reason ??
        "No analysis is available for this view. An empty list here does not mean there is nothing to fix.",
    }
  }
  const names = integrity.failedAnalyzers.filter((n) => n !== "graph_unavailable")
  return {
    title: "Incomplete analysis",
    body:
      integrity.reason ??
      `${names.length || "Some"} analyzer${names.length === 1 ? "" : "s"} did not finish${
        names.length ? ` (${names.join(", ")})` : ""
      }. Anything they would have flagged is missing from this list — absent, not cleared.`,
  }
}
