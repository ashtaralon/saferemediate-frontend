/**
 * S2 intake I2b: the binding client (lib/terraform-binding.ts) against the backend's REAL answers
 * (__tests__/fixtures/terraform-binding-captures, copied byte-identical from the commit that asserts them). A negative control
 * is ONE named change to such an answer. The two transport shapes no backend capture can hold -- the load balancer's redirect
 * to the IdP (a browser's ``redirect: "manual"`` answer is ``type: "opaqueredirect"``, status 0) and an HTML page -- are
 * built here by name; the client reads only their type and status.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BINDING_CONTRACT, createTerraformBinding, readTerraformBinding, revokeTerraformBinding } from "@/lib/terraform-binding"

const CAPTURES = path.join(__dirname, "fixtures", "terraform-binding-captures")
type Capture = { status: number; content_type: string; body: any; _provenance: { request: { method: string; path: string } } }
const capture = (name: string): Capture => JSON.parse(readFileSync(path.join(CAPTURES, `${name}.json`), "utf8"))
const BID = capture("create").body.binding_id as string
const BODY = '{"request_id":"00000000-0000-4000-8000-0000000f0001","document":"{\\"version\\":4}"}'   // sent as given

function answers(c: Capture | Response) {
  const response = c instanceof Response ? c
    : new Response(JSON.stringify(c.body), { status: c.status, headers: { "content-type": c.content_type } })
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response)
}
const mutatedBody = (name: string, change: (body: any) => void): Capture => {
  const c = capture(name)
  change(c.body)
  return c
}
afterEach(() => vi.restoreAllMocks())

describe("create: the exact envelope, once, never following a redirect", () => {
  it.each(["create", "create_show", "create_replay"])("%s is OK with the binding", async (name) => {
    const c = capture(name)
    const upstream = answers(c)
    const out = await createTerraformBinding(BODY)
    expect(out).toEqual({ kind: "OK", status: c.status, value: { binding_id: c.body.binding_id, revision: 1, counts: c.body.counts,
                                                                  replayed: name === "create_replay" } })
    expect(upstream).toHaveBeenCalledTimes(1)
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/proxy/system-boundary/terraform-bindings")
    expect([init.method, init.body, init.redirect, init.cache, init.credentials]).toEqual(["POST", BODY, "manual", "no-store", "same-origin"])
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json")
  })

  it.each([
    ["reduction_invalid", 422, "REDUCTION_INVALID", "IDENTITY_NOT_RETAINED"],
    ["consent_required", 422, "CONSENT_REQUIRED", null],
    ["credential_shaped", 422, "STATE_VALUE_CREDENTIAL_SHAPED", null],
    ["too_large", 413, "REQUEST_BODY_TOO_LARGE", null],
    ["request_id_reused", 409, "REQUEST_ID_REUSED", null],
    ["auditor_create", 403, "PERSON_NOT_AUTHORIZED", null],
  ])("%s is a definitive named refusal, value-free, sent once", async (name, status, code, reason) => {
    const upstream = answers(capture(name))
    const out = await createTerraformBinding(BODY)
    expect(out).toEqual({ kind: "REFUSED", status, code, reason })              // exactly these members: no value travels on
    expect(upstream).toHaveBeenCalledTimes(1)
  })
})

describe("an ended session is 'sign in again', never a resend", () => {
  it.each([
    ["the load balancer's redirect to the IdP", () => ({ type: "opaqueredirect", status: 0, headers: new Headers() }) as unknown as Response],
    ["an HTML page", () => new Response("<!doctype html><title>Sign in</title>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })],
    ["the backend's 401 without a token", () => {
      const c = capture("no_token")
      return new Response(JSON.stringify(c.body), { status: c.status, headers: { "content-type": c.content_type } })
    }],
  ])("%s", async (_name, make) => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(make())
    expect((await createTerraformBinding(BODY)).kind).toBe("SIGN_IN_AGAIN")
    expect(upstream).toHaveBeenCalledTimes(1)
  })
})

describe("no answer this client reads is UNKNOWN: the person may resend the SAME body", () => {
  it.each([
    ["the network failed", () => vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch")), "NETWORK_ERROR"],
    ["the proxy could not reach the backend", () => answers(new Response(JSON.stringify({ detail: { code: "AUTHORING_BACKEND_UNAVAILABLE" } }),
                                                                          { status: 502, headers: { "content-type": "application/json" } })),
     "AUTHORING_BACKEND_UNAVAILABLE"],
    ["a foreign contract", () => answers(mutatedBody("create", (b) => { b.contract = "terraform_workspace_binding_read/v2" })), "CONTRACT_UNKNOWN"],
    ["a malformed binding id", () => answers(mutatedBody("create", (b) => { b.binding_id = "not-a-uuid" })), "MALFORMED_RESPONSE"],
    ["malformed counts", () => answers(mutatedBody("create", (b) => { b.counts.resolution.resolved = -1 })), "MALFORMED_RESPONSE"],
    ["a whole answer served as non-JSON", () => answers(new Response(JSON.stringify(capture("create").body),
                                                                  { status: 201, headers: { "content-type": "text/plain" } })),
     "MALFORMED_RESPONSE"],
    ["a create answer at another revision", () => answers(mutatedBody("create", (b) => { b.revision = 2 })), "MALFORMED_RESPONSE"],
    ["a create answer with another member", () => answers(mutatedBody("create", (b) => { b.tenant = "t" })), "MALFORMED_RESPONSE"],
  ])("%s", async (_name, arm, code) => {
    const upstream = arm()
    const out = await createTerraformBinding(BODY)
    expect(out).toMatchObject({ kind: "UNKNOWN", code })
    expect(upstream).toHaveBeenCalledTimes(1)
  })
})

describe("read: the retained view", () => {
  it("reads an ACTIVE binding: the projection is exactly the genuine view", async () => {
    const c = capture("read")
    const upstream = answers(c)
    const out = await readTerraformBinding(BID)
    if (out.kind !== "OK") throw new Error(out.kind)
    expect(out.value).toEqual({ ...c.body.binding, revoked_at: null })
    expect([out.value.status, out.value.intake.channel, out.value.snapshot.provenance_class]).toEqual(["ACTIVE", "browser_reduced_upload", "uploaded"])
    expect(String((upstream.mock.calls[0] as [string])[0])).toBe(`/api/proxy/system-boundary/terraform-bindings/${BID}`)
  })

  it("reads a REVOKED binding with when: the projection is exactly the genuine view", async () => {
    const c = capture("read_revoked")
    answers(c)
    const out = await readTerraformBinding(BID)
    expect(out.kind === "OK" && out.value).toEqual(c.body.binding)
  })

  it.each([
    ["the answer names another binding", (b: any) => { b.binding.binding_id = "7fb10000-0000-4000-8000-0000000000aa" }],
    ["an extra member of the answer", (b: any) => { b.tenant = "t" }],
  ])("SW113 I2b-R2: %s is UNKNOWN, never OK", async (_name, change) => {
    answers(mutatedBody("read", change))
    expect(await readTerraformBinding(BID)).toMatchObject({ kind: "UNKNOWN", code: "MALFORMED_RESPONSE" })
  })

  it("SW113 I2b-R2: the genuine answer of one binding read as another's is UNKNOWN", async () => {
    answers(capture("read"))
    expect(await readTerraformBinding("7fb10000-0000-4000-8000-0000000000aa")).toMatchObject({ kind: "UNKNOWN", code: "MALFORMED_RESPONSE" })
  })

  it.each([
    ["snapshot.terraform_version an object", (v: any) => { v.snapshot.terraform_version = { secret: "REVIEW_FAKE_I2B" } }],
    ["snapshot.serial a fraction", (v: any) => { v.snapshot.serial = 1.5 }],
    ["snapshot.serial past the safe integers", (v: any) => { v.snapshot.serial = 2 ** 53 }],
    ["snapshot.profile_version negative", (v: any) => { v.snapshot.profile_version = -1 }],
    ["snapshot.format unknown", (v: any) => { v.snapshot.format = "plan_json" }],
    ["snapshot.provenance_class unknown", (v: any) => { v.snapshot.provenance_class = "imported" }],
    ["snapshot.content_digest not a digest", (v: any) => { v.snapshot.content_digest = "sha256:abc" }],
    ["snapshot with another member", (v: any) => { v.snapshot.outputs = {} }],
    ["intake.consent empty", (v: any) => { v.intake.consent = {} }],
    ["intake.consent with another member", (v: any) => { v.intake.consent.document_sha256 = "x" }],
    ["intake.consent by someone else", (v: any) => { v.intake.consent.confirmed_by = "https://acme.okta.test/oauth2/default#00u-mallory" }],
    ["intake.consent at another time", (v: any) => { v.intake.consent.confirmed_at = "2026-10-16T06:00:01.000000+00:00" }],
    ["intake.consent of another text", (v: any) => { v.intake.consent.text_version = "terraform_reduced_upload_consent/v0" }],
    ["intake.retained_fields one more", (v: any) => { v.intake.retained_fields.push("resource.tags") }],
    ["intake.retained_fields reordered", (v: any) => { v.intake.retained_fields.reverse() }],
    ["intake.claimed_source_digest not a digest", (v: any) => { v.intake.claimed_source_digest = "md5:abc" }],
    ["intake.reduction unknown", (v: any) => { v.intake.reduction = "none" }],
    ["intake with another member", (v: any) => { v.intake.document = "{}" }],
    ["intake absent", (v: any) => { delete v.intake }],
    ["an identity resolution unknown", (v: any) => { v.identities[0].resolution = "probably" }],
    ["an identity value an object", (v: any) => { v.identities[0].native_id = { password: "REVIEW_FAKE_I2B" } }],
    ["an identity without an address", (v: any) => { delete v.identities[0].address }],
    ["an identity with another member", (v: any) => { v.identities[0].tags = null }],
    ["a count past the safe integers", (v: any) => { v.counts.admission.instances = 2 ** 53 }],
    ["a count a string", (v: any) => { v.counts.resolution.resolved = "3" }],
    ["counts with another part", (v: any) => { v.counts.other = {} }],
    ["accounts_seen without the bound account", (v: any) => { v.accounts_seen = ["111111111111"] }],
    ["the workspace basis unknown", (v: any) => { v.workspace_identity.basis = "guessed" }],
    ["the workspace label untrimmed", (v: any) => { v.workspace_identity.value = " x" }],
    ["created_at in another spelling", (v: any) => { v.created_at = "2026-10-16T06:00:00Z" }],
    ["registration_id empty", (v: any) => { v.registration_id = "" }],
    ["the identities digest absent", (v: any) => { delete v.identities_digest }],
    ["an extra view member", (v: any) => { v.tenant = "t" }],
    ["an ACTIVE view naming a revocation", (v: any) => { v.revoked_at = "2026-10-16T06:00:00.000000+00:00" }],
  ])("SW113 I2b-R1: %s is MALFORMED_RESPONSE", async (_name, change) => {
    answers(mutatedBody("read", (b) => change(b.binding)))
    expect(await readTerraformBinding(BID)).toMatchObject({ kind: "UNKNOWN", code: "MALFORMED_RESPONSE" })
  })

  it.each([
    ["a REVOKED view without when", (b: any) => { delete b.binding.revoked_at }],
    ["a REVOKED view at a time in another spelling", (b: any) => { b.binding.revoked_at = "yesterday" }],
  ])("%s is MALFORMED_RESPONSE", async (_name, change) => {
    answers(mutatedBody("read_revoked", change))
    expect(await readTerraformBinding(BID)).toMatchObject({ kind: "UNKNOWN", code: "MALFORMED_RESPONSE" })
  })

  it("a binding this person may not see is BINDING_NOT_FOUND", async () => {
    answers(capture("not_found"))
    expect(await readTerraformBinding(BID)).toEqual({ kind: "REFUSED", status: 404, code: "BINDING_NOT_FOUND", reason: null })
  })
})

describe("revoke: one-way, at a revision", () => {
  it.each(["revoke", "revoke_replay"])("%s is OK", async (name) => {
    const upstream = answers(capture(name))
    const out = await revokeTerraformBinding(BID, "00000000-0000-4000-8000-0000000f0003", 1)
    expect(out).toEqual({ kind: "OK", status: 200, value: { binding_id: BID, revision: 1, status: "REVOKED", replayed: name === "revoke_replay" } })
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/proxy/system-boundary/terraform-bindings/${BID}/revoke`)
    expect(JSON.parse(init.body as string)).toEqual({ request_id: "00000000-0000-4000-8000-0000000f0003", base_revision: 1 })
  })

  it.each([
    ["the genuine answer of one binding, asked for another", "7fb10000-0000-4000-8000-0000000000aa", 1, (_b: any) => {}],
    ["the genuine answer at another revision than asked", BID, 2, (_b: any) => {}],
    ["an answer naming another binding", BID, 1, (b: any) => { b.binding_id = "7fb10000-0000-4000-8000-0000000000aa" }],
    ["an answer not REVOKED", BID, 1, (b: any) => { b.status = "ACTIVE" }],
    ["an answer with another member", BID, 1, (b: any) => { b.revoked_by = "x" }],
  ] as const)("SW113 I2b-R2: %s is UNKNOWN, never a revocation", async (_name, asked, base, change) => {
    answers(mutatedBody("revoke", change))
    expect(await revokeTerraformBinding(asked, "00000000-0000-4000-8000-0000000f0003", base)).toMatchObject({ kind: "UNKNOWN", code: "MALFORMED_RESPONSE" })
  })

  it.each([["revoke_revoked", "BINDING_REVOKED"], ["revoke_version_conflict", "VERSION_CONFLICT"]])("%s is refused by name", async (name, code) => {
    answers(capture(name))
    expect(await revokeTerraformBinding(BID, "00000000-0000-4000-8000-0000000f0004", 1)).toEqual({ kind: "REFUSED", status: 409, code, reason: null })
  })
})

describe("the captures are what the client is held to", () => {
  it("every success answer carries the contract the client reads", () => {
    for (const name of ["create", "create_show", "create_replay", "read", "read_revoked", "revoke", "revoke_replay"]) {
      expect(capture(name).body.contract).toBe(BINDING_CONTRACT)
    }
  })
})
