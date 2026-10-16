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
    ["a non-JSON answer", () => answers(new Response("ok", { status: 201, headers: { "content-type": "text/plain" } })), "MALFORMED_RESPONSE"],
  ])("%s", async (_name, arm, code) => {
    const upstream = arm()
    const out = await createTerraformBinding(BODY)
    expect(out).toMatchObject({ kind: "UNKNOWN", code })
    expect(upstream).toHaveBeenCalledTimes(1)
  })
})

describe("read: the retained view", () => {
  it("reads an ACTIVE binding with its intake", async () => {
    const upstream = answers(capture("read"))
    const out = await readTerraformBinding(BID)
    if (out.kind !== "OK") throw new Error(out.kind)
    expect([out.value.status, out.value.intake?.channel, out.value.snapshot.provenance_class]).toEqual(["ACTIVE", "browser_reduced_upload", "uploaded"])
    expect(out.value.identities).toHaveLength(3)
    expect(String((upstream.mock.calls[0] as [string])[0])).toBe(`/api/proxy/system-boundary/terraform-bindings/${BID}`)
  })

  it("reads a REVOKED binding with when", async () => {
    answers(capture("read_revoked"))
    const out = await readTerraformBinding(BID)
    expect(out.kind === "OK" && [out.value.status, typeof out.value.revoked_at]).toEqual(["REVOKED", "string"])
  })

  it.each([
    ["an ACTIVE view naming a revocation", "read", (b: any) => { b.binding.revoked_at = "2026-10-16T06:00:00.000000+00:00" }],
    ["a REVOKED view without one", "read_revoked", (b: any) => { delete b.binding.revoked_at }],
    ["an identity without an address", "read", (b: any) => { delete b.binding.identities[0].address }],
  ])("%s is MALFORMED_RESPONSE", async (_name, name, change) => {
    answers(mutatedBody(name, change))
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
