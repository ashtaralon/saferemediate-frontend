/**
 * Onboarding G2 / G3-A / G3-G: the setup client (lib/system-boundary-setup.ts) over the REAL backend answers at setup contract
 * level 3 (__tests__/fixtures/system-boundary-setup-captures-v3/, pinned in its README; the level-1 and level-2 copies beside it
 * are refused), and
 * the authoring proxy's eight setup routes through the mounted route handlers -- exactly those, nothing else under setup/.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://customer-backend.example" }))

import { GET, POST, PUT } from "@/app/api/proxy/system-boundary/[...path]/route"
import { contentHash } from "@/lib/content-hash"
import {
  associatedSystemId,
  derivedSentence,
  expectedFacts,
  isOperation,
  evidenceRows,
  isStatus,
  MAX_RENDERABLE_EPOCH_SECONDS,
  observationSentence,
  isView,
  readAnswer,
  requestSentence,
  requiredFactsSentence,
  SETUP_CONTRACT_UNKNOWN,
  SETUP_STEPS,
  writeAnswer,
  type DerivedDisposition,
  type OwnerRequest,
  type RequirementProfile,
} from "@/lib/system-boundary-setup"

type Capture = { status: number; body: unknown; _provenance: { request: { method: string; path: string } } }

function capture(name: string, dir = "system-boundary-setup-captures-v3"): Capture {
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
    expect(writeAnswer({ status: 200, json: { setup_id: "x", contract: "system_boundary_setup/v3" } }))
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
    expect(readAnswer({ status: 200, json: { status: "DRAFT", contract: "system_boundary_setup/v3" } }, isView))
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

  it("(G3-G) a level-2 answer -- tagged v2, required facts a string, no profile -- is never read as level 3", () => {
    for (const name of ["read_draft", "read_finished", "status"]) {
      const old = capture(name, "system-boundary-setup-captures-v2")
      expect((old.body as { contract: string }).contract, name).toBe("system_boundary_setup/v2")
      const read = name === "status" ? readAnswer(raw(old), isStatus) : readAnswer(raw(old), isView)
      expect(read, name).toEqual({ kind: "UNAVAILABLE", status: 200, code: SETUP_CONTRACT_UNKNOWN })
    }
    expect(writeAnswer(raw(capture("finish", "system-boundary-setup-captures-v2")))).toEqual(
      { kind: "RESEND_SAME", status: 201, code: SETUP_CONTRACT_UNKNOWN, detail: {} })
  })

  it("(G3-G) required facts are read exactly, and only as decided under the profile served beside them", () => {
    const view = capture("read_draft").body as Record<string, any>    // eslint-disable-line @typescript-eslint/no-explicit-any
    const status = capture("status").body as Record<string, any>      // eslint-disable-line @typescript-eslint/no-explicit-any
    const ok = (body: unknown, parse: (value: unknown) => value is unknown = isView) =>
      readAnswer({ status: 200, json: body }, parse).kind
    expect(ok(view)).toBe("OK")
    expect(ok(status, isStatus)).toBe("OK")
    expect(view.dispositions_derived.map((d: DerivedDisposition) => [d.subject, d.required_facts])).toEqual([
      ["code", { support: "UNSUPPORTED", reason: "CODE_ACQUISITION_NOT_AVAILABLE" }],
      ["history:cloudtrail", { support: "SUPPORTED", reason: null }],
      ["iac", { support: "UNSUPPORTED", reason: "IAC_ACQUISITION_NOT_AVAILABLE" }]])
    const of = (body: Record<string, any>, subject: string, field = "dispositions_derived") =>  // eslint-disable-line @typescript-eslint/no-explicit-any
      body[field].find((d: DerivedDisposition) => d.subject === subject)
    const entry = (body: Record<string, any>, subject: string) =>                             // eslint-disable-line @typescript-eslint/no-explicit-any
      body.requirement_profile.document.subjects.find((s: { subject: string }) => s.subject === subject)
    const altered = (body: Record<string, any>, change: (b: Record<string, any>) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const copy = structuredClone(body)
      change(copy)
      return copy
    }
    const views = {
      // F28: the document is the one its hash names -- a changed need under the same hash is refused before it is shown
      evidenceSourceChanged: altered(view, (b) => { entry(b, "history:cloudtrail").evidence.source = "vpc_flow" }),
      policyChanged: altered(view, (b) => { entry(b, "history:cloudtrail").permission.policies = ["AnyPolicy"] }),
      reasonOfAnEntryChanged: altered(view, (b) => { entry(b, "iac").reason = "SOMETHING_ELSE" }),
      hashChanged: altered(view, (b) => { b.requirement_profile.hash = `v1:${"0".repeat(64)}` }),
      noProfile: altered(view, (b) => { delete b.requirement_profile }),
      subjectTwice: altered(view, (b) => { b.requirement_profile.document.subjects.push(b.requirement_profile.document.subjects[0]) }),
      // F29: each disposition says EXACTLY what that profile says of its subject at its scope
      supportedWithoutItsRegion: altered(view, (b) => { delete of(b, "history:cloudtrail").scope.region }),
      supportedClaimedUnsupported: altered(view, (b) => {
        of(b, "history:cloudtrail").required_facts = { support: "UNSUPPORTED", reason: "CODE_ACQUISITION_NOT_AVAILABLE" } }),
      unsupportedClaimedSupported: altered(view, (b) => { of(b, "iac").required_facts = { support: "SUPPORTED", reason: null } }),
      anotherSubjectsReason: altered(view, (b) => {
        of(b, "iac").required_facts = { support: "UNSUPPORTED", reason: "CODE_ACQUISITION_NOT_AVAILABLE" } }),
      unprofiledClaimedSupported: altered(view, (b) => {
        of(b, "code").subject = "live_source:config"; of(b, "live_source:config").required_facts = { support: "SUPPORTED", reason: null } }),
      unprofiledMisnamed: altered(view, (b) => {
        of(b, "code").subject = "live_source:config"
        of(b, "live_source:config").required_facts = { support: "UNSUPPORTED", reason: "SUBJECT_NOT_PROFILED" } }),
      // shape: exactly {support, reason}, supported XOR a named reason; a level-2 string is another level
      level2String: altered(view, (b) => { b.dispositions_derived[0].required_facts = "PROFILE_NOT_AVAILABLE" }),
      perDispositionHash: altered(view, (b) => { b.dispositions_derived[0].required_facts.profile = b.requirement_profile.hash }),
      reasonOnSupported: altered(view, (b) => { of(b, "history:cloudtrail").required_facts.reason = "WHY" }),
      emptyReason: altered(view, (b) => { of(b, "iac").required_facts.reason = "" }),
      // each check on its own (mutation run on 9285ee8f): the same reason under the other support ...
      supportedClaimedUnsupportedWithoutReason: altered(view, (b) => {
        of(b, "history:cloudtrail").required_facts = { support: "UNSUPPORTED", reason: null } }),
      unsupportedClaimedSupportedWithItsReason: altered(view, (b) => {
        of(b, "iac").required_facts = { support: "SUPPORTED", reason: "IAC_ACQUISITION_NOT_AVAILABLE" } }),
      // ... and a profile whose hash IS its document's, refused only for its shape
      duplicateSubjectRehashed: altered(view, (b) => {
        b.requirement_profile.document.subjects.push(structuredClone(b.requirement_profile.document.subjects[0]))
        b.requirement_profile.hash = contentHash(b.requirement_profile.document) }),
      supportedWithoutPermissionRehashed: altered(view, (b) => {
        entry(b, "history:cloudtrail").permission = null
        b.requirement_profile.hash = contentHash(b.requirement_profile.document) }),
      documentExtraKeyRehashed: altered(view, (b) => {
        b.requirement_profile.document.note = "added"
        b.requirement_profile.hash = contentHash(b.requirement_profile.document) }),
    }
    for (const [label, body] of Object.entries(views)) expect(ok(body), label).toBe("UNAVAILABLE")
    const statuses = {
      permissionRoleChanged: altered(status, (b) => { entry(b, "history:cloudtrail").permission.role = "DifferentReadRole" }),
      contradictoryReason: altered(status, (b) => {
        of(b, "history:cloudtrail", "dispositions").required_facts = { support: "UNSUPPORTED", reason: "CODE_ACQUISITION_NOT_AVAILABLE" } }),
      level2String: altered(status, (b) => { b.dispositions[0].required_facts = "PROFILE_NOT_AVAILABLE" }),
      dispositionMalformedElsewhere: altered(status, (b) => { b.dispositions[0].consequence = "LIMITED" }),   // facts coherent
    }
    for (const [label, body] of Object.entries(statuses)) expect(ok(body, isStatus), label).toBe("UNAVAILABLE")
    // the named limitations themselves read, when the profile says them: a missing Region, an unprofiled live source
    const regionless = altered(view, (b) => {
      delete of(b, "history:cloudtrail").scope.region
      of(b, "history:cloudtrail").required_facts = { support: "UNSUPPORTED", reason: "SCOPE_INCOMPLETE:region" } })
    const liveSource = altered(view, (b) => {
      of(b, "code").subject = "live_source:config"
      of(b, "live_source:config").required_facts = { support: "UNSUPPORTED", reason: "LIVE_SOURCE_NOT_PROFILED" } })
    expect([ok(regionless), ok(liveSource)]).toEqual(["OK", "OK"])
  })

  it("(G3-G) the expected facts are the backend's rule over the served profile -- every captured disposition agrees", () => {
    for (const name of ["read_draft", "read_finished", "finish", "update"]) {
      const body = capture(name).body as { dispositions_derived: DerivedDisposition[]; requirement_profile: RequirementProfile }
      for (const d of body.dispositions_derived) {
        expect(expectedFacts(d.subject, d.scope, body.requirement_profile), `${name} ${d.subject}`).toEqual(d.required_facts)
      }
    }
  })

  it("(G3-G) what each subject requires, in words -- a requirement, never a claim that it is met, connected or granted", () => {
    const view = capture("read_draft").body as { dispositions_derived: DerivedDisposition[]; requirement_profile: RequirementProfile }
    const profile = view.requirement_profile
    const of = (subject: string) => view.dispositions_derived.find((d) => d.subject === subject)!
    const history = of("history:cloudtrail")
    expect(requiredFactsSentence(history, profile)).toBe(
      `Requires committed cloudtrail_iam_usage evidence for ${history.scope.account_id} / ${history.scope.region}, read through the `
      + "member stack's EvidenceReadRole (OwnCloudTrailObjectsOnly)")
    const flow: DerivedDisposition = { ...history, subject: "history:vpc_flow" }
    expect(requiredFactsSentence(flow, profile)).toContain(
      "EvidenceReadRole (NamedFlowLogGroupsOnly); that permission exists only when the account's stack sets "
      + "ExistingFlowLogGroupArns or FlowLogVpcId")
    expect(requiredFactsSentence(of("iac"), profile)).toBe(
      "Not supported -- Cyntro cannot acquire infrastructure as code in this version (IAC_ACQUISITION_NOT_AVAILABLE)")
    expect(requiredFactsSentence(of("code"), profile)).toBe(
      "Not supported -- Cyntro cannot acquire source code in this version (CODE_ACQUISITION_NOT_AVAILABLE)")
    const reason = (r: string): DerivedDisposition => ({ ...history, required_facts: { support: "UNSUPPORTED", reason: r } })
    expect(requiredFactsSentence(reason("SCOPE_INCOMPLETE:region"), profile)).toBe(
      "Not supported as chosen -- it needs a region (SCOPE_INCOMPLETE:region)")
    expect(requiredFactsSentence(reason("SOMETHING_NEW"), profile)).toBe(
      "Not supported -- not in this version's requirement profile (SOMETHING_NEW)")
    const words = [history, flow, of("iac"), of("code")].map((d) => requiredFactsSentence(d, profile)).join(" ")
    expect(words).not.toMatch(/\b(connected|granted|enabled|collecting|met|satisfied)\b/i)
    for (const broken of ["PROFILE_NOT_AVAILABLE", undefined]) {                   // never thrown at the person (F26)
      expect(requiredFactsSentence({ ...history, required_facts: broken as never }, undefined)).toBe("What it requires is not shown here")
    }
    expect(requiredFactsSentence(history, undefined)).toBe("Requires facts this view cannot show")
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
  // backend 3a2756c9) produce these answers from the REAL producer for a history:cloudtrail request; here each is that
  // contract's shape on the REAL captured request made a history:cloudtrail one (``history``) -- the captured request itself
  // is IaC, whose own answer (the capture harness has no coverage scope) is UNKNOWN COVERAGE_NOT_ADMITTED.
  const evidence = () => {
    const made = (capture("status").body as { operations: OwnerRequest[] }).operations[0]
    const history = { ...made, subject: "history:cloudtrail" }
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
    return { made, history, region, fact, observed, absent, partial }
  }

  it("(G3-C.5, F25) what collected evidence shows is read exactly, and only as its request allows", () => {
    const { made, history, fact, observed, absent, partial } = evidence()
    expect(made.subject).toBe("iac")
    expect(made.observation).toEqual({ state: "UNKNOWN", limitation: "COVERAGE_NOT_ADMITTED",
                                       code: "503:INVENTORY_SCOPE_UNAVAILABLE:TENANT_SCOPE_NOT_CONFIGURED" })
    expect(isOperation(made)).toBe(true)                                   // the captured IaC request's own answer
    expect(isOperation({ ...made, observation: { state: "UNKNOWN", limitation: "NO_EVIDENCE_FOR_SUBJECT" } })).toBe(true)
    for (const observation of [observed, absent, partial]) expect(isOperation({ ...history, observation })).toBe(true)
    const wide = { ...history, scope: { account_id: history.scope.account_id } }          // account-wide: any Region's facts
    expect(isOperation({ ...wide, observation: { ...observed, facts: [fact, { ...fact, region: "us-east-2" }] } })).toBe(true)
    const notCurrent = { state: "UNKNOWN", limitation: "REQUEST_NOT_CURRENT" }
    const withdrawn = { ...history, state: "WITHDRAWN", reason: "ACCOUNT_REMOVED", demand: { state: "NO_CURRENT_REQUEST", current_requests: 0 } }
    expect(isOperation({ ...withdrawn, observation: notCurrent })).toBe(true)
    for (const bad of [
      { ...history, observation: undefined },                                               // a made request always answers
      { ...history, observation: notCurrent },                                              // a current one is never "not current"
      { ...withdrawn, observation: observed },                                              // no evidence for a request not current
      { ...withdrawn, observation: absent },
      { ...withdrawn, observation: { ...notCurrent, facts: [fact] } },                      // ... not even under UNKNOWN
      { ...withdrawn, observation: { ...notCurrent, publication: { read_model_generation: "x", published_at_epoch: 1 } } },
      { ...withdrawn, observation: { ...notCurrent, as_of: "2026-10-12T08:00:00Z" } },
      { ...made, observation: observed },                                                   // IaC: CloudTrail is not its evidence
      { ...made, observation: absent },
      { ...made, observation: partial },
      { ...history, observation: { ...observed, facts: [{ ...fact, source: "vpc_flow" }] } },   // another source's facts
      { ...history, subject: "history:vpc_flow", observation: observed },
      { ...history, observation: { ...absent, scope: { ...absent.scope, source: "vpc_flow" } } },
      { ...history, observation: { ...partial, facts: [{ ...fact, source: "vpc_flow" }] } },
      { ...history, observation: { ...observed, facts: [] } },                              // OBSERVED names its facts
      { ...history, observation: { ...observed, facts: [{ ...fact, head_manifest_hash: "" }] } },   // ... each bound to its head
      { ...history, observation: { ...observed, facts: [{ ...fact, committed_generation: 0 }] } },
      { ...history, observation: { ...observed, facts: [{ ...fact, region: "us-east-2" }] } },      // ... in the request's Region
      { ...history, observation: { ...observed, not_started: [{ region: "us-east-2", source_scope: "b", reason: "no_committed_head" }] } },
      { ...history, observation: { ...partial, unresolved: [{ region: "us-east-2", source_scope: "b", status: "PARTIAL", reason: null }] } },
      { ...history, observation: { ...partial, not_started: [{ region: "us-east-2", source_scope: "b", reason: "no_committed_head" }] } },
      { ...history, observation: { ...observed, registration_id: "R".repeat(32) } },
      { ...history, observation: { ...observed, publication: { read_model_generation: 7, published_at_epoch: "now" } } },   // a stamp is typed
      { ...history, observation: { ...absent, scope: { ...absent.scope, account_id: "222222222222" } } },   // an absence is its own
      { ...history, observation: { ...absent, scope: { ...absent.scope, region: "us-east-2" } } },
      { ...history, observation: { ...absent, scope: { ...absent.scope, source_scopes: [] } } },
      { ...wide, observation: absent },                                                     // an absence needs an exact Region
      { ...history, observation: { ...partial, unresolved: [{ region: "eu-west-1", source_scope: "x", reason: null }] } },   // status named
      { ...history, observation: { state: "FULFILLED" } },
      { ...history, observation: { state: "UNKNOWN", limitation: "" } },
      // a state the backend never sends, even with the answer a not-current request carries
      { ...history, state: "DONE", observation: notCurrent },
    ]) {
      expect(isOperation(bad)).toBe(false)
    }
    const planned = { op_id: made.op_id, kind: made.kind, subject: made.subject, scope: made.scope,
                      required_authority: made.required_authority, state: "PLANNED", reason: null }
    expect(isOperation({ ...planned, observation: notCurrent })).toBe(false)
    const status = capture("status").body as { operations: OwnerRequest[] }
    expect(isStatus({ ...status, operations: [{ ...made, observation: observed }] })).toBe(false)   // the whole status refused
  })

  it("(G3-C.5) what collected evidence shows, in words -- never fulfilment, use, non-use or dispatch", () => {
    const { made, history, observed, absent, partial } = evidence()
    const say = (observation: unknown, op: OwnerRequest = history) => observationSentence({ ...op, observation } as OwnerRequest) as string
    expect(say(observed)).toBe("Collected evidence: cloudtrail_iam_usage verified eu-west-1 2026-09-30T23:17:26Z to "
      + "2026-10-01T05:17:26Z (as of 2026-10-12T08:00:00Z) -- what Cyntro has collected, not a fulfilment of this request")
    expect(say({ ...observed, not_started: [{ region: "eu-west-1", source_scope: "b", reason: "no_committed_head" }] }))
      .toContain("nothing committed yet for 1 more scope(s)")
    expect(say(absent)).toBe("No collected cloudtrail_iam_usage evidence in eu-west-1 as of 2026-10-12T08:00:00Z -- nothing "
      + "committed yet; this does not say the source is unused")
    expect(say(partial)).toBe("Collected evidence for this source has gaps · 1 verified scope(s), 1 not (SOURCE_PARTIAL)")
    expect(say(made.observation, made)).toBe("Collected evidence cannot be read for this account now "
      + "(COVERAGE_NOT_ADMITTED 503:INVENTORY_SCOPE_UNAVAILABLE:TENANT_SCOPE_NOT_CONFIGURED)")
    expect(say({ state: "UNKNOWN", limitation: "REQUEST_NOT_CURRENT" })).toBe("Not checked -- this request is not current (REQUEST_NOT_CURRENT)")
    expect(say({ state: "UNKNOWN", limitation: "SOMETHING_NEW" })).toBe("What collected evidence shows is not known now (SOMETHING_NEW)")
    for (const observation of [observed, absent, partial, made.observation]) {
      const words = say(observation).toLowerCase().replace("this does not say the source is unused", "")   // the disclaimer itself
      expect(words).not.toMatch(/\bfulfilled\b|\bis used\b|\bis unused\b|\bowned\b|\bsent\b|\bdispatched\b/)
    }
    expect(observationSentence({ ...made, observation: undefined })).toBeNull()
  })

  it("(G3-D.4) every pinned fact and every named scope stays in the details -- the summary never stands alone", () => {
    const { made, history, fact, observed, absent, partial } = evidence()
    const rows = (observation: unknown, op: OwnerRequest = history) => evidenceRows({ ...op, observation } as OwnerRequest)
    const factRow = "eu-west-1 · all-active-trails: verified 2026-09-30T23:17:26Z (first_verified_digest) to 2026-10-01T05:17:26Z"
      + ` · generation 1 · v1:${"a".repeat(64)}`
    expect(rows({ ...observed, not_started: [{ region: "eu-west-1", source_scope: "second-trail", reason: "no_committed_head" }] }))
      .toEqual([factRow, "eu-west-1 · second-trail: nothing committed (no_committed_head)", `registration ${"5".repeat(32)}`,
                "read from source_coverage:v1:v1:x (published 1970-01-01T00:00:01.000Z)"])
    expect(rows(partial)).toEqual([factRow, "eu-west-1 · second-trail: PARTIAL"])               // facts AND every unresolved scope
    expect(rows(absent)).toEqual(["eu-west-1 · all-active-trails: nothing committed"])
    expect(rows({ state: "UNKNOWN", limitation: "PUBLICATION_NOT_RECORDED", hold_reason: "CONSUMER_NOT_READY" }))
      .toEqual(["held: CONSUMER_NOT_READY"])
    expect(rows({ state: "UNKNOWN", limitation: "REQUEST_NOT_CURRENT" })).toEqual([])
    expect(rows(made.observation, made)).toEqual([])                                     // the captured IaC answer has none
    expect(fact.source).toBe("cloudtrail_iam_usage")
  })

  it("(F26) a publication time is read only when it can be shown -- the details never throw", () => {
    const { history, observed } = evidence()
    const at = (published_at_epoch: unknown) => ({ ...history, observation: { ...observed,
      publication: { read_model_generation: "source_coverage:v1:v1:x", published_at_epoch } } })
    expect(MAX_RENDERABLE_EPOCH_SECONDS).toBe(8_640_000_000_000)
    expect(isOperation(at(MAX_RENDERABLE_EPOCH_SECONDS))).toBe(true)                    // the last whole second a Date holds
    expect(evidenceRows(at(MAX_RENDERABLE_EPOCH_SECONDS) as OwnerRequest).at(-1))
      .toBe("read from source_coverage:v1:v1:x (published +275760-09-13T00:00:00.000Z)")
    expect(isOperation(at(0))).toBe(true)
    expect(isOperation(at(null))).toBe(true)
    expect(evidenceRows(at(null) as OwnerRequest).at(-1)).toBe("read from source_coverage:v1:v1:x")
    for (const epoch of [MAX_RENDERABLE_EPOCH_SECONDS + 1, 1e20, -1, 1.5, "1760000000"]) {
      expect(isOperation(at(epoch))).toBe(false)                                         // refused, never rendered
    }
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
    // (level 3) the required facts are the profile's answer per subject, never a derived "connected"
    expect(view.dispositions_derived.map((d) => [d.subject, d.required_facts.support, d.required_facts.reason])).toEqual([
      ["code", "UNSUPPORTED", "CODE_ACQUISITION_NOT_AVAILABLE"], ["history:cloudtrail", "SUPPORTED", null],
      ["iac", "UNSUPPORTED", "IAC_ACQUISITION_NOT_AVAILABLE"]])
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
