import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(__dirname, "..", "..", "components", "iam-permission-analysis-modal.tsx"),
  "utf8",
)

describe("IAM authority hold", () => {
  it("shows a high-contrast hold with a controlled override action", () => {
    expect(source).toContain('data-testid="iam-authority-hold"')
    expect(source).toContain("bg-orange-950")
    expect(source).toContain("warnPerms.length > 0")
    expect(source).toContain("Operator override is available")
    expect(source).toContain("it will not lock you out")
    expect(source).toContain("Remediate Anyway")
    expect(source).toContain("handlePrepareBreakGlass")
  })

  it("keeps normal approval gated, permits a signed break-glass override of policy and evidence holds, and never of an environment hold", () => {
    expect(source).toMatch(/handleIAMLpRequestApproval[\s\S]*?if \(authorityHoldReason\)/)
    expect(source).toMatch(/handleIAMLpApproveRequest[\s\S]*?if \(authorityHoldReason\)/)
    expect(source).toMatch(/handleIAMLpExecuteApprovedRequest[\s\S]*?if \(applyDisabled \|\| authorityHoldReason\)/)

    // The ENVIRONMENT / ACTIVATION hold refuses every caller, break-glass included. `applyDisabled` means the
    // mutation boundary is not shipped or not enabled here, so no rationale, acknowledgement or signed plan can
    // satisfy it. This assertion previously required the opposite -- `applyDisabled && !isBreakGlassSubmission`
    // -- which let a completed break-glass form reach submission while the environment still forbade execution
    // (observed in independent Chrome QA on the frozen 3481 candidate). It also contradicted the
    // `handleIAMLpExecuteApprovedRequest` guard asserted directly above, which has always been unconditional.
    expect(source).not.toMatch(/applyDisabled && !isBreakGlassSubmission/)
    expect(source).toMatch(/if \(applyDisabled\) \{/)

    // The authorized break-glass design is preserved for the holds it is actually for: a BLOCK/EXCLUDE policy
    // verdict and an evidence gap both remain overridable with recorded lineage.
    expect(source).toMatch(/remediationAuthority\.hardBlocked && !isBreakGlassSubmission/)
    expect(source).toMatch(/remediationAuthority\.evidenceUnavailable && !isBreakGlassSubmission/)

    // The final confirmation is guarded by the single exported composition, so the precedence rule exists once.
    expect(source).toMatch(/confirmGuard=\{composeOverrideConfirmGuard\(\{/)
    expect(source).toMatch(/export function composeOverrideConfirmGuard/)
  })
})

// ── the explicit signed operator-override classification ─────────────────────
//
// Driven by the EXACT producer serialization captured from one real
// GET /api/least-privilege/issues on the frozen fixture pair
// (__fixtures__/lp-issues-readiness.json): schema canonical-readiness/v1,
// serve_state NOT_READY, analysis_complete true, engine blockers
// [BUILD_SHA_UNKNOWN, ENGINE_NOT_CERTIFIED], generation blockers
// [ACTIVE_GENERATION_UNKNOWN, TRAFFIC_INGEST_NOT_INCREMENTAL,
// NEGATIVE_AUTHORITY_NOT_PERMITTED, DECISION_READINESS_NOT_READY],
// action blockers [ACTIVE_GENERATION_UNKNOWN, NO_UNUSED_CANDIDATE,
// GENERATION_REFUSES_NEGATIVE_AUTHORITY]. Not a hand-written object.

// The captured file now carries the WHOLE producer bundle the mounted
// composition needs (issues + gap analysis + simulate-fix + signed plan),
// so the `/issues` body these unit controls read is its `issues` member.
import capturedBundle from './__fixtures__/lp-issues-readiness.json'

const realPayload = (capturedBundle as any).issues
import {
  classifySignedOverrideReadiness,
  deriveLPIntegrity,
  type CanonicalReadinessWire,
} from '@/lib/lp-integrity'

const FRESH = () => {
  // The captured package carries its own 30s window; classify AS OF its probe.
  const probed = Date.parse((realPayload as any).readiness.probed_at)
  return new Date(probed + 1000)
}

function classify(overrides: Partial<CanonicalReadinessWire> = {}, payloadOverrides: any = {}, now = FRESH()) {
  const payload = { ...(realPayload as any), ...payloadOverrides }
  const readiness = { ...(payload.readiness as CanonicalReadinessWire), ...overrides }
  return classifySignedOverrideReadiness({
    readiness,
    integrity: deriveLPIntegrity(payload),
    payload,
    now,
  })
}

describe('classifySignedOverrideReadiness, against the real producer payload', () => {
  it('treats the real frozen package as a named evidence hold an override may pass', () => {
    const result = classify()
    expect(result.kind).toBe('evidence_hold')
    if (result.kind !== 'evidence_hold') return
    // Every code the real producer emitted, and nothing invented.
    expect(result.codes).toContain('ACTIVE_GENERATION_UNKNOWN')
    expect(result.codes).toContain('BUILD_SHA_UNKNOWN')
    expect(result.codes).toContain('NO_UNUSED_CANDIDATE')
    expect(result.codes).toContain('GENERATION_REFUSES_NEGATIVE_AUTHORITY')
    // The operator still sees the backend's own named reason.
    expect(result.reason).toContain('active generation is unknown')
  })

  it('still reports mutationBlocked, so ordinary Apply stays held on the same payload', () => {
    const integrity = deriveLPIntegrity(realPayload as any)
    expect(integrity.state).toBe('NOT_READY')
    expect(integrity.mutationBlocked).toBe(true)
  })

  it('refuses the SAME package once its 30-second window has passed', () => {
    const probed = Date.parse((realPayload as any).readiness.probed_at)
    const result = classify({}, {}, new Date(probed + 31_000))
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('READINESS_EXPIRED')
  })

  it.each([
    ['IAM_MUTATION_NOT_DECLARED'],
    ['WEB_GRAPH_READ_ONLY_BOUNDARY_UNPROVEN'],
    ['TENANT_LIFECYCLE_STATE_NOT_READY'],
    ['RELEASE_TIER_REFUSES_MUTATION'],
    ['SIGNED_PLAN_REQUIRED'],
    ['REMEDIATION_ASSUME_ROLE_DISABLED'],
    ['CUSTOMER_REMEDIATOR_NOT_CONFIGURED'],
  ])('refuses when action.blockers carries the operational code %s', code => {
    const action = { ...(realPayload as any).readiness.action }
    action.blockers = [...action.blockers, code]
    const result = classify({ action })
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') {
      expect(result.code).toBe('OPERATIONAL_AUTHORITY_UNAVAILABLE')
      expect(result.codes).toContain(code)
    }
  })

  it.each([
    ['ATTESTATION_VERIFICATION_FAILED'],
    ['ATTESTATION_NOT_BOUND_TO_BUILD'],
    ['ENGINE_CERTIFICATION_UNAVAILABLE'],
  ])('refuses on the integrity code %s', code => {
    const engine = { ...(realPayload as any).readiness.engine }
    engine.blockers = [...engine.blockers, code]
    const result = classify({ engine })
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('INTEGRITY_HOLD')
  })

  it('refuses a blocker code this build does not recognise', () => {
    const generation = { ...(realPayload as any).readiness.generation }
    generation.blockers = [...generation.blockers, 'SOME_FUTURE_BLOCKER']
    const result = classify({ generation })
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') {
      expect(result.code).toBe('BLOCKER_UNRECOGNISED')
      expect(result.codes).toEqual(['SOME_FUTURE_BLOCKER'])
    }
  })

  it.each([
    ['an absent package', undefined, 'READINESS_PACKAGE_ABSENT'],
    ['a foreign schema', { schema: 'canonical-readiness/v2' }, 'READINESS_SCHEMA_UNKNOWN'],
    ['a missing action section', { action: undefined }, 'READINESS_PACKAGE_MALFORMED'],
    ['an unparseable expiry', { expires_at: 'not-a-date' }, 'READINESS_EXPIRY_UNREADABLE'],
    ['an unknown serve state', { serve_state: 'MAYBE' }, 'SERVE_STATE_UNKNOWN'],
    ['blockers that are not an array', { action: { blockers: 'ACTIVE_GENERATION_UNKNOWN' } }, 'READINESS_BLOCKERS_MALFORMED'],
    ['a blocker array holding a non-string', { action: { blockers: ['ACTIVE_GENERATION_UNKNOWN', 7] } }, 'READINESS_BLOCKERS_MALFORMED'],
  ])('refuses %s', (_label, overrides, expected) => {
    const result = overrides === undefined
      ? classifySignedOverrideReadiness({
          readiness: undefined,
          integrity: deriveLPIntegrity(realPayload as any),
          payload: realPayload as any,
          now: FRESH(),
        })
      : classify(overrides as Partial<CanonicalReadinessWire>)
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe(expected)
  })

  it('refuses when the sweep is not confirmed complete', () => {
    const result = classify({ analysis_complete: false })
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('ANALYSIS_NOT_COMPLETE')
  })

  it('refuses a stale-proxy serve, read from the typed stamp and not the prose', () => {
    const result = classify({}, { fromStaleCache: true })
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('READINESS_STALE_SERVE')
  })

  it.each([
    ['failedAnalyzers', { failedAnalyzers: ['iam_usage'] }],
    ['failed_analyzers', { failed_analyzers: ['iam_usage'] }],
  ])('refuses when a failed analyzer arrives through the %s alias', (_alias, payloadOverrides) => {
    const result = classify({}, payloadOverrides)
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('ANALYZER_FAILED')
  })

  it('reports no hold only for a CONSISTENT ready package', () => {
    // Erasing blockers is not enough: the authority facts that would have
    // produced an empty list must also hold, and the outer payload must agree.
    const result = classify(
      {
        serve_state: 'READY',
        engine: {
          certified: true, attestation_matches_build: true,
          build_sha: 'a'.repeat(40), blockers: [],
        },
        generation: {
          ...(realPayload as any).readiness.generation,
          known: true, active_generation_id: 'gen-1',
          negative_authority_permitted: true, coverage_state: 'COMPLETE',
          blockers: [], readiness_failures: [],
        },
        action: {
          can_issue_plan: true, can_apply: true, remediable: true, blockers: [],
        },
      },
      { serve_state: 'READY', integrityReason: null },
    )
    expect(result.kind).toBe('no_hold')
  })

  it('refuses an empty blocker list that its own authority facts do not support', () => {
    // Gap 4: blockers erased, certification/generation still false, outer
    // payload still NOT_READY. That is a truncated or edited payload, not READY.
    const result = classify({
      serve_state: 'READY',
      engine: { ...(realPayload as any).readiness.engine, blockers: [] },
      generation: {
        ...(realPayload as any).readiness.generation,
        blockers: [], readiness_failures: [],
      },
      action: { ...(realPayload as any).readiness.action, blockers: [] },
    })
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('READINESS_FACTS_INCONSISTENT')
  })

  it.each([
    ['engine', 'blockers'],
    ['generation', 'blockers'],
    ['generation', 'readiness_failures'],
    ['action', 'blockers'],
  ])('refuses when the required %s.%s array is absent', (section, field) => {
    const patched = { ...(realPayload as any).readiness[section] }
    delete patched[field]
    const result = classify({ [section]: patched } as any)
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('READINESS_BLOCKERS_MALFORMED')
  })

  it.each([
    ['engine', 'blockers'],
    ['generation', 'readiness_failures'],
    ['action', 'blockers'],
  ])('refuses when the required %s.%s array is null', (section, field) => {
    const patched = { ...(realPayload as any).readiness[section], [field]: null }
    const result = classify({ [section]: patched } as any)
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('READINESS_BLOCKERS_MALFORMED')
  })

  it.each([
    ['engine.certified', 'engine', 'certified'],
    ['engine.attestation_matches_build', 'engine', 'attestation_matches_build'],
    ['generation.known', 'generation', 'known'],
    ['generation.negative_authority_permitted', 'generation', 'negative_authority_permitted'],
    ['action.can_apply', 'action', 'can_apply'],
    ['action.remediable', 'action', 'remediable'],
  ])('refuses when the required boolean %s is absent', (_label, section, field) => {
    const patched = { ...(realPayload as any).readiness[section] }
    delete patched[field]
    const result = classify({ [section]: patched } as any)
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('READINESS_FACTS_MALFORMED')
  })

  it('refuses INTEGRITY_HELD with no explicit blocker code present', () => {
    const result = classify({
      serve_state: 'INTEGRITY_HELD',
      engine: { ...(realPayload as any).readiness.engine, blockers: [] },
      generation: {
        ...(realPayload as any).readiness.generation,
        blockers: [], readiness_failures: [],
      },
      action: { ...(realPayload as any).readiness.action, blockers: [] },
    })
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('INTEGRITY_HELD')
  })

  it('refuses when the DERIVED LP state is integrity-held even if nested says otherwise', () => {
    const result = classify({}, { serve_state: 'INTEGRITY_HELD' })
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('INTEGRITY_HELD')
  })

  it('refuses an outer analysis_complete:false beside a nested true', () => {
    const result = classify({}, { analysis_complete: false })
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('OUTER_ANALYSIS_NOT_COMPLETE')
  })

  it('refuses a package whose expiry is at or before its probe time', () => {
    const probed = (realPayload as any).readiness.probed_at
    const result = classify({ probed_at: probed, expires_at: probed })
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('READINESS_WINDOW_INVALID')
  })

  it('refuses an unreadable probe time even when the expiry parses', () => {
    const result = classify({ probed_at: 'not-a-date' })
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('READINESS_EXPIRY_UNREADABLE')
  })

  it('keeps READINESS_CACHE_EMPTY as a named evidence gap, not a discarded fact', () => {
    const result = classify()
    expect(result.kind).toBe('evidence_hold')
    if (result.kind === 'evidence_hold') {
      // Gap 3: the verbatim upstream failure now reaches the classification.
      expect(result.codes).toContain('READINESS_CACHE_EMPTY')
    }
  })

  it.each([
    ['SNAPSHOT_ROOT_HASH_MISMATCH'],
    ['SNAPSHOT_SHARD_ATTESTATION_FAILED'],
    ['DDB_PROJECTION_METADATA_MISMATCH'],
    ['NEO4J_ACTIVE_POINTER_INVALID'],
    ['SOME_FUTURE_FAILURE'],
  ])('refuses the readiness failure %s instead of ignoring it', code => {
    const generation = { ...(realPayload as any).readiness.generation }
    generation.readiness_failures = [...generation.readiness_failures, code]
    const result = classify({ generation })
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') {
      expect(result.code).toBe('READINESS_FAILURE_UNRECOGNISED')
      expect(result.codes).toContain(code)
    }
  })

  it.each([
    ['absent', {}],
    ['null', { serve_state: null }],
    ['unrecognised', { serve_state: 'PROBABLY_FINE' }],
  ])('refuses an outer serve_state that is %s, distinct from a backend NOT_READY', (_label, patch) => {
    const payload: any = { ...(realPayload as any), ...patch }
    if (_label === 'absent') delete payload.serve_state
    const result = classifySignedOverrideReadiness({
      readiness: (realPayload as any).readiness,
      integrity: deriveLPIntegrity(payload),
      payload,
      now: FRESH(),
    })
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('OUTER_SERVE_STATE_UNKNOWN')
    // The derived state alone could NOT have told these apart.
    expect(deriveLPIntegrity(payload).state).toBe('NOT_READY')
  })

  it('still accepts a genuine outer NOT_READY beside the same derived state', () => {
    expect(deriveLPIntegrity(realPayload as any).state).toBe('NOT_READY')
    expect(classify().kind).toBe('evidence_hold')
  })

  it('refuses when the outer payload itself is absent', () => {
    const result = classifySignedOverrideReadiness({
      readiness: (realPayload as any).readiness,
      integrity: deriveLPIntegrity(null),
      payload: null,
      now: FRESH(),
    })
    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') expect(result.code).toBe('OUTER_PAYLOAD_ABSENT')
  })

  it('type-validates can_issue_plan but never vetoes on its ordinary false', () => {
    // The frozen producer really does carry can_issue_plan:false while the
    // server issues a signed break-glass plan, so false must stay passable.
    expect((realPayload as any).readiness.action.can_issue_plan).toBe(false)
    expect(classify().kind).toBe('evidence_hold')

    const action = { ...(realPayload as any).readiness.action }
    delete action.can_issue_plan
    const missing = classify({ action })
    expect(missing.kind).toBe('refused')
    if (missing.kind === 'refused') expect(missing.code).toBe('READINESS_FACTS_MALFORMED')
  })
})