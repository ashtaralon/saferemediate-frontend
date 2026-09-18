/// <reference types="vitest/globals" />
/**
 * The public fetch boundary of lib/checkpoint-states.ts.
 *
 * A 200 is not a contract. The guard used to accept any object carrying
 * `integrity` and `before` and cast it, while both receipt consumers go on to
 * dereference `states.operation.removed_actions` and `states.after.verified`.
 * A partial 200 therefore passed the guard and crashed the Remediated row
 * instead of showing unknown.
 *
 * The success control is the ACTUAL producer body captured from
 * GET /api/snapshots/{id}/states -- see the fixture's `_provenance`. Only the
 * HTTP transport is doubled; `fetchCheckpointStates` runs as written.
 */
import { describe, expect, it } from "vitest"

import { fetchCheckpointStates, type CheckpointStates } from "@/lib/checkpoint-states"
import captured from "./__fixtures__/saved-checkpoint-states.json"

const REAL = captured.states as CheckpointStates
const SNAPSHOT = REAL.snapshot_id

function transport(body: unknown, status = 200) {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as unknown as Response) as unknown as typeof fetch
}

describe("fetchCheckpointStates at its public boundary", () => {
  it("accepts the actual producer body and returns its states", async () => {
    const answer = await fetchCheckpointStates(SNAPSHOT, transport(REAL))
    expect(answer.ok).toBe(true)
    if (!answer.ok) return
    // the fields the consumers dereference are present and usable
    expect(answer.states.operation.removed_actions).toHaveLength(5)
    expect(answer.states.after.verified).toBe(true)
    expect(answer.states.integrity).toBe("VERIFIED")
    expect(answer.states.snapshot_id).toBe(SNAPSHOT)
  })

  it.each([
    ["a body with no operation", (() => { const { operation, ...rest } = REAL as any; return rest })()],
    ["a body with no after", (() => { const { after, ...rest } = REAL as any; return rest })()],
    ["a null before", { ...(REAL as any), before: null }],
    ["a null operation", { ...(REAL as any), operation: null }],
    ["removed_actions that is not an array", {
      ...(REAL as any), operation: { ...(REAL as any).operation, removed_actions: "five" },
    }],
    ["a non-boolean after.verified", {
      ...(REAL as any), after: { ...(REAL as any).after, verified: "true" },
    }],
    ["integrity that contradicts the verified flags", { ...(REAL as any), integrity: "UNVERIFIABLE" }],
    ["a verified after state with no documents", {
      ...(REAL as any), after: { ...(REAL as any).after, inline_policies: null },
    }],
    ["an empty object", {}],
    ["an array", []],
    ["a string", "VERIFIED"],
  ])("refuses %s with the typed failure and never a count", async (_label, body) => {
    const answer = await fetchCheckpointStates(SNAPSHOT, transport(body))
    expect(answer.ok).toBe(false)
    if (answer.ok) return
    expect(answer.failure.message).toBe("The saved state response was not in the expected form.")
    expect(answer.failure.status).toBe(200)
    // nothing is inferred: no states object reaches a consumer that would then
    // dereference a field this body does not have
    expect("states" in answer).toBe(false)
  })

  it("refuses a well-formed body that answers for another snapshot", async () => {
    const other = { ...(REAL as any), snapshot_id: "IAMRole-fixture-web-role-99999999" }
    const answer = await fetchCheckpointStates(SNAPSHOT, transport(other))
    expect(answer.ok).toBe(false)
    if (!answer.ok) {
      expect(answer.failure.message).toBe("The saved state response was not in the expected form.")
    }
  })

  it("still reports a non-200 through the existing failure path", async () => {
    const answer = await fetchCheckpointStates(SNAPSHOT, transport({ detail: "nope" }, 503))
    expect(answer.ok).toBe(false)
    if (!answer.ok) expect(answer.failure.status).toBe(503)
  })

  it("accepts the producer's BEFORE_ONLY shape, which consumers render as unknown", async () => {
    const beforeOnly = {
      ...(REAL as any), integrity: "BEFORE_ONLY",
      after: { ...(REAL as any).after, verified: false, reason: "AFTER_HASH_MISMATCH", inline_policies: null },
    }
    const answer = await fetchCheckpointStates(SNAPSHOT, transport(beforeOnly))
    // a genuine, self-consistent refusal shape must pass the boundary so the UI
    // can show unknown -- refusing it here would hide the producer's own answer
    expect(answer.ok).toBe(true)
    if (answer.ok) expect(answer.states.after.verified).toBe(false)
  })

  /**
   * The History drilldown mounted by this candidate dereferences fields the receipt never read,
   * and the controls above do not cover any of them. Each case below names the consumer site that
   * breaks if the body is accepted, so none of them is a shape assertion for its own sake:
   *
   *   components/remediation-timeline.tsx:960   Checkpoint {states.checkpoint.status}
   *   components/remediation-timeline.tsx:961   describeCheckpointVersion(states)  -> destructures states.checkpoint
   *   components/remediation-timeline.tsx:962   operation {operation_id} ({state}, record v{record_version})
   *   components/remediation-timeline.tsx:963   {states.scope.resource_arn}
   *   lib/checkpoint-states.ts:65 short(...)    -> .slice on both policy_set_hash_recomputed values
   *
   * `status` and `resource_arn` are rendered DIRECTLY as React children, so a non-string is not a
   * cosmetic problem: an object there throws "Objects are not valid as a React child". The `??`
   * fallbacks on the operation line cover null, never a wrong type.
   */
  it.each([
    // scope: absent object throws on property access; wrong type throws on render
    ["no scope at all", (() => { const { scope, ...rest } = REAL as any; return rest })()],
    ["a null scope", { ...(REAL as any), scope: null }],
    ["a scope.resource_arn that is an object", {
      ...(REAL as any), scope: { ...(REAL as any).scope, resource_arn: { arn: "x" } },
    }],
    ["a missing scope.resource_arn", (() => {
      const { resource_arn, ...scope } = (REAL as any).scope; return { ...(REAL as any), scope }
    })()],
    // checkpoint: describeCheckpointVersion destructures it unconditionally
    ["no checkpoint at all", (() => { const { checkpoint, ...rest } = REAL as any; return rest })()],
    ["a null checkpoint", { ...(REAL as any), checkpoint: null }],
    ["a checkpoint.status that is an object", {
      ...(REAL as any), checkpoint: { ...(REAL as any).checkpoint, status: { code: "CREATED" } },
    }],
    ["a missing checkpoint.status", (() => {
      const { status, ...checkpoint } = (REAL as any).checkpoint
      return { ...(REAL as any), checkpoint }
    })()],
    ["a checkpoint.before_state_source outside the producer's vocabulary", {
      ...(REAL as any), checkpoint: { ...(REAL as any).checkpoint, before_state_source: "somewhere_else" },
    }],
    ["a numeric checkpoint.s3_version_id_observed", {
      ...(REAL as any), checkpoint: { ...(REAL as any).checkpoint, s3_version_id_observed: 1 },
    }],
    ["an ABSENT checkpoint.s3_version_id_observed (missing, not null)", (() => {
      const { s3_version_id_observed, ...checkpoint } = (REAL as any).checkpoint
      return { ...(REAL as any), checkpoint }
    })()],
    // operation identity and version: rendered on the same line
    ["an operation.operation_id that is an object", {
      ...(REAL as any), operation: { ...(REAL as any).operation, operation_id: { id: "op" } },
    }],
    ["an operation.state that is an object", {
      ...(REAL as any), operation: { ...(REAL as any).operation, state: { s: "VERIFIED" } },
    }],
    ["an operation.record_version that is an object", {
      ...(REAL as any), operation: { ...(REAL as any).operation, record_version: { v: 2 } },
    }],
    // hashes: short() slices them
    ["a numeric before.policy_set_hash_recomputed", {
      ...(REAL as any), before: { ...(REAL as any).before, policy_set_hash_recomputed: 12345 },
    }],
    ["a numeric after.policy_set_hash_recomputed", {
      ...(REAL as any), after: { ...(REAL as any).after, policy_set_hash_recomputed: 12345 },
    }],
  ])("refuses %s, which the History drilldown would dereference", async (_label, body) => {
    const answer = await fetchCheckpointStates(SNAPSHOT, transport(body))
    expect(answer.ok).toBe(false)
    if (answer.ok) return
    expect(answer.failure.message).toBe("The saved state response was not in the expected form.")
    expect(answer.failure.status).toBe(200)
    expect("states" in answer).toBe(false)
  })

  it("still accepts a checkpoint-row before state, where the producer reports no S3 version", async () => {
    // The guard must not have become stricter than the producer. This is the ONE nullable the
    // producer can emit alongside a VERIFIED body: `get_snapshot_states` takes the
    // `elif "before_state" in item` branch, sets before_state_source="checkpoint_row" and leaves
    // version_id None, while the policy-set hashes still come from the stored state.
    //
    // An earlier version of this control also nulled BOTH policy_set_hash_recomputed values and
    // the whole operation identity while keeping integrity VERIFIED and both verified flags true.
    // That body is impossible: a verified before requires
    // `recomputed_before == checkpoint_hash == pre_image_hash`, so a null recomputed hash and
    // verified:true cannot co-occur, and a 200 is only reached once a forward operation resolved.
    // Asserting the guard accepts it would have forced the guard to accept a self-contradictory
    // body no producer emits. Removed rather than weakened; the null-hash case is genuine only
    // with verified:false, which the BEFORE_ONLY control above already covers.
    const checkpointRow = {
      ...(REAL as any),
      checkpoint: { ...(REAL as any).checkpoint, s3_version_id_observed: null, before_state_source: "checkpoint_row" },
    }
    const answer = await fetchCheckpointStates(SNAPSHOT, transport(checkpointRow))
    expect(answer.ok).toBe(true)
    if (!answer.ok) return
    expect(answer.states.checkpoint.before_state_source).toBe("checkpoint_row")
    expect(answer.states.checkpoint.s3_version_id_observed).toBeNull()
    // the real captured values are untouched, so this stays a producer-shaped body
    expect(answer.states.before.policy_set_hash_recomputed).toBe((REAL as any).before.policy_set_hash_recomputed)
    expect(answer.states.integrity).toBe("VERIFIED")
  })
})
