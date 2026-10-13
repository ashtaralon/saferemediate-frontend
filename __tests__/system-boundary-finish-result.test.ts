/**
 * Onboarding S1a R7: a finished setup's result accounts (``result_scope``, read exactly) and the same-generation pairing of
 * Applied and the result (lib/system-boundary-finish-result.ts) -- over the REAL answers: the setup captures
 * (__tests__/fixtures/system-boundary-setup-captures-v4/, -preview-captures/) and the Applied / result captures
 * (__tests__/fixtures/system-boundary-captures/: applied generation 41 and result generation 41 of one account and System).
 * An edit of a capture is said where it is made.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { parseAppliedResponse } from "@/lib/system-boundary-applied"
import { pairing, pairingSentence } from "@/lib/system-boundary-finish-result"
import { parseResultResponse } from "@/lib/system-boundary-result"
import { isResultScope, isStatus, isView } from "@/lib/system-boundary-setup"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (dir: string, name: string): any => JSON.parse(readFileSync(path.join(__dirname, "fixtures", dir, `${name}.json`), "utf8"))
const APPLIED = json("system-boundary-captures", "applied")
const RESULT = json("system-boundary-captures", "result")
const ACCOUNT = RESULT.body.account_id
const SYSTEM = RESULT.body.system_key
const applied = (body = APPLIED.body) => parseAppliedResponse(APPLIED.status, body)
const result = (body = RESULT.body) => parseResultResponse(RESULT.status, body, ACCOUNT)
const at = (completedRevision: number, systemKey = SYSTEM) => ({ accountId: ACCOUNT, systemKey, completedRevision })

describe("this Finish's applied result: all four conditions, never fewer", () => {
  it("the real Applied (applied_known, revision 1, generation 41) and result (served, generation 41) pair for revision 1", () => {
    expect(APPLIED.body.generation).toBe(RESULT.body.generation)
    const p = pairing(applied(), result(), at(APPLIED.body.applied_revision))
    expect(p).toEqual({ kind: "applied_result", generation: 41 })
    expect(pairingSentence(p)).toBe("This Finish's applied result -- membership generation 41.")
  })

  it("an Applied built before this Finish is updating, as of the result's generation", () => {
    expect(pairing(applied(), result(), at(APPLIED.body.applied_revision + 1)))
      .toEqual({ kind: "updating", asOf: 41, why: "APPLIED_BEFORE_THIS_FINISH" })
  })

  it("a result of another generation than Applied's is never called applied (old result / new Applied, either order)", () => {
    const older = { ...structuredClone(RESULT.body), generation: 40 }   // an edit: the result read before the publication
    const p = pairing(applied(), result(older), at(1))
    expect(p).toEqual({ kind: "updating", asOf: 40, why: "GENERATION_MISMATCH" })
    expect(pairingSentence(p)).toContain("as of generation 40")
    const newer = { ...structuredClone(APPLIED.body), generation: 42 }  // an edit: Applied read after the next publication
    expect(pairing(applied(newer), result(), at(1)).kind).toBe("updating")
  })

  it("not applied yet, a held result, or another System is updating -- never applied", () => {
    const notYet = json("system-boundary-captures", "applied_not_applied_yet")
    expect(pairing(parseAppliedResponse(notYet.status, notYet.body), result(), at(1)))
      .toEqual({ kind: "updating", asOf: 41, why: "NOT_APPLIED" })
    const held = json("system-boundary-captures", "result_v1_held")
    expect(pairing(applied(), parseResultResponse(held.status, held.body, ACCOUNT), at(1)))
      .toEqual({ kind: "updating", asOf: 41, why: "RESULT_NOT_SERVED" })
    expect(pairing(applied(), result(), at(1, `${SYSTEM}x`))).toMatchObject({ kind: "updating", why: "RESULT_NOT_SERVED" })
  })
})

describe("result_scope is read exactly, and a finished view must carry it", () => {
  const finished = json("system-boundary-setup-preview-captures", "read_finished").body
  it("the real finished read and status carry SERVED with the pinned Deployment; a draft carries null", () => {
    expect(isResultScope(finished.result_scope)).toBe(true)
    expect(finished.result_scope.from).toEqual({ key: finished.receipt.association.deployments[0].key,
                                                 version: finished.receipt.association.deployments[0].version })
    expect(isStatus(json("system-boundary-setup-preview-captures", "status").body)).toBe(true)
    expect(json("system-boundary-setup-preview-captures", "read_draft").body.result_scope).toBeNull()
    expect(isView(json("system-boundary-setup-preview-captures", "read_draft").body)).toBe(true)
  })

  it("a finished view without it, or with null, or with a malformed one, is not read", () => {
    const { result_scope: _gone, ...without } = structuredClone(finished)
    expect(isView(without)).toBe(false)
    expect(isView({ ...structuredClone(finished), result_scope: null })).toBe(false)
    for (const bad of [{ ...finished.result_scope, accounts: ["2", "1"] }, { ...finished.result_scope, extra: 1 },
                       { ...finished.result_scope, accounts: ["12345"] }, { ...finished.result_scope, v: 2 },
                       { v: 1, state: "UNAVAILABLE", reason: "" }]) {
      expect(isResultScope(bad), JSON.stringify(bad)).toBe(false)
    }
    expect(isResultScope({ v: 1, state: "UNAVAILABLE", reason: "DEPLOYMENT_HISTORY_MISSING", from: finished.result_scope.from })).toBe(true)
    expect(isView({ ...structuredClone(finished), result_scope: { v: 1, state: "UNAVAILABLE", reason: "DEPLOYMENT_HISTORY_MISSING" } })).toBe(true)
  })
})
