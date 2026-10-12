/**
 * Onboarding G2: the setup client (lib/system-boundary-setup.ts) over the REAL backend answers
 * (__tests__/fixtures/system-boundary-setup-captures/, pinned in its README), and the authoring proxy's eight setup routes
 * through the mounted route handlers -- exactly those, by method and path, nothing else under setup/.
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
  isStatus,
  isView,
  readAnswer,
  SETUP_STEPS,
  writeAnswer,
} from "@/lib/system-boundary-setup"

type Capture = { status: number; body: unknown; _provenance: { request: { method: string; path: string } } }

function capture(name: string): Capture {
  return JSON.parse(readFileSync(path.join(__dirname, "fixtures", "system-boundary-setup-captures", `${name}.json`), "utf8"))
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
    expect(writeAnswer({ status: 200, json: { setup_id: "x" } })).toMatchObject({ kind: "RESEND_SAME", code: "MALFORMED_RESPONSE" })
    expect(writeAnswer({ status: 503, json: { detail: { code: "OUTCOME_UNKNOWN" } } })).toMatchObject({ kind: "RESEND_SAME" })
  })

  it("reads: a draft, a finished setup, the status vector and the list; out of scope is a refusal, never empty", () => {
    for (const name of ["read_draft", "read_finished"]) expect(isView(capture(name).body), name).toBe(true)
    expect(readAnswer(raw(capture("read_draft")), isView).kind).toBe("OK")
    const status = readAnswer(raw(capture("status")), isStatus)
    expect(status.kind === "OK" && status.value.association?.state).toBe("CURRENT")
    expect(status.kind === "OK" && status.value.operations).toEqual([])
    const list = capture("list").body as { setups: unknown[] }
    expect(list.setups.length).toBe(1)
    expect(readAnswer(raw(capture("not_found")), isView)).toMatchObject({ kind: "REFUSED", status: 404, code: "SETUP_NOT_FOUND" })
    expect(readAnswer({ status: 200, json: { status: "DRAFT" } }, isView)).toMatchObject({ kind: "UNAVAILABLE", code: "MALFORMED_RESPONSE" })
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
