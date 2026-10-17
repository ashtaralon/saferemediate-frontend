/**
 * (PC1 S0-F) The Resource-boundaries step in the plan's words (owned / used / shared / unresolved) over the server's four lists,
 * with "shared" counted ONLY by the server's ``not_member_reasons`` (backend PC1 S0-F).
 *
 * Inputs: the backend's own captures (system-boundary-setup-preview-captures-v5 and system-boundary-result-captures-v2,
 * regenerated at saferemediate-backend e593baec), one level-1 result capture that predates the field, and -- for the shared
 * case no capture contains -- labelled TEST_ONLY variants of a real capture whose classes are recounted so they still add up
 * to its own not-member count (or deliberately do not, for the malformed cases).
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ResultLists } from "@/components/system-boundary/system-result"
import {
  BOUNDARY_TITLES,
  boundarySummary,
  readShared,
  sharedSentence,
} from "@/lib/system-boundary-boundary-words"
import { parseResultResponse } from "@/lib/system-boundary-result"
import { parsePreview, previewSentence } from "@/lib/system-boundary-setup-preview"

type Capture = { status: number; body: any }   // eslint-disable-line @typescript-eslint/no-explicit-any
const capture = (dir: string, name: string): Capture =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", dir, `${name}.json`), "utf8"))
const PREVIEW = () => capture("system-boundary-setup-preview-captures-v5", "preview")
const RESULT_V2 = () => capture("system-boundary-result-captures-v2", "served_without_context")
const RESULT_V1 = () => capture("system-boundary-captures", "result")

describe("the closed class count, read into three states", () => {
  const exact = { SHARED_FOUNDATION: 2, SHARED_CLUSTER: 1, EXCLUDED_BY_DECISION: 0, OTHER: 1 }
  const reported = (reasons: typeof exact) => ({ state: "reported" as const, reasons })

  it("absent or null is NOT REPORTED; an exact set adding up to the not-member count is REPORTED", () => {
    expect(readShared(undefined, 4)).toEqual({ state: "not_reported" })
    expect(readShared(null, 4)).toEqual({ state: "not_reported" })
    expect(readShared(exact, 4)).toEqual(reported(exact))
  })

  it("(F2) anything else is INCONSISTENT -- a missing or extra class, a non-count, or classes that do not add up", () => {
    const { OTHER: _drop, ...missing } = exact
    for (const bad of [missing, { ...exact, SHARED_VPC: 0 }, { ...exact, OTHER: -1 }, { ...exact, OTHER: 1.5 },
                       { ...exact, OTHER: "1" }, [], "x"]) {
      expect(readShared(bad, 4), JSON.stringify(bad)).toEqual({ state: "inconsistent" })
    }
    expect(readShared(exact, 5)).toEqual({ state: "inconsistent" })        // 4 counted, 5 not-members
  })

  it("the words: shared from the server's count; not reported; or not shown when it does not add up -- never a number then", () => {
    expect(sharedSentence(reported(exact))).toBe(
      "Shared: 3 -- 2 shared foundation, 1 shared cluster: by design a member of no single system.")
    expect(sharedSentence(reported({ ...exact, EXCLUDED_BY_DECISION: 1, OTHER: 0 }))).toContain("1 excluded by a person's decision.")
    expect(sharedSentence({ state: "not_reported" })).toContain("not reported")
    expect(sharedSentence({ state: "inconsistent" })).toContain("do not add up")
    for (const read of [{ state: "not_reported" as const }, { state: "inconsistent" as const }]) {
      expect(sharedSentence(read), read.state).not.toMatch(/\d/)          // no shared number at all
    }
    const counts = { members: 3, stale_members: 1, dependencies: 2, held: 1, not_members: 4 }
    expect(boundarySummary(counts, reported(exact))).toBe(
      "3 owned (1 last seen), 2 used, 1 unresolved, 4 not part of this system (3 of them shared)")
    expect(boundarySummary(counts, { state: "not_reported" })).toBe(
      "3 owned (1 last seen), 2 used, 1 unresolved, 4 not part of this system (shared not reported)")
    expect(boundarySummary(counts, { state: "inconsistent" })).toBe(
      "3 owned (1 last seen), 2 used, 1 unresolved, 4 not part of this system (shared not shown: its counts do not add up)")
  })
})

describe("the backend's own preview answer", () => {
  it("carries the draft-wide and each account's classes, and the preview sentence says them in the plan's words", () => {
    const answer = PREVIEW()
    const read = parsePreview(answer.status, answer.body)
    expect(read.kind).toBe("OK")
    if (read.kind !== "OK") return
    expect(read.value.shared).toEqual({ state: "reported", reasons: answer.body.not_member_reasons })
    expect(read.value.shared).toEqual({ state: "reported",
                                        reasons: { SHARED_FOUNDATION: 0, SHARED_CLUSTER: 0, EXCLUDED_BY_DECISION: 2, OTHER: 0 } })
    expect(read.value.accounts[0].display?.shared).toEqual({ state: "reported", reasons: answer.body.accounts[0].display.not_member_reasons })
    const sentence = previewSentence(read)
    expect(sentence).toContain(`${answer.body.counts.members} owned`)
    expect(sentence).toContain(`${answer.body.counts.not_members} not part of this system (0 of them shared)`)
    expect(sentence).not.toMatch(/not a member|dependenc/)
  })

  it("an answer from before the field says shared is not reported; (F2) one whose classes do not add up is still read", () => {
    const before = PREVIEW()
    delete before.body.not_member_reasons
    delete before.body.accounts[0].display.not_member_reasons
    const read = parsePreview(before.status, before.body)
    expect(read.kind === "OK" && read.value.shared).toEqual({ state: "not_reported" })
    expect(read.kind === "OK" && read.value.accounts[0].display?.shared).toEqual({ state: "not_reported" })
    expect(previewSentence(read)).toContain("(shared not reported)")
    for (const where of ["top", "account"] as const) {
      const bad = PREVIEW()                                                  // TEST_ONLY: classes that do not add up
      const target = where === "top" ? bad.body : bad.body.accounts[0].display
      target.not_member_reasons = { ...target.not_member_reasons, OTHER: target.not_member_reasons.OTHER + 1 }
      const read = parsePreview(bad.status, bad.body)
      expect(read.kind, where).toBe("OK")                                    // the rest of the preview is still read
      if (read.kind !== "OK") continue
      const shared = where === "top" ? read.value.shared : read.value.accounts[0].display?.shared
      expect(shared, where).toEqual({ state: "inconsistent" })
      if (where === "top") expect(previewSentence(read)).toContain("(shared not shown: its counts do not add up)")
    }
  })
})

describe("the backend's own served result", () => {
  it("level 2 carries the classes; level 1 (published before them) says not reported; (F2) a contradiction shows no number", () => {
    const v2 = RESULT_V2()
    const served = parseResultResponse(v2.status, v2.body, v2.body.account_id)
    expect(served.kind === "served" && served.shared).toEqual({ state: "reported", reasons: v2.body.not_member_reasons })
    const v1 = RESULT_V1()
    expect(v1.body.not_member_reasons).toBeUndefined()
    const older = parseResultResponse(v1.status, v1.body, v1.body.account_id)
    expect(older.kind === "served" && older.shared).toEqual({ state: "not_reported" })
    const bad = RESULT_V2()                                                  // TEST_ONLY: one more than counted
    bad.body.not_member_reasons = { ...bad.body.not_member_reasons, OTHER: bad.body.counts.not_members + 1 }
    const contradicted = parseResultResponse(bad.status, bad.body, bad.body.account_id)
    expect(contradicted.kind).toBe("served")                                 // the lists are still served
    expect(contradicted.kind === "served" && contradicted.shared).toEqual({ state: "inconsistent" })
    if (contradicted.kind === "served") {
      render(<ResultLists answer={contradicted} />)
      expect(screen.getByTestId("boundary-shared").textContent).toContain("not shown")
      expect(screen.getByTestId("boundary-shared").textContent).not.toMatch(/\d/)
    }
  })

  it("the lists are titled owned / used / unresolved / not part, with the summary and the server's shared line", () => {
    // TEST_ONLY variant of the real level-2 capture: its not-member rows recounted as shared so the classes still add up.
    const v2 = RESULT_V2()
    const n = v2.body.counts.not_members
    v2.body.not_member_reasons = { SHARED_FOUNDATION: n, SHARED_CLUSTER: 0, EXCLUDED_BY_DECISION: 0, OTHER: 0 }
    const served = parseResultResponse(v2.status, v2.body, v2.body.account_id)
    expect(served.kind).toBe("served")
    if (served.kind !== "served") return
    render(<ResultLists answer={served} />)
    const summaries = [...document.querySelectorAll("summary")].map((s) => s.textContent ?? "")
    for (const title of Object.values(BOUNDARY_TITLES)) expect(summaries.some((s) => s.startsWith(title)), title).toBe(true)
    expect(screen.getByTestId("boundary-summary").textContent).toContain(`not part of this system (${n} of them shared)`)
    expect(screen.getByTestId("boundary-shared").textContent).toBe(
      `Shared: ${n} -- ${n} shared foundation, 0 shared cluster: by design a member of no single system.`)
    expect(screen.queryByText(/^Members|^Dependencies|^Not a member/)).toBeNull()
  })
})
