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
})
