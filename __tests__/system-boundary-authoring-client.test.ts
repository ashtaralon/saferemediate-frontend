/**
 * Typed System Boundary authoring client (lib/system-boundary-authoring.ts) -- the contract of backend 9af2ca3a (N2).
 *
 * A success is believed only when it names THIS request; a named refusal is never "saved"; anything unproven asks
 * for the SAME envelope again; an envelope is frozen and never changed by a later one.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AUTHORING_BASE,
  type CreateDeclaration,
  type Correction,
  listRequests,
  newCorrectionEnvelope,
  newCreateEnvelope,
  readOwnGrant,
  readRequest,
  readView,
  refusedRoots,
  rootFromInventory,
  saveCorrection,
  saveDeclaration,
} from "@/lib/system-boundary-authoring"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SYSTEM = "authored_system:" + "1".repeat(64)
const KEY = `SYSTEM#${SYSTEM}`
const PUBLICATION = { attempt: "a".repeat(32), generation: 3, source_identity: "sha256:" + "1".repeat(64),
                      authority_digest: "sha256:" + "2".repeat(64), registration_id: "5".repeat(32) }
/** An IAM role row in the producer's spellings (uid scheme aws://<partition>/<account>/global/iam/role/<name>; the IAM
 *  normalizer's RoleId carried as source "role_id"); the values are this test's own. */
const ROLE_ROW = { resource_uid: "aws://aws/111111111111/global/iam/role/app-role", resource_type: "iam:role", region: "global",
                   observed_incarnation: { status: "provided", source: "role_id", value: "AROAAPPROLE000000002" } }

function draft(): CreateDeclaration {
  return {
    system: { mode: "new", display_name: "Payments", criticality: "LOW" },
    deployment: { mode: "new", deployment_key: "prod", environment: "PRODUCTION", environment_raw: "prd",
                  scopes: [{ account_id: "111111111111", region: "eu-west-1" }] },
    roots: [rootFromInventory("111111111111", ROLE_ROW, PUBLICATION)],
  }
}

const criticalityOnly: Correction = { system: { system_id: SYSTEM, expected_version: 1, set: { criticality: null } } }

function saved(requestId: string, overrides: Record<string, unknown> = {}) {
  return { outcome: "SAVED", replayed: false, request_kind: "CREATE", request_id: requestId, revision: 2,
           written: [{ key: KEY, version: 1 }], references: [], ...overrides }
}

function answers(...responses: (Response | Error)[]) {
  const spy = vi.spyOn(globalThis, "fetch")
  for (const response of responses) {
    if (response instanceof Error) spy.mockRejectedValueOnce(response)
    else spy.mockResolvedValueOnce(response)
  }
  return spy
}

function call(spy: { mock: { calls: unknown[][] } }, n = 0) {
  const [url, init] = spy.mock.calls[n] as [string, RequestInit]
  return { url, init }
}

afterEach(() => vi.restoreAllMocks())

describe("authoring client -- envelopes", () => {
  it("mints one request id per envelope over a frozen copy: later edits and later envelopes change nothing", () => {
    const declaration = draft()
    const first = newCreateEnvelope(4, declaration)
    declaration.roots.push(rootFromInventory("222222222222", { ...ROLE_ROW, resource_uid: "later" }, PUBLICATION))
    const second = newCreateEnvelope(4, declaration)

    expect(first.request_id).toMatch(UUID)
    expect(second.request_id).not.toBe(first.request_id)
    expect([first.base_revision, first.declaration.roots.length, second.declaration.roots.length]).toEqual([4, 1, 2])
    expect(Object.isFrozen(first) && Object.isFrozen(first.declaration.roots) && Object.isFrozen(first.declaration.roots[0])
           && Object.isFrozen(first.declaration.roots[0].selection.observed_incarnation)).toBe(true)
    expect(() => {
      (first.declaration.roots as unknown as unknown[]).push("x")
    }).toThrow()
    const correction = newCorrectionEnvelope(2, criticalityOnly)
    expect(correction.correction).toEqual(criticalityOnly)
    expect(correction.correction).not.toBe(criticalityOnly)
  })
})

describe("authoring client -- roots (N2)", () => {
  it("builds a root from one inventory page: the row's identity, type and incarnation, and that page's publication pins", () => {
    const row = structuredClone(ROLE_ROW)
    const root = rootFromInventory("111111111111", row, PUBLICATION)
    expect(root).toEqual({
      account_id: "111111111111", region: "global", resource_uid: ROLE_ROW.resource_uid,
      selection: { resource_type: "iam:role",
                   publication: { attempt: PUBLICATION.attempt, generation: 3, source_identity: PUBLICATION.source_identity,
                                  authority_digest: PUBLICATION.authority_digest },
                   observed_incarnation: ROLE_ROW.observed_incarnation },
    })
    expect("registration_id" in root.selection.publication).toBe(false)       // the resolver's contract: four pins, no more
    ;(row.observed_incarnation as Record<string, unknown>).value = "changed later"
    expect(root.selection.observed_incarnation).toEqual(ROLE_ROW.observed_incarnation)   // copied, never aliased
  })

  it("names the roots a ROOT_NOT_ADMITTED refusal names, and nothing for anything else or anything malformed", () => {
    const named = { account_id: "111111111111", region: "global", resource_uid: ROLE_ROW.resource_uid, status: "CHANGED",
                    reason_code: "INCARNATION_CHANGED" }
    expect(refusedRoots({ kind: "REFUSED", status: 409, code: "ROOT_NOT_ADMITTED", detail: { roots: [named] } })).toEqual([named])
    expect(refusedRoots({ kind: "REFUSED", status: 409, code: "ROOT_NOT_ADMITTED", detail: { roots: [{ ...named, status: 7 }] } })).toEqual([])
    expect(refusedRoots({ kind: "REFUSED", status: 409, code: "ACCOUNT_AUTHORITY_CHANGED", detail: { roots: [named] } })).toEqual([])
    expect(refusedRoots({ kind: "RESEND_SAME", status: 503, code: "OUTCOME_UNKNOWN", detail: {} })).toEqual([])
  })

  it("a refusal of the roots is a named refusal carrying every refused root, never saved and never resent", async () => {
    const envelope = newCreateEnvelope(1, draft())
    const roots = [{ account_id: "111111111111", region: "global", resource_uid: ROLE_ROW.resource_uid, status: "ABSENT",
                     reason_code: "NOT_IN_PUBLICATION" }]
    answers(Response.json({ detail: { code: "ROOT_NOT_ADMITTED", roots } }, { status: 409 }))
    const result = await saveDeclaration(envelope)
    expect(result).toEqual({ kind: "REFUSED", status: 409, code: "ROOT_NOT_ADMITTED", detail: { roots } })
    expect(refusedRoots(result)).toEqual(roots)
  })
})

describe("authoring client -- a save", () => {
  it("posts the envelope, exactly, to the proxy's declarations route", async () => {
    const envelope = newCreateEnvelope(1, draft())
    const spy = answers(Response.json(saved(envelope.request_id), { status: 201 }))
    const result = await saveDeclaration(envelope)

    const { url, init } = call(spy)
    expect(url).toBe(`${AUTHORING_BASE}/declarations`)
    expect([init.method, init.cache, init.credentials, init.body]).toEqual(["POST", "no-store", "same-origin", JSON.stringify(envelope)])
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json")
    expect(result).toEqual({ kind: "SAVED", status: 201, saved: saved(envelope.request_id) })
  })

  it("believes a replay (200) only as a replay of THIS request", async () => {
    const envelope = newCreateEnvelope(1, draft())
    answers(Response.json(saved(envelope.request_id, { replayed: true }), { status: 200 }))
    expect((await saveDeclaration(envelope)).kind).toBe("SAVED")
  })

  it.each([
    ["another request's id", (id: string) => saved("0f8fad5b-d9cb-469f-a165-70867728950e")],
    ["another kind", (id: string) => saved(id, { request_kind: "CORRECT" })],
    ["no outcome", (id: string) => saved(id, { outcome: undefined })],
    ["a 201 that says replayed", (id: string) => saved(id, { replayed: true })],
    ["no revision", (id: string) => saved(id, { revision: undefined })],
    ["nothing written", (id: string) => saved(id, { written: [] })],
    ["a malformed reference", (id: string) => saved(id, { references: [{ key: KEY }] })],
  ])("never reads a 201 with %s as saved: the same envelope is to be resent", async (_label, body) => {
    const envelope = newCreateEnvelope(1, draft())
    answers(Response.json(body(envelope.request_id), { status: 201 }))
    expect(await saveDeclaration(envelope)).toEqual({ kind: "RESEND_SAME", status: 201, code: "MALFORMED_RESPONSE", detail: {} })
  })

  it("never reads a non-JSON 200 as saved", async () => {
    const envelope = newCreateEnvelope(1, draft())
    answers(new Response("<html>gateway</html>", { status: 200, headers: { "content-type": "text/html" } }))
    expect((await saveDeclaration(envelope)).kind).toBe("RESEND_SAME")
  })

  it.each([
    [409, "REQUEST_ID_REUSED", {}],
    [409, "REQUEST_ID_CONFLICT", {}],
    [409, "BASE_REVISION_CONFLICT", { current_revision: 7 }],
    [403, "PERSON_NOT_AUTHORIZED", { account_id: "222222222222" }],
    [403, "AUTHORING_ORIGIN_REFUSED", {}],
    [503, "PROTOCOL_READER_UNAVAILABLE", {}],
  ])("a %s %s is a named refusal, never saved", async (status, code, detail) => {
    const envelope = newCreateEnvelope(1, draft())
    answers(Response.json({ detail: { code, ...detail } }, { status }))
    expect(await saveDeclaration(envelope)).toEqual({ kind: "REFUSED", status, code, detail })
  })

  it.each([
    ["OUTCOME_UNKNOWN", 503, Response.json({ detail: { code: "OUTCOME_UNKNOWN", reason: "NOT_PROVEN", retry: "resend the same request_id and body" } }, { status: 503 })],
    ["TRANSACTION_CONFLICT", 409, Response.json({ detail: { code: "TRANSACTION_CONFLICT", retry: "resend the same request_id and body" } }, { status: 409 })],
    ["STORE_THROTTLED", 503, Response.json({ detail: { code: "STORE_THROTTLED" } }, { status: 503 })],
    ["AUTHORING_BACKEND_UNAVAILABLE", 502, Response.json({ detail: { code: "AUTHORING_BACKEND_UNAVAILABLE" } }, { status: 502 })],
    ["MALFORMED_RESPONSE", 500, new Response("Internal Server Error", { status: 500 })],
    ["NETWORK_ERROR", null, new TypeError("Failed to fetch")],
  ])("%s asks for the SAME envelope again, and resending sends the identical request", async (code, status, response) => {
    const envelope = newCreateEnvelope(1, draft())
    const spy = answers(response, Response.json(saved(envelope.request_id, { replayed: true }), { status: 200 }))
    const first = await saveDeclaration(envelope)
    expect([first.kind, first.status, "code" in first ? first.code : null]).toEqual(["RESEND_SAME", status, code])
    const second = await saveDeclaration(envelope)
    expect(second.kind).toBe("SAVED")
    expect(call(spy, 1).init.body).toBe(call(spy, 0).init.body)   // the same request id and body
  })

  it("a correction goes to the corrections route and must come back as a CORRECT", async () => {
    const envelope = newCorrectionEnvelope(3, criticalityOnly)
    const spy = answers(Response.json(saved(envelope.request_id, { request_kind: "CORRECT", revision: 4 }), { status: 201 }),
                        Response.json(saved(envelope.request_id), { status: 201 }))
    expect((await saveCorrection(envelope)).kind).toBe("SAVED")
    expect(call(spy).url).toBe(`${AUTHORING_BASE}/declarations/corrections`)
    expect((await saveCorrection(envelope)).kind).toBe("RESEND_SAME")   // a CREATE answer is not this correction's
  })
})

describe("authoring client -- reads", () => {
  it("reads the view and refuses to believe a malformed one", async () => {
    const view = { completed_revision: 2, source: "SNAPSHOT", protocol_phase: "ACTIVE", systems: [], deployments: [], roots: [],
                   limits: { max_roots: 36 } }
    answers(Response.json(view), Response.json({ ...view, roots: null }))
    expect(await readView()).toEqual({ kind: "OK", value: view })
    expect(await readView()).toEqual({ kind: "UNAVAILABLE", status: 200, code: "MALFORMED_RESPONSE" })
  })

  it("pages the person's own requests through the proxy, cursor and limit only", async () => {
    const page = { requests: [{ request_id: "r", revision: 3, written_at: "t", kind: "CORRECT", intent_hash: "h" }], next_cursor: "n+x" }
    const spy = answers(Response.json(page))
    expect(await listRequests({ limit: 2, cursor: "abc+def" })).toEqual({ kind: "OK", value: page })
    expect(call(spy).url).toBe(`${AUTHORING_BASE}/declarations/requests?limit=2&cursor=abc%2Bdef`)
  })

  it("reads one request whole, or its named refusal (withheld, not found)", async () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
    const receipt = { ...saved(id), written_at: "t", historical: true }
    delete (receipt as Record<string, unknown>).replayed
    answers(Response.json(receipt), Response.json({ detail: { code: "RECEIPT_WITHHELD", request_id: id, revision: 2 } }, { status: 403 }),
            Response.json({ ...receipt, request_id: "another" }))
    expect((await readRequest(id)).kind).toBe("OK")
    expect(await readRequest(id)).toEqual({ kind: "REFUSED", status: 403, code: "RECEIPT_WITHHELD", detail: { request_id: id, revision: 2 } })
    expect((await readRequest(id)).kind).toBe("UNAVAILABLE")             // a receipt for another request is not this one
  })

  it("reads the person's own grant record, and says when the backend is unreachable", async () => {
    answers(Response.json({ subject: "issuer#00u-alice", grant: null }),
            Response.json({ detail: { code: "AUTHORING_BACKEND_UNAVAILABLE" } }, { status: 502 }))
    expect(await readOwnGrant()).toEqual({ kind: "OK", value: { subject: "issuer#00u-alice", grant: null } })
    expect(await readOwnGrant()).toEqual({ kind: "UNAVAILABLE", status: 502, code: "AUTHORING_BACKEND_UNAVAILABLE" })
  })
})
