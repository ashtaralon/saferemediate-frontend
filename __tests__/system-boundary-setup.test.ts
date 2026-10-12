/**
 * Onboarding G2 / G3-A: the setup client (lib/system-boundary-setup.ts) over the REAL backend answers at setup contract level 2
 * (__tests__/fixtures/system-boundary-setup-captures-v2/, pinned in its README; the level-1 copies beside it are refused), and
 * the authoring proxy's eight setup routes through the mounted route handlers -- exactly those, nothing else under setup/.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://customer-backend.example" }))

import { GET, POST, PUT } from "@/app/api/proxy/system-boundary/[...path]/route"
import {
  associatedSystemId,
  derivedSentence,
  isOperation,
  isStatus,
  observationSentence,
  isView,
  readAnswer,
  requestSentence,
  SETUP_CONTRACT_UNKNOWN,
  SETUP_STEPS,
  writeAnswer,
  type OwnerRequest,
} from "@/lib/system-boundary-setup"

type Capture = { status: number; body: unknown; _provenance: { request: { method: string; path: string } } }

function capture(name: string, dir = "system-boundary-setup-captures-v2"): Capture {
  return JSON.parse(readFileSync(path.join(__dirname, "fixtures", dir, `${name}.json`), "utf8"))
}

const raw = (c: Capture) => ({ status: c.status, json: c.body })

describe("the setup client reads the REAL answers, and nothing in between is invented", () => {
  it("saved writes: create (201), update (200), finish (201) and its replay (200) are whole setup views", () => {
    for (const [name, status] of [["create", 201], ["update", 200], ["finish", 201], ["finish_replay", 200]] as const) {
      const answer = writeAnswer(raw(capture(name)))
      expect(answer.kind, name).toBe("SAVED")
      if (answer.kind === "SAVED") expect(answer.status).toBe(status)
    }
    const finished = writeAnswer(raw(capture("finish")))
    if (finished.kind !== "SAVED") throw new Error("finish")
    expect(finished.view.status).toBe("FINISHED")
    expect(finished.view.receipt?.association.completed_revision).toBe(2)
    expect(associatedSystemId(finished.view.receipt!.association)).toMatch(/^authored_system:[0-9a-f]{64}$/)
    const replay = writeAnswer(raw(capture("finish_replay")))
    expect(replay.kind === "SAVED" && replay.view.replayed).toBe(true)
  })

  it("named refusals stay refusals, with the step the server names", () => {
    const incomplete = writeAnswer(raw(capture("incomplete")))
    expect(incomplete).toMatchObject({ kind: "REFUSED", status: 409, code: "SETUP_INCOMPLETE", detail: { step: "system_details" } })
    expect(writeAnswer(raw(capture("forged_truth")))).toMatchObject({
      kind: "REFUSED", status: 422, code: "FIELD_NOT_AUTHORED", detail: { field: "steps.dispositions[0].status_axes" } })
    expect(writeAnswer(raw(capture("version_conflict")))).toMatchObject({ kind: "REFUSED", status: 409, code: "VERSION_CONFLICT" })
    expect(writeAnswer(raw(capture("auditor_cancel")))).toMatchObject({ kind: "REFUSED", status: 403, code: "PERSON_NOT_AUTHORIZED" })
  })

  it("an unproven write is RESEND_SAME: a 202, the network, a malformed 200, OUTCOME_UNKNOWN", () => {
    expect(writeAnswer({ status: 202, json: capture("read_draft").body }).kind).toBe("RESEND_SAME")
    expect(writeAnswer({ status: null, json: undefined })).toMatchObject({ kind: "RESEND_SAME", code: "NETWORK_ERROR" })
    expect(writeAnswer({ status: 200, json: { setup_id: "x", contract: "system_boundary_setup/v2" } }))
      .toMatchObject({ kind: "RESEND_SAME", code: "MALFORMED_RESPONSE" })
    expect(writeAnswer({ status: 503, json: { detail: { code: "OUTCOME_UNKNOWN" } } })).toMatchObject({ kind: "RESEND_SAME" })
  })

  it("reads: a draft, a finished setup, the status vector and the list; out of scope is a refusal, never empty", () => {
    for (const name of ["read_draft", "read_finished"]) expect(isView(capture(name).body), name).toBe(true)
    expect(readAnswer(raw(capture("read_draft")), isView).kind).toBe("OK")
    const status = readAnswer(raw(capture("status")), isStatus)
    expect(status.kind === "OK" && status.value.association?.state).toBe("CURRENT")
    // (G3-A) the harness's "requested" IaC disposition is ONE owner request, pending, as the backend derives it now
    expect(status.kind === "OK" && status.value.operations.map((o) => [o.subject, o.state, o.demand])).toEqual(
      [["iac", "PENDING", { state: "PENDING", current_requests: 1 }]])
    const list = capture("list").body as { setups: unknown[] }
    expect(list.setups.length).toBe(1)
    expect(readAnswer(raw(capture("not_found")), isView)).toMatchObject({ kind: "REFUSED", status: 404, code: "SETUP_NOT_FOUND" })
    expect(readAnswer({ status: 200, json: { status: "DRAFT", contract: "system_boundary_setup/v2" } }, isView))
      .toMatchObject({ kind: "UNAVAILABLE", code: "MALFORMED_RESPONSE" })
  })

  it("(G3-A) an untagged level-1 answer is never read as level 2: a read is unavailable and a write is resent, never saved", () => {
    for (const name of ["read_draft", "status", "list"]) {
      const old = capture(name, "system-boundary-setup-captures")
      expect("contract" in (old.body as object), name).toBe(false)
      expect(readAnswer(raw(old), isStatus), name).toEqual({ kind: "UNAVAILABLE", status: 200, code: SETUP_CONTRACT_UNKNOWN })
    }
    expect(writeAnswer(raw(capture("finish", "system-boundary-setup-captures")))).toEqual(
      { kind: "RESEND_SAME", status: 201, code: SETUP_CONTRACT_UNKNOWN, detail: {} })
  })

  it("(G3-A) an owner request is read exactly: a planned one names no requester, a made one its demand and fulfilment", () => {
    const status = capture("status").body as { operations: OwnerRequest[] }
    const made = status.operations[0]
    expect(isOperation(made)).toBe(true)
    const planned = { op_id: made.op_id, kind: made.kind, subject: made.subject, scope: made.scope,
                      required_authority: made.required_authority, state: "PLANNED", reason: null }
    expect(isOperation(planned)).toBe(true)
    for (const bad of [{ ...made, kind: "dispatch" }, { ...made, state: "DONE" }, { ...made, op_id: "x" },
                       { ...planned, requested_by: made.requested_by }, { ...made, demand: undefined },
                       { ...made, scope: { account_id: "1" } }, { ...made, requested_by: undefined },
                       { ...made, requested_at: undefined },
                       { ...made, demand: { state: "PENDING", current_requests: -1 } },
                       { ...made, demand: { state: "PENDING", current_requests: 1.5 } },
                       { ...made, demand: { state: "PENDING", current_requests: "1" } },
                       // (F22) contradictory demand facts: standing with no current request, or a current request not standing
                       { ...made, demand: { state: "PENDING", current_requests: 0 } },
                       { ...made, demand: { state: "NO_CURRENT_REQUEST", current_requests: 2 } },
                       { ...made, state: "PENDING", demand: { state: "NO_CURRENT_REQUEST", current_requests: 0 } },
                       { ...made, state: "SUPERSEDED", superseded: null },
                       { ...made, state: "PENDING", superseded: { by: "x@1", at: made.requested_at } }]) {
      expect(isOperation(bad)).toBe(false)
    }
    // the backend's own non-pending states, each with the demand its other requests leave -- and, not being current,
    // no evidence read for it (G3-C.5)
    const notCurrent = { state: "UNKNOWN", limitation: "REQUEST_NOT_CURRENT" }
    for (const good of [{ ...made, state: "HELD", reason: "REGISTRATION_CHANGED", demand: { state: "NO_CURRENT_REQUEST", current_requests: 0 },
                          observation: notCurrent },
                        { ...made, state: "WITHDRAWN", reason: "ACCOUNT_REMOVED", demand: { state: "PENDING", current_requests: 1 },
                          observation: notCurrent },
                        { ...made, state: "SUPERSEDED", reason: "SUPERSEDED_BY_SUCCESSOR", superseded: { by: "x@1", at: made.requested_at },
                          demand: { state: "PENDING", current_requests: 2 }, observation: notCurrent }]) {
      expect(isOperation(good)).toBe(true)
    }
    expect(isStatus({ ...status, operations: [{ ...made, state: "DONE" }] })).toBe(false)
  })

  // (G3-C.5) What collected evidence shows. The backend's end-to-end controls (tests/test_system_boundary_setup_observation.py,
  // backend 3a2756c9) produce these answers from the REAL producer; here each is that contract's shape on the REAL captured
  // request, whose own answer (the capture harness has no coverage scope) is UNKNOWN COVERAGE_NOT_ADMITTED.
  const evidence = () => {
    const made = (capture("status").body as { operations: OwnerRequest[] }).operations[0]
    const region = made.scope.region as string
    const fact = { source: "cloudtrail_iam_usage", region, source_scope: "all-active-trails", earliest_verified_at: "2026-09-30T23:17:26Z",
                   earliest_verified_basis: "first_verified_digest", first_verified_collection_at: "2026-10-01T00:07:00Z",
                   verified_through: "2026-10-01T05:17:26Z", committed_generation: 1, head_manifest_hash: `v1:${"a".repeat(64)}` }
    const observed = { state: "OBSERVED", as_of: "2026-10-12T08:00:00Z", registration_id: "5".repeat(32), facts: [fact], not_started: [],
                       publication: { read_model_generation: "source_coverage:v1:v1:x", published_at_epoch: 1 } }
    const absent = { state: "NOT_OBSERVED", as_of: "2026-10-12T08:00:00Z",
                     scope: { account_id: made.scope.account_id, region, source: "cloudtrail_iam_usage", source_scopes: ["all-active-trails"] } }
    const partial = { state: "UNKNOWN", limitation: "SOURCE_PARTIAL", as_of: "2026-10-12T08:00:00Z", facts: [fact],
                      unresolved: [{ region, source_scope: "second-trail", status: "PARTIAL", reason: null }], not_started: [] }
    return { made, region, fact, observed, absent, partial }
  }

  it("(G3-C.5) what collected evidence shows is read exactly, and only as its request allows", () => {
    const { made, fact, observed, absent, partial } = evidence()
    expect(made.observation).toEqual({ state: "UNKNOWN", limitation: "COVERAGE_NOT_ADMITTED",
                                       code: "503:INVENTORY_SCOPE_UNAVAILABLE:TENANT_SCOPE_NOT_CONFIGURED" })
    for (const observation of [observed, absent, partial]) expect(isOperation({ ...made, observation })).toBe(true)
    const withdrawn = { ...made, state: "WITHDRAWN", reason: "ACCOUNT_REMOVED", demand: { state: "NO_CURRENT_REQUEST", current_requests: 0 } }
    for (const bad of [
      { ...made, observation: undefined },                                                  // a made request always answers
      { ...made, observation: { state: "UNKNOWN", limitation: "REQUEST_NOT_CURRENT" } },    // a current one is never "not current"
      { ...withdrawn, observation: observed },                                              // no evidence for a request not current
      { ...withdrawn, observation: absent },
      { ...made, observation: { ...observed, facts: [] } },                                 // OBSERVED names its facts
      { ...made, observation: { ...observed, facts: [{ ...fact, head_manifest_hash: "" }] } },   // ... each bound to its head
      { ...made, observation: { ...observed, facts: [{ ...fact, committed_generation: 0 }] } },
      { ...made, observation: { ...observed, facts: [{ ...fact, region: "us-east-2" }] } },      // ... in the request's Region
      { ...made, observation: { ...observed, registration_id: "R".repeat(32) } },
      { ...made, observation: { ...absent, scope: { ...absent.scope, account_id: "222222222222" } } },   // an absence is its own
      { ...made, observation: { ...absent, scope: { ...absent.scope, region: "us-east-2" } } },
      { ...made, observation: { ...absent, scope: { ...absent.scope, source_scopes: [] } } },
      { ...made, observation: { ...partial, unresolved: [{ region: "eu-west-1", source_scope: "x", reason: null }] } },   // status named
      { ...made, observation: { state: "FULFILLED" } },
      { ...made, observation: { state: "UNKNOWN", limitation: "" } },
      // a state the backend never sends, even with the answer a not-current request carries
      { ...made, state: "DONE", observation: { state: "UNKNOWN", limitation: "REQUEST_NOT_CURRENT" } },
    ]) {
      expect(isOperation(bad)).toBe(false)
    }
    const planned = { op_id: made.op_id, kind: made.kind, subject: made.subject, scope: made.scope,
                      required_authority: made.required_authority, state: "PLANNED", reason: null }
    expect(isOperation({ ...planned, observation: { state: "UNKNOWN", limitation: "REQUEST_NOT_CURRENT" } })).toBe(false)
    const status = capture("status").body as { operations: OwnerRequest[] }
    expect(isStatus({ ...status, operations: [{ ...made, observation: { ...observed, facts: [] } }] })).toBe(false)
  })

  it("(G3-C.5) what collected evidence shows, in words -- never fulfilment, use, non-use or dispatch", () => {
    const { made, observed, absent, partial } = evidence()
    const say = (observation: unknown) => observationSentence({ ...made, observation } as OwnerRequest) as string
    expect(say(observed)).toBe("Collected evidence: cloudtrail_iam_usage verified eu-west-1 2026-09-30T23:17:26Z to "
      + "2026-10-01T05:17:26Z (as of 2026-10-12T08:00:00Z) -- what Cyntro has collected, not a fulfilment of this request")
    expect(say({ ...observed, not_started: [{ region: "eu-west-1", source_scope: "b", reason: "no_committed_head" }] }))
      .toContain("nothing committed yet for 1 more scope(s)")
    expect(say(absent)).toBe("No collected cloudtrail_iam_usage evidence in eu-west-1 as of 2026-10-12T08:00:00Z -- nothing "
      + "committed yet; this does not say the source is unused")
    expect(say(partial)).toBe("Collected evidence for this source has gaps · 1 verified scope(s), 1 not (SOURCE_PARTIAL)")
    expect(say(made.observation)).toBe("Collected evidence cannot be read for this account now "
      + "(COVERAGE_NOT_ADMITTED 503:INVENTORY_SCOPE_UNAVAILABLE:TENANT_SCOPE_NOT_CONFIGURED)")
    expect(say({ state: "UNKNOWN", limitation: "REQUEST_NOT_CURRENT" })).toBe("Not checked -- this request is not current (REQUEST_NOT_CURRENT)")
    expect(say({ state: "UNKNOWN", limitation: "SOMETHING_NEW" })).toBe("What collected evidence shows is not known now (SOMETHING_NEW)")
    for (const observation of [observed, absent, partial, made.observation]) {
      const words = say(observation).toLowerCase().replace("this does not say the source is unused", "")   // the disclaimer itself
      expect(words).not.toMatch(/\bfulfilled\b|\bis used\b|\bis unused\b|\bowned\b|\bsent\b|\bdispatched\b/)
    }
    expect(observationSentence({ ...made, observation: undefined })).toBeNull()
  })

  it("(G3-A) each request state in words, from the backend's own state and reason -- the browser infers none of it", () => {
    const made = (capture("status").body as { operations: OwnerRequest[] }).operations[0]
    const as = (state: OwnerRequest["state"], reason: string | null, extra: Partial<OwnerRequest> = {}) =>
      requestSentence({ ...made, state, reason, ...extra })
    expect(requestSentence(made)).toBe("Requested from an account administrator -- waiting; this setup has not connected or changed "
      + "the source, and other changes in the account are not known here")
    expect(as("PENDING", null, { demand: { state: "PENDING", current_requests: 2 } })).toContain("2 current requests for it in all")
    expect(as("HELD", "REGISTRATION_CHANGED")).toContain("registered again since it was requested")
    expect(as("HELD", "REQUESTER_AUTHORITY_REVOKED")).toContain("may no longer author for this account")
    expect(as("HELD", "DERIVATION_UNAVAILABLE")).toBe("On hold -- its account cannot be checked now (DERIVATION_UNAVAILABLE)")
    expect(as("WITHDRAWN", "ACCOUNT_REMOVED")).toBe("Withdrawn -- the account was removed from Cyntro (ACCOUNT_REMOVED)")
    expect(as("WITHDRAWN", "ACCOUNT_NOT_REGISTERED")).toContain("is not registered")
    expect(as("SUPERSEDED", "SUPERSEDED_BY_SUCCESSOR", { demand: { state: "PENDING", current_requests: 1 } }))
      .toBe("Superseded by a later version of this setup -- still requested elsewhere")
    expect(as("PLANNED", null)).toContain("nothing is asked before")
  })

  it("the server's own reading of every disposition, in words -- the browser claims none of it", () => {
    const view = capture("read_draft").body as { dispositions_derived: Parameters<typeof derivedSentence>[0][]; intent: { resume_step: string } }
    expect(view.dispositions_derived.map(derivedSentence)).toEqual([
      "No source chosen (NOT_USED) -- code:LIMITED",
      "No source chosen (NO_HISTORY) -- history:cloudtrail:HELD",
      "Not available in this release (RESOLVER_NOT_AVAILABLE) -- iac:LIMITED",
    ])
    expect(view.dispositions_derived.every((d) => d.required_facts === "PROFILE_NOT_AVAILABLE")).toBe(true)
    expect(SETUP_STEPS).toContain(view.intent.resume_step)
  })
})

const APP = "https://app.example"
const PROXY = `${APP}/api/proxy/system-boundary`
const UPSTREAM = "https://customer-backend.example/api/system-boundary"
const SID = "5e7a0000-0000-4000-8000-000000000001"

function send(method: "GET" | "POST" | "PUT", suffix: string, body?: string, contentType = "application/json") {
  const request = new NextRequest(`${PROXY}/${suffix}`, { method, ...(body !== undefined ? { body } : {}) })
  request.headers.set("sec-fetch-site", "same-origin")
  if (body !== undefined) request.headers.set("content-type", contentType)
  return ({ GET, POST, PUT }[method])(request)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("authoring proxy -- the eight setup routes and nothing else under setup/", () => {
  it.each([
    ["POST", "setup", "{}"],
    ["GET", "setup/list", undefined],
    ["GET", "setup/list?cursor=abc", undefined],
    ["GET", `setup/${SID}`, undefined],
    ["GET", `setup/${SID}/status`, undefined],
    ["PUT", `setup/${SID}`, '{"steps":{}}'],
    ["POST", `setup/${SID}/finish`, "{}"],
    ["POST", `setup/${SID}/cancel`, "{}"],
    ["POST", `setup/${SID}/amend`, "{}"],
  ] as const)("%s %s reaches exactly its backend route", async (method, suffix, body) => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ ok: true }))
    const response = await send(method, suffix, body)
    expect(response.status).toBe(200)
    const [url, init] = upstream.mock.calls[0] as [URL, RequestInit]
    expect(String(url)).toBe(`${UPSTREAM}/${suffix}`)
    expect(init.method).toBe(method)
    if (body !== undefined) expect(new TextDecoder().decode(init.body as Uint8Array)).toBe(body)
  })

  it.each([
    ["GET", "setup"],                                 // the backend's one-segment GET /setup is another route's
    ["PUT", "setup/list"],
    ["GET", "setup/not-a-uuid"],
    ["GET", `setup/${SID}/status/extra`],
    ["PUT", `setup/${SID}/finish`],
    ["POST", `setup/${SID}/delete`],
    ["GET", `setup/${SID}/finish`],
    ["POST", `setup/${SID.toUpperCase()}/finish`],
  ] as const)("%s %s is refused here, nothing forwarded", async (method, suffix) => {
    const upstream = vi.spyOn(globalThis, "fetch")
    const response = await send(method, suffix, method === "GET" ? undefined : "{}")
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ detail: { code: "AUTHORING_ROUTE_UNKNOWN" } })
    expect(upstream).not.toHaveBeenCalled()
  })

  it("a PUT needs a JSON body and the list takes only its cursor", async () => {
    const upstream = vi.spyOn(globalThis, "fetch")
    expect((await send("PUT", `setup/${SID}`, "x", "text/plain")).status).toBe(415)
    expect((await send("GET", "setup/list?limit=2")).status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })
})
