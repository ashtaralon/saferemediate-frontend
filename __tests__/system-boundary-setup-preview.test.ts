/**
 * Onboarding S1a (setup contract level 4): the draft-preview reader (lib/system-boundary-setup-preview.ts), the receipt's
 * preview pin and the preview-bearing Finish (lib/system-boundary-setup.ts), the LOSSLESS intent model
 * (lib/system-boundary-setup-intent.ts), the version-2 pending Finish (lib/system-boundary-setup-pending.ts) and the proxy's
 * preview route -- over the REAL backend answers (__tests__/fixtures/system-boundary-setup-preview-captures/, pinned in its
 * README) and, for an earlier-release tab, the REAL 1302a2e5 pending store (__tests__/fixtures/legacy/).
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://customer-backend.example" }))

import { GET } from "@/app/api/proxy/system-boundary/[...path]/route"
import { contentHash } from "@/lib/content-hash"
import {
  finishSetup,
  isPreviewPin,
  isView,
  readAnswer,
  SETUP_CONTRACT_UNKNOWN,
  writeAnswer,
  type SetupIntent,
  type SetupView,
} from "@/lib/system-boundary-setup"
import {
  coverageLimits,
  heldSentence,
  parsePreview,
  PREVIEW_CONTRACT_UNKNOWN,
  previewPath,
  previewSentence,
} from "@/lib/system-boundary-setup-preview"
import { bindsStack, draftDeclaration, loadIntent, stackBinding, withBoundary } from "@/lib/system-boundary-setup-intent"
import { opOf, pendingForSetup, setupPendingStore, type PendingSetupOp } from "@/lib/system-boundary-setup-pending"
import * as legacy from "./fixtures/legacy/system-boundary-setup-pending-1302a2e5"

type Capture = { status: number; cache_control: string | null; body: any }   // eslint-disable-line @typescript-eslint/no-explicit-any

function capture(name: string, dir = "system-boundary-setup-preview-captures"): Capture {
  return JSON.parse(readFileSync(path.join(__dirname, "fixtures", dir, `${name}.json`), "utf8"))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("the preview reader reads the REAL answers, and refuses anything else by name", () => {
  it("a computed preview: its identity binds its two digests, every account is read exactly, nothing is applied", () => {
    const answer = capture("preview")
    expect(answer.cache_control).toBe("no-store")
    const read = parsePreview(answer.status, answer.body)
    expect(read.kind).toBe("OK")
    if (read.kind !== "OK") return
    const p = read.value
    expect(p.state).toBe("COMPUTED")
    expect(p.previewDigest).toBe(contentHash({ basis_digest: p.basisDigest, result_digest: p.resultDigest }))
    expect(p.setup).toEqual({ setupId: answer.body.setup.setup_id, intentRevision: answer.body.setup.intent_revision,
                              stateVersion: answer.body.setup.state_version })
    expect(p.rules.a7).toBe("a7_rules_v2")
    const [account] = p.accounts
    expect(account.state).toBe("COMPUTED")
    expect(account.inventory.generation).toBe(1)
    // the person's exclusion is in the preview as itself, and every member names its proof
    expect(account.display!.lists.not_members.map((r) => r.reason)).toContain("EXCLUDED_BY_DECISION")
    expect(account.display!.lists.members.every((m) => typeof m.proof === "object")).toBe(true)
    expect(p.counts.members).toBe(account.counts!.members)
    expect(previewSentence(read)).toContain("Nothing is applied yet.")
  })

  it("a held preview names each account's reason and is said to be no whole answer", () => {
    const read = parsePreview(capture("preview_held").status, capture("preview_held").body)
    expect(read.kind === "OK" && read.value.state).toBe("HELD")
    if (read.kind !== "OK") return
    expect(read.value.accounts[0].reason).toMatch(/^CENSUS_NOT_SERVED:/)
    expect(heldSentence(read.value.accounts[0].reason)).toContain("census could not be read whole")
    expect(previewSentence(read)).toContain("cannot be finished")
  })

  it("pages are views of the SAME preview: each page names its digest and the next cursor, the last none", () => {
    const first = parsePreview(200, capture("preview_page").body)
    const next = parsePreview(200, capture("preview_page_next").body)
    expect(first.kind === "OK" && first.value.page?.entries.length).toBe(1)
    expect(first.kind === "OK" && typeof first.value.page?.next).toBe("string")
    expect(next.kind === "OK" && next.value.page?.next).toBeNull()
    expect(first.kind === "OK" && next.kind === "OK" && first.value.previewDigest === next.value.previewDigest).toBe(true)
    const other = structuredClone(capture("preview_page").body)
    other.page.preview_digest = capture("preview").body.preview_digest.replace(/.$/, (c: string) => (c === "0" ? "1" : "0"))
    expect(parsePreview(200, other)).toEqual({ kind: "UNAVAILABLE", status: 200, code: "MALFORMED_RESPONSE" })
    const stranger = structuredClone(capture("preview_page").body)    // an edit: a page of an account this preview does not have
    stranger.page.account_id = "999988887777"
    expect(parsePreview(200, stranger)).toEqual({ kind: "UNAVAILABLE", status: 200, code: "MALFORMED_RESPONSE" })
  })

  it("(S1A-UI-PREVIEW-03) a COMPUTED preview's coverage limits and unlisted rows are said; a complete one stays concise", () => {
    const complete = parsePreview(200, capture("preview").body)
    if (complete.kind !== "OK") throw new Error("expected OK")
    expect(coverageLimits(complete.value.accounts[0])).toEqual([])
    expect(previewSentence(complete)).not.toContain("limited")
    const partial = structuredClone(capture("preview").body)          // an edit: the documented coverage shape, limits supplied
    Object.assign(partial.accounts[0].coverage, { complete: false, incomplete_reason: "WORK_BUDGET_EXHAUSTED", partial: ["retirements"],
                                                   withheld: ["aws://aws/111122223333/eu-west-1/ec2/vpc/vpc-1"], frontier_count: 3 })
    partial.counts.unlisted = 1
    const read = parsePreview(200, partial)
    if (read.kind !== "OK") throw new Error("expected OK")
    expect(read.value.state).toBe("COMPUTED")
    expect(coverageLimits(read.value.accounts[0])).toEqual([
      "not completely planned (WORK_BUDGET_EXHAUSTED)", "partly planned: retirements",
      "1 withheld: aws://aws/111122223333/eu-west-1/ec2/vpc/vpc-1", "3 resource(s) at the edge of the plan were not followed"])
    expect(previewSentence(read)).toContain("but this preview is limited (1 account(s) not completely covered, 1 row(s) in no list")
    expect(previewSentence(read)).toContain("not a complete answer")
  })

  it("refusals are read by name: a stale version and a FINISHED setup are SETUP_STATE_CHANGED", () => {
    for (const name of ["preview_stale_version", "preview_finished"]) {
      const answer = capture(name)
      expect(answer.cache_control, name).toBe("no-store")
      expect(parsePreview(answer.status, answer.body)).toMatchObject({ kind: "REFUSED", status: 409, code: "SETUP_STATE_CHANGED" })
    }
  })

  it("anything not exactly this contract, or not what it claims, is unavailable -- never a guessed preview", () => {
    const body = capture("preview").body
    const tampered = (edit: (b: any) => void) => {                         // eslint-disable-line @typescript-eslint/no-explicit-any
      const b = structuredClone(body)
      edit(b)
      return parsePreview(200, b)
    }
    expect(tampered((b) => { b.setup_contract = "system_boundary_setup/v3" })).toMatchObject({ code: SETUP_CONTRACT_UNKNOWN })
    expect(tampered((b) => { b.contract = "system_boundary_setup_preview/v2" })).toMatchObject({ code: PREVIEW_CONTRACT_UNKNOWN })
    expect(tampered((b) => { b.result_digest = b.basis_digest })).toMatchObject({ code: "MALFORMED_RESPONSE" })
    expect(tampered((b) => { b.accounts[0].state = "HELD" })).toMatchObject({ code: "MALFORMED_RESPONSE" })
    expect(tampered((b) => { b.accounts[0].display.members.pop() })).toMatchObject({ code: "MALFORMED_RESPONSE" })
    expect(tampered((b) => { b.counts.unlisted = -1 })).toMatchObject({ code: "MALFORMED_RESPONSE" })
    expect(parsePreview(null, undefined)).toEqual({ kind: "UNAVAILABLE", status: null, code: "NETWORK_ERROR" })
  })
})

describe("a Finish names the preview reviewed; its receipt pins it", () => {
  it("the REAL pinned Finish, its replay and the finished read carry exactly that preview's pin", () => {
    const seen = capture("preview").body.preview_digest
    const done = writeAnswer({ status: capture("finish").status, json: capture("finish").body })
    expect(done.kind).toBe("SAVED")
    if (done.kind !== "SAVED") return
    expect(isPreviewPin(done.view.receipt!.preview)).toBe(true)
    expect(done.view.receipt!.preview!.preview_digest).toBe(seen)
    const replay = writeAnswer({ status: 200, json: capture("finish_replay").body })
    expect(replay.kind === "SAVED" && replay.view.receipt!.preview).toEqual(done.view.receipt!.preview)
    const read = readAnswer({ status: 200, json: capture("read_finished").body }, isView)
    expect(read.kind === "OK" && read.value.receipt!.preview).toEqual(done.view.receipt!.preview)
    const forged = structuredClone(capture("finish").body)
    forged.receipt.preview.applied = true                                  // a pin is exactly its fields: never more
    expect(isView(forged)).toBe(false)
  })

  it("the preview refusals of a Finish are REFUSED by name, never resent", () => {
    for (const [name, code] of [["finish_preview_required", "PREVIEW_REQUIRED"], ["finish_preview_changed", "PREVIEW_CHANGED"],
                                ["finish_not_computed", "PREVIEW_NOT_COMPUTED"], ["finish_input_changed", "PREVIEW_INPUT_CHANGED"]]) {
      const answer = capture(name)
      expect(writeAnswer({ status: answer.status, json: answer.body }), name).toMatchObject({ kind: "REFUSED", status: 409, code })
    }
    // PREVIEW_INPUT_CHANGED returned the setup to DRAFT through the definitive refusal: read back, a draft at a new version
    const after = readAnswer({ status: 200, json: capture("read_after_input_changed").body }, isView)
    expect(after.kind === "OK" && after.value.status).toBe("DRAFT")
    expect(after.kind === "OK" && after.value.outcome?.code).toBe("PREVIEW_INPUT_CHANGED")
  })

  it("(S1A-UI-LIFECYCLE-01) a refusal the backend did NOT record is unresolved -- resent, never settled; recorded and pre-attempt ones are definitive", () => {
    const unrecorded = capture("finish_input_changed_unrecorded")
    expect(unrecorded.body.detail.setup).toEqual({ attempt: 1, recorded: false, status: "FINISHING", not_recorded_because: "GRANT_REVOKED" })
    expect(writeAnswer({ status: unrecorded.status, json: unrecorded.body })).toMatchObject(
      { kind: "RESEND_SAME", status: 409, code: "PREVIEW_INPUT_CHANGED" })
    const recorded = capture("finish_input_changed")
    expect(recorded.body.detail.setup.recorded).toBe(true)
    expect(writeAnswer({ status: recorded.status, json: recorded.body })).toMatchObject({ kind: "REFUSED", code: "PREVIEW_INPUT_CHANGED" })
    for (const name of ["finish_preview_required", "finish_preview_changed", "finish_not_computed"]) {   // before any attempt
      expect(capture(name).body.detail.setup, name).toBeUndefined()
      expect(writeAnswer({ status: 409, json: capture(name).body }).kind, name).toBe("REFUSED")
    }
    const read = readAnswer({ status: 200, json: capture("read_finishing_unrecorded").body }, isView)
    expect(read.kind === "OK" && read.value.status).toBe("FINISHING")
  })

  it("finishSetup sends the digest only when given: a Finish without one is the request it always was", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ detail: { code: "PREVIEW_REQUIRED" } },
                                                                                   { status: 409 }))
    const sid = "5e7a0000-0000-4000-8000-000000000001"
    const rid = "00000000-0000-4000-8000-000000005101"
    await finishSetup(sid, rid, 2)
    await finishSetup(sid, rid, 2, `v1:${"a".repeat(64)}`)
    const bodies = upstream.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    expect(bodies).toEqual([{ request_id: rid, base_state_version: 2 },
                            { request_id: rid, base_state_version: 2, preview_digest: `v1:${"a".repeat(64)}` }])
  })
})

describe("the intent is read and written LOSSLESSLY", () => {
  const intentOf = (name: string, dir = "system-boundary-setup-preview-captures"): SetupIntent =>
    (capture(name, dir).body as SetupView).intent

  it("a binding, the person's exclusion, no roots key and the saved scopes come back exactly as saved", () => {
    const intent = intentOf("read_draft")
    expect(Object.keys(intent.declaration!).sort()).toEqual(["bindings", "deployment", "resource_decisions", "system"])
    const loaded = loadIntent(intent)
    expect(loaded.kind).toBe("ok")
    if (loaded.kind !== "ok") return
    expect(draftDeclaration(loaded.local)).toEqual(intent.declaration)
    expect(loaded.local.decisions.map((d) => d.verdict)).toEqual(["exclude"])
    expect(bindsStack(intent)).toBe(true)
  })

  it("a roots-only draft of the earlier releases comes back exactly too, and a fresh setup is the shape it always got", () => {
    const draft = intentOf("read_draft", "system-boundary-setup-captures-v4")
    const loaded = loadIntent(draft)
    expect(loaded.kind === "ok" && draftDeclaration(loaded.local)).toEqual(draft.declaration)
    expect(bindsStack(draft)).toBe(false)
    const fresh = loadIntent(intentOf("create", "system-boundary-setup-captures-v4"))
    expect(fresh.kind === "ok" && draftDeclaration(fresh.local)).toEqual(
      { system: { mode: "new" }, deployment: { mode: "new", scopes: [] }, roots: [] })
  })

  it("saved scopes are never recomputed on resume; a change of roots, binding or decisions recomputes them", () => {
    const intent = structuredClone(intentOf("read_draft"))
    const deployment = intent.declaration!.deployment as { scopes: { account_id: string; region: string }[] }
    deployment.scopes = [...deployment.scopes, { account_id: deployment.scopes[0].account_id, region: "us-east-1" }]
    const loaded = loadIntent(intent)
    if (loaded.kind !== "ok") throw new Error("expected ok")
    expect(draftDeclaration(loaded.local)).toEqual(intent.declaration)                    // kept, though no record needs it
    const changed = withBoundary(loaded.local, { decisions: [] })
    expect((draftDeclaration(changed).deployment as { scopes: unknown }).scopes).toEqual(
      [{ account_id: deployment.scopes[0].account_id, region: loaded.local.bindings[0].region }])
  })

  it("an unedited value is kept exactly; an edited one is normalized", () => {
    const intent = structuredClone(intentOf("read_draft"))
    ;(intent.declaration!.system as Record<string, unknown>).display_name = " Payments "
    const loaded = loadIntent(intent)
    if (loaded.kind !== "ok") throw new Error("expected ok")
    expect((draftDeclaration(loaded.local).system as Record<string, unknown>).display_name).toBe(" Payments ")
    const edited = draftDeclaration({ ...loaded.local, displayName: " Payments  2 " })
    expect((edited.system as Record<string, unknown>).display_name).toBe("Payments  2")
    expect((draftDeclaration({ ...loaded.local, criticality: "" }).system as Record<string, unknown>).criticality).toBeUndefined()
  })

  it("a key this release does not know is SETUP_CONTRACT_UNKNOWN, never dropped", () => {
    const base = intentOf("read_draft")
    const cases: [string, (i: any) => void][] = [                         // eslint-disable-line @typescript-eslint/no-explicit-any
      ["declaration.deployments", (i) => { i.declaration.deployments = [] }],
      ["declaration.system.owner", (i) => { i.declaration.system.owner = "x" }],
      ["declaration.system.mode", (i) => { i.declaration.system.mode = "ref" }],
      ["declaration.deployment.scopes.deployment", (i) => { i.declaration.deployment.scopes[0].deployment = "prod" }],
      ["dispositions.scope.deployment", (i) => { i.dispositions[0].scope.deployment = "prod" }],
      ["correction", (i) => { i.correction = {} }],
    ]
    for (const [at, edit] of cases) {
      const intent = structuredClone(base)
      edit(intent)
      expect(loadIntent(intent), at).toEqual({ kind: "unknown", code: SETUP_CONTRACT_UNKNOWN, at })
    }
  })

  it("a stack the census lists becomes an exclusive binding of what the person saw; a stack already bound keeps its kind", () => {
    const stack = { stack_id: "arn:aws:cloudformation:eu-west-1:111122223333:stack/shop/x", region: "eu-west-1",
                    stack_status: "UPDATE_COMPLETE", census: { generation: 3, source_identity: `v1:${"b".repeat(64)}` } }
    const binding = stackBinding("111122223333", stack)
    expect(binding).toEqual({ account_id: "111122223333", region: "eu-west-1", stack_id: stack.stack_id, kind: "exclusive",
                              selection: { census: stack.census, stack_status: "UPDATE_COMPLETE" } })
    expect(stackBinding("111122223333", stack, { ...binding, kind: "several_systems" }).kind).toBe("several_systems")
  })
})

describe("a preview-bearing Finish is a version-2 pending operation; version 1 is unchanged", () => {
  const SID = "5e7a0000-0000-4000-8000-000000000001"
  const DIGEST = `v1:${"c".repeat(64)}`
  const common = { actor: "idp#alice", accountId: "111122223333", startedAt: "2026-10-13T00:00:00.000Z", setupId: SID, base: 2 }
  const v2 = { version: 2 as const, kind: "finish" as const, ...common, requestId: "00000000-0000-4000-8000-000000000201", previewDigest: DIGEST }
  const v1 = { version: 1 as const, kind: "finish" as const, ...common, requestId: "00000000-0000-4000-8000-000000000101" }

  function storage(): Storage {
    const items = new Map<string, string>()
    return {
      get length() { return items.size },
      key: (i: number) => [...items.keys()][i] ?? null,
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => { items.set(k, v) },
      removeItem: (k: string) => { items.delete(k) },
      clear: () => items.clear(),
    }
  }

  it("version 2 is read only whole and exact; a digest is never an optional field of version 1", () => {
    expect(opOf(v2)).toEqual(v2)
    expect(opOf(v1)).toEqual(v1)
    const { previewDigest: _gone, ...noDigest } = v2
    expect(opOf(noDigest)).toBeNull()
    expect(opOf({ ...v2, extra: 1 })).toBeNull()
    expect(opOf({ ...v2, kind: "update", steps: { dispositions: [], resume_step: "review_and_start" } })).toBeNull()
    expect(opOf({ ...v2, previewDigest: "v1:short" })).toBeNull()
    expect(opOf({ ...v1, previewDigest: DIGEST })).toBeNull()
    expect(opOf({ ...v2, version: 3 })).toBeNull()
  })

  it("settlement is by the exact tuple, version included: another version under the same request id stays", () => {
    const s = storage()
    const store = setupPendingStore(s, new Map())
    expect(store.put(v2)).toBe("storage")
    const sameIdV1: PendingSetupOp = { ...v1, requestId: v2.requestId }
    store.remove(sameIdV1)                                                    // not this tuple: nothing settled
    expect(store.read()).toEqual([v2])
    store.remove(v2)
    expect(store.read()).toEqual([])
  })

  it("a cached 1302a2e5 tab never resends or settles a version-2 record; this release resends it exactly", () => {
    const s = storage()
    setupPendingStore(s, new Map()).put(v2)
    const old = legacy.setupPendingStore(s, new Map())
    expect(old.read()).toEqual([])                                          // read as nothing...
    expect(legacy.pendingForSetup(old.read(), common.actor, common.accountId, SID)).toBeNull()
    old.remove({ version: 1, kind: "finish", ...common, requestId: v2.requestId })
    expect(old.where(v2.requestId)).toBeNull()
    const now = setupPendingStore(s, new Map())                               // ...and never settled
    expect(pendingForSetup(now.read(), common.actor, common.accountId, SID)).toEqual(v2)
  })

  it("an outstanding version-1 Finish is offered as kept -- version 1, no digest -- never upgraded", () => {
    const s = storage()
    legacy.setupPendingStore(s, new Map()).put(v1)                            // written by the earlier release
    const now = setupPendingStore(s, new Map())
    const offered = pendingForSetup(now.read(), common.actor, common.accountId, SID)
    expect(offered).toEqual(v1)
    expect(offered && "previewDigest" in offered).toBe(false)
  })
})

describe("the authoring proxy's preview route: one saved version, one list page, nothing else", () => {
  const APP = "https://app.example/api/proxy/system-boundary"
  const UPSTREAM = "https://customer-backend.example/api/system-boundary"
  const SID = "5e7a0000-0000-4000-8000-000000000001"
  const get = (suffix: string) => {
    const request = new NextRequest(`${APP}/${suffix}`, { method: "GET" })
    request.headers.set("sec-fetch-site", "same-origin")
    return GET(request)
  }

  it("previewPath names exactly the route the proxy forwards, with its query", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ ok: true }))
    const cursor = "e".repeat(3000)
    for (const [suffix, query] of [
      [previewPath(SID, 2).slice("/api/proxy/system-boundary/".length), { state_version: "2" }],
      [previewPath(SID, 2, { accountId: "111122223333", bucket: "members", cursor }).slice("/api/proxy/system-boundary/".length),
       { state_version: "2", account_id: "111122223333", bucket: "members", cursor }],
    ] as const) {
      upstream.mockClear()
      const response = await get(suffix)
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toBe("no-store")
      const forwarded = new URL(String(upstream.mock.calls[0][0]))
      expect(`${forwarded.origin}${forwarded.pathname}`).toBe(`${UPSTREAM}/setup/${SID}/preview`)
      expect(Object.fromEntries(forwarded.searchParams)).toEqual(query)
    }
  })

  it.each([
    ["a state version that is not a number", `setup/${SID}/preview?state_version=x`],
    ["a list the preview does not have", `setup/${SID}/preview?state_version=2&bucket=everything`],
    ["a query name the route does not take", `setup/${SID}/preview?state_version=2&limit=1&other=1`],
    ["a cursor past its bound", `setup/${SID}/preview?state_version=2&cursor=${"e".repeat(4097)}`],
  ])("%s is refused here, nothing forwarded", async (_label, suffix) => {
    const upstream = vi.spyOn(globalThis, "fetch")
    expect((await get(suffix)).status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })
})
