/**
 * S1b FE-C1: the paired readers over the backend's REAL level-5 / v2 answers -- the setup view and status (plural intent,
 * plural receipt, ``result_scope`` v2), the draft preview v2 (with its late-HELD diagnostic), the served result v2, the
 * receipt-bound per-Deployment explanation of a Finish and the consolidated account assessment (agreed A7 reading A).
 *
 * Captures: __tests__/fixtures/system-boundary-setup-preview-captures-v5/, system-boundary-setup-captures-v5/ and
 * system-boundary-result-captures-v2/, each pinned to saferemediate-backend fff8cdac in its README. Every negative case is
 * one field of a real answer changed; nothing else is written by hand.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  assess, assessmentWithheldSentence, deploymentLine, DRAFT_DEPLOYMENT_VERSION, remainderLines,
} from "@/lib/system-boundary-assessment"
import { pairDeployments } from "@/lib/system-boundary-deployment-context"
import { finishExplanation, finishExplanationWithheldSentence, type Pairing } from "@/lib/system-boundary-finish-result"
import { parseResultResponse, RESULT_CONTRACT, RESULT_CONTRACT_V2, type ResultServed } from "@/lib/system-boundary-result"
import {
  intentDeploymentKeys, isPluralIntent, isStatus, isView, pinnedDeployments, readAnswer, SETUP_CONTRACT_UNKNOWN,
  type SetupView,
} from "@/lib/system-boundary-setup"
import {
  parsePreview, PREVIEW_CONTRACT, PREVIEW_CONTRACT_UNKNOWN, PREVIEW_CONTRACT_V2, previewAuthorizesFinish, type Preview,
} from "@/lib/system-boundary-setup-preview"

type Capture = { status: number; body: any; _provenance: any }   // eslint-disable-line @typescript-eslint/no-explicit-any
const read = (dir: string, name: string): Capture =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", dir, `${name}.json`), "utf8"))
const PREVIEWS = "system-boundary-setup-preview-captures-v5"
const SETUPS = "system-boundary-setup-captures-v5"
const RESULTS = "system-boundary-result-captures-v2"
const malformed = (status = 200) => ({ kind: "UNAVAILABLE", status, code: "MALFORMED_RESPONSE" })

const preview = (name: string): Preview => {
  const c = read(PREVIEWS, name)
  const parsed = parsePreview(c.status, c.body)
  if (parsed.kind !== "OK") throw new Error(`${name}: ${JSON.stringify(parsed)}`)
  return parsed.value
}
const view = (dir: string, name: string): SetupView => {
  const c = read(dir, name)
  const answer = readAnswer({ status: c.status, json: c.body }, isView)
  if (answer.kind !== "OK") throw new Error(`${name}: ${JSON.stringify(answer)}`)
  return answer.value
}
const result = (name: string) => {
  const c = read(RESULTS, name)
  return { capture: c, parsed: parseResultResponse(c.status, c.body, String(c._provenance.request.params.account_id)) }
}

describe("the setup view and status at level 5", () => {
  it("reads the plural draft, its finished receipt and its status; pairs each Deployment with what the receipt pinned (A3)", () => {
    for (const dir of [PREVIEWS, SETUPS]) {
      const draft = view(dir, "plural_read_draft")
      expect(isPluralIntent(draft.intent)).toBe(true)
      expect(intentDeploymentKeys(draft.intent)).toEqual(["prod", "staging"])
      const finished = view(dir, "plural_read_finished")
      const association = finished.receipt!.association.deployments
      expect(finished.result_scope).toEqual({ v: 2, state: "SERVED", accounts: finished.accounts_seen, from: association })
      expect(pinnedDeployments(finished)).toEqual([
        { deploymentKey: "prod", ...association[0] }, { deploymentKey: "staging", ...association[1] }])
      const status = read(dir, "plural_status")
      expect(readAnswer({ status: status.status, json: status.body }, isStatus).kind).toBe("OK")
    }
  })

  it("refuses every plural shape from an answer tagged level 4 -- the intent, a Deployment-scoped disposition, a v2 scope", () => {
    const finished = read(PREVIEWS, "plural_read_finished").body
    const status = read(PREVIEWS, "plural_status").body
    expect(readAnswer({ status: 200, json: { ...finished, contract: "system_boundary_setup/v4" } }, isView)).toEqual(malformed())
    expect(readAnswer({ status: 200, json: { ...status, contract: "system_boundary_setup/v4" } }, isStatus)).toEqual(malformed())
    // the single journey's level-5 view still reads -- and tagged level 4, exactly as it always did
    const single = read(SETUPS, "read_finished").body
    expect(readAnswer({ status: 200, json: single }, isView).kind).toBe("OK")
    expect(readAnswer({ status: 200, json: { ...single, contract: "system_boundary_setup/v4" } }, isView).kind).toBe("OK")
    expect(readAnswer({ status: 200, json: { ...single, contract: "system_boundary_setup/v6" } }, isView))
      .toEqual({ kind: "UNAVAILABLE", status: 200, code: SETUP_CONTRACT_UNKNOWN })
  })

  it("binds result_scope v2 EXACTLY to the receipt's pinned Deployments and the setup's own accounts", () => {
    const body = read(PREVIEWS, "plural_read_finished").body
    const from = body.result_scope.from
    const scoped = (scope: unknown) => readAnswer({ status: 200, json: { ...body, result_scope: scope } }, isView).kind
    expect(scoped(body.result_scope)).toBe("OK")
    expect(scoped({ ...body.result_scope, from: [...from].reverse() })).toBe("UNAVAILABLE")             // another order
    expect(scoped({ ...body.result_scope, from: from.slice(0, 1) })).toBe("UNAVAILABLE")                 // one missing
    expect(scoped({ ...body.result_scope, from: [from[0], { ...from[1], version: 2 }] })).toBe("UNAVAILABLE")   // another version
    expect(scoped({ ...body.result_scope, accounts: ["999999999999"] })).toBe("UNAVAILABLE")             // not this setup's
    expect(scoped({ v: 1, state: "SERVED", accounts: body.result_scope.accounts, from: from[0] })).toBe("UNAVAILABLE")
    expect(scoped({ v: 2, state: "UNAVAILABLE", reason: "DEPLOYMENT_HISTORY_INVALID", from, failed: from[1] })).toBe("OK")
    expect(scoped({ v: 2, state: "UNAVAILABLE", reason: "DEPLOYMENT_HISTORY_INVALID", from, failed: { ...from[1], version: 9 } }))
      .toBe("UNAVAILABLE")                                                                              // failed: not one of them
    const status = read(PREVIEWS, "plural_status").body
    const statusScoped = (scope: unknown) => readAnswer({ status: 200, json: { ...status, result_scope: scope } }, isStatus).kind
    expect(statusScoped(status.result_scope)).toBe("OK")
    expect(statusScoped({ ...status.result_scope, from: [...from].reverse() })).toBe("UNAVAILABLE")
  })
})

describe("the draft preview v1 / v2", () => {
  it("reads the plural preview v2: every draft Deployment, and each account's decoration whole", () => {
    const p = preview("plural_preview")
    expect([p.contract, p.state, p.deploymentId, p.deploymentIds.length]).toEqual([PREVIEW_CONTRACT_V2, "COMPUTED", null, 2])
    const [account] = p.accounts
    expect(account.deploymentContext).toEqual({ state: "SERVED", members: account.counts!.members })
    expect(account.display!.lists.members.every((m) => m.deployment_context !== undefined)).toBe(true)
    expect(previewAuthorizesFinish(p)).toBe(true)
    const page = preview("plural_preview_page")
    expect(page.page!.entries.length).toBeGreaterThan(0)
    expect(page.page!.entries.every((e) => e.deployment_context !== undefined)).toBe(true)
  })

  it("reads v1 under setup level 4 or 5, and v2 only under level 5", () => {
    const legacy = read("system-boundary-setup-preview-captures", "preview")
    expect(legacy.body.setup_contract).toBe("system_boundary_setup/v4")
    expect(parsePreview(legacy.status, legacy.body)).toMatchObject({ kind: "OK", value: { contract: PREVIEW_CONTRACT } })
    const single = read(PREVIEWS, "preview")
    expect(parsePreview(single.status, single.body)).toMatchObject({ kind: "OK", value: { contract: PREVIEW_CONTRACT } })
    const plural = read(PREVIEWS, "plural_preview").body
    expect(parsePreview(200, { ...plural, setup_contract: "system_boundary_setup/v4" }))
      .toEqual({ kind: "UNAVAILABLE", status: 200, code: PREVIEW_CONTRACT_UNKNOWN })
    expect(parsePreview(200, { ...plural, setup_contract: "system_boundary_setup/v6" }))
      .toEqual({ kind: "UNAVAILABLE", status: 200, code: SETUP_CONTRACT_UNKNOWN })
    expect(parsePreview(200, { ...plural, contract: "system_boundary_setup_preview/v3" }))
      .toEqual({ kind: "UNAVAILABLE", status: 200, code: PREVIEW_CONTRACT_UNKNOWN })
  })

  it("refuses a v2 preview whose targets, accounts or contexts are not exactly this draft's", () => {
    const body = read(PREVIEWS, "plural_preview").body
    const ids: string[] = body.draft_targets.deployment_ids
    const account = body.accounts[0]
    const members: any[] = account.display.members   // eslint-disable-line @typescript-eslint/no-explicit-any
    const withTargets = (t: unknown) => parsePreview(200, { ...body, draft_targets: t })
    const withAccount = (a: unknown) => parsePreview(200, { ...body, accounts: [a] })
    const withMembers = (m: unknown[], extra: Record<string, unknown> = {}) =>
      withAccount({ ...account, ...extra, display: { ...account.display, members: m, ...extra } })
    expect(withTargets(body.draft_targets).kind).toBe("OK")
    expect(withTargets({ ...body.draft_targets, deployment_id: ids[0] })).toEqual(malformed())
    expect(withTargets({ ...body.draft_targets, deployment_ids: [] })).toEqual(malformed())
    expect(withTargets({ ...body.draft_targets, deployment_ids: [ids[0], ids[0]] })).toEqual(malformed())
    expect(withTargets({ ...body.draft_targets, deployment_ids: [ids[0], "authored_deployment:x"] })).toEqual(malformed())
    // a COMPUTED v2 account without its decoration; the account's and its display's disagreeing
    const { deployment_context_state: _gone, ...undecorated } = account
    expect(withAccount(undecorated)).toEqual(malformed())
    expect(withAccount({ ...account, deployment_context_state: { state: "SERVED", members: members.length + 1 } })).toEqual(malformed())
    expect(withAccount({ ...account, display: { ...account.display, deployment_context_state: { state: "UNAVAILABLE",
      reason: "PLANNER_INPUTS_UNAVAILABLE", detail: {} } } })).toEqual(malformed())
    // a member without its context; one naming a Deployment that is not this draft's; a context under a withheld decoration
    const { deployment_context: _context, ...bare } = members[0]
    expect(withMembers([bare, ...members.slice(1)])).toEqual(malformed())
    const foreign = `DEPLOYMENT#authored_deployment:${"f".repeat(64)}`
    expect(withMembers([{ ...members[0], deployment_context: { resolution: "SINGLE", deployments: [{ key: foreign, version: 1 }] } },
                        ...members.slice(1)])).toEqual(malformed())
    const withheld = { state: "UNAVAILABLE", reason: "PLANNER_INPUTS_UNAVAILABLE", detail: {} }
    expect(withMembers(members, { deployment_context_state: withheld })).toEqual(malformed())
    const stripped = members.map(({ deployment_context: _c, ...m }) => m)
    expect(withMembers(stripped, { deployment_context_state: withheld })).toMatchObject({ kind: "OK" })
    // the v1 preview carries no decoration anywhere
    const single = read(PREVIEWS, "preview").body
    expect(parsePreview(200, { ...single, accounts: [{ ...single.accounts[0], deployment_context_state: account.deployment_context_state }] }))
      .toEqual(malformed())
  })

  // Isolating controls (FE mutants M08 / M09): each answer below fails ONE rule only -- every context still names a draft
  // Deployment, and no member carries a context the account does not -- so only that rule can refuse it.
  it("refuses a repeated draft Deployment id even when every context names a draft Deployment", () => {
    const body = read(PREVIEWS, "plural_preview").body
    const ids: string[] = body.draft_targets.deployment_ids
    expect(parsePreview(200, { ...body, draft_targets: { ...body.draft_targets, deployment_ids: [...ids, ids[1]] } })).toEqual(malformed())
  })

  it("refuses a COMPUTED v2 account that carries no decoration at all (account, display and members alike)", () => {
    const body = structuredClone(read(PREVIEWS, "plural_preview").body)
    const account = body.accounts[0]
    delete account.deployment_context_state
    delete account.display.deployment_context_state
    for (const m of account.display.members) delete m.deployment_context
    expect(parsePreview(200, body)).toEqual(malformed())
    // held WITH its rows (assembled, then held) it still needs one; held BEFORE its rows (no counts, display or coverage --
    // the backend's held-before-assembly account) it carries none, and is read
    const held = structuredClone(body)
    held.state = "HELD"
    held.accounts[0] = { ...held.accounts[0], state: "HELD", reason: "CENSUS_NOT_SERVED:stale" }
    expect(parsePreview(200, held)).toEqual(malformed())
    const { counts: _c, display: _d, coverage: _v, ...early } = held.accounts[0]
    expect(parsePreview(200, { ...held, accounts: [{ ...early, reason: "READ_HELD" }] }))
      .toMatchObject({ kind: "OK", value: { state: "HELD" } })
  })

  it("refuses a page whose entries do not carry contexts exactly as its account's decoration says", () => {
    const body = read(PREVIEWS, "plural_preview_page").body
    const entries: any[] = body.page.entries   // eslint-disable-line @typescript-eslint/no-explicit-any
    const paged = (e: unknown[], bucket = "members") => parsePreview(200, { ...body, page: { ...body.page, entries: e, bucket } })
    expect(paged(entries).kind).toBe("OK")
    expect(paged(entries.map(({ deployment_context: _c, ...e }) => e))).toEqual(malformed())
    expect(paged(entries, "dependencies")).toEqual(malformed())
  })

  it("keeps a late-held account's context as a diagnostic: the OUTER HELD authorizes no Finish (C3e late census hold)", () => {
    const p = preview("plural_preview_held")
    const [account] = p.accounts
    expect([p.state, account.state, account.reason]).toEqual(["HELD", "HELD", "CENSUS_NOT_SERVED:stale"])
    expect(account.deploymentContext).toEqual({ state: "SERVED", members: 0 })       // nested SERVED, members 0
    expect(previewAuthorizesFinish(p)).toBe(false)
    const a = assess(p, ["prod", "staging"])
    expect(a.finishable).toBe(false)
    expect(a.accounts[0]).toMatchObject({ assessed: false, heldReason: "CENSUS_NOT_SERVED:stale", explanation: null,
                                          withheld: "ACCOUNT_NOT_ASSESSED" })
    // a held account in a COMPUTED preview is not a preview this reader reads
    const body = read(PREVIEWS, "plural_preview_held").body
    expect(parsePreview(200, { ...body, state: "COMPUTED" })).toEqual(malformed())
  })
})

describe("the consolidated account assessment (A7 reading A)", () => {
  it("names each Deployment's own members from the producer's own placement: shop -> prod, api -> staging", () => {
    // tests/cyntro_data/test_system_boundary_preview_cf.py _plural_declaration: prod rests on the "shop" stack (its instance
    // i-1, its SG and its role), staging on the "api" stack (instance i-2).
    const p = preview("plural_preview")
    const a = assess(p, ["staging", "prod"])                  // the intent's order is not the pairing order
    expect(a.deployments!.map((d) => d.deploymentKey)).toEqual(["prod", "staging"])
    expect(a.deployments!.every((d) => d.version === DRAFT_DEPLOYMENT_VERSION)).toBe(true)
    const [account] = a.accounts
    expect(account.assessed).toBe(true)
    const [prod, staging] = account.explanation!.deployments
    expect(prod.single.map((u) => u.split("/").pop()).sort()).toEqual(["app-role", "i-1", "sg-1"])
    expect(staging.single.map((u) => u.split("/").pop())).toEqual(["i-2"])
    expect([prod.shared, staging.shared, account.explanation!.systemLevel, account.explanation!.foreign]).toEqual([[], [], [], []])
    expect(account.counts!.members).toBe(4)                   // the backend's unique count, not a per-Deployment sum
    expect(a.finishable).toBe(true)
  })

  it("says a shared member as shared -- MULTIPLE and MIXED -- and a System-level one apart, never as one Deployment's own", () => {
    // Every real context is SINGLE; three members' contexts are edited here, each to another valid resolution, and the
    // account's decoration stays whole (every listed member still carries one).
    const body = structuredClone(read(PREVIEWS, "plural_preview").body)
    const ids: string[] = body.draft_targets.deployment_ids
    const [prodKey, stagingKey] = ids.map((id) => `DEPLOYMENT#${id}`)
    const members: any[] = body.accounts[0].display.members   // eslint-disable-line @typescript-eslint/no-explicit-any
    const byName = (suffix: string) => members.find((m) => m.resource_uid.endsWith(suffix))
    byName("sg-1").deployment_context = { resolution: "MULTIPLE", deployments: [prodKey, stagingKey].sort().map((key) => ({ key, version: 1 })) }
    byName("app-role").deployment_context = { resolution: "MIXED", deployments: [{ key: prodKey, version: 1 }] }
    byName("i-2").deployment_context = { resolution: "SYSTEM_LEVEL", deployments: [] }
    body.accounts[0].deployment_context_state = body.accounts[0].display.deployment_context_state
    const parsed = parsePreview(200, body)
    if (parsed.kind !== "OK") throw new Error(JSON.stringify(parsed))
    const [account] = assess(parsed.value, ["prod", "staging"]).accounts
    const [prod, staging] = account.explanation!.deployments
    expect(prod.single.map((u) => u.split("/").pop())).toEqual(["i-1"])
    expect(prod.shared.map((s) => [s.uid.split("/").pop(), s.resolution]).sort()).toEqual([["app-role", "MIXED"], ["sg-1", "MULTIPLE"]])
    expect(staging.single).toEqual([])
    expect(staging.shared.map((s) => [s.uid.split("/").pop(), s.resolution])).toEqual([["sg-1", "MULTIPLE"]])
    expect(account.explanation!.systemLevel.map((u) => u.split("/").pop())).toEqual(["i-2"])
    expect(deploymentLine(prod)).toBe("prod: 1 member(s) of its own; 1 shared with another Deployment; 1 also reached from the System as a whole.")
    expect(remainderLines(account.explanation!)).toEqual(["1 member(s) belong to the System as a whole, not to one Deployment."])
  })

  it("withholds an account's explanation when a context names a draft Deployment at another version (FE mutant M22)", () => {
    // an edit: one member's context names its (draft) Deployment at version 2 -- the reader admits it (the key is the
    // draft's), and only the assessment's own version rule withholds it
    const body = structuredClone(read(PREVIEWS, "plural_preview").body)
    body.accounts[0].display.members[0].deployment_context.deployments[0].version = 2
    const parsed = parsePreview(200, body)
    if (parsed.kind !== "OK") throw new Error(JSON.stringify(parsed))
    expect(assess(parsed.value, ["prod", "staging"]).accounts[0]).toMatchObject({ explanation: null, withheld: "CONTEXT_NOT_THIS_DRAFT" })
  })

  it("withholds every per-Deployment number by name rather than attribute on a guess", () => {
    const p = preview("plural_preview")
    expect(assess(p, ["prod"]).deployments).toBeNull()        // not the draft's Deployments
    expect(assess(p, ["prod"]).accounts[0]).toMatchObject({ explanation: null, withheld: "DRAFT_DEPLOYMENTS_NOT_PAIRED" })
    expect(assess(p, ["prod", "stag ing"]).deployments).toBeNull()   // a key the backend does not admit
    const single = preview("preview")
    expect(assess(single, ["prod"]).accounts[0]).toMatchObject({ explanation: null, withheld: "PREVIEW_WITHOUT_CONTEXT" })
    expect(assessmentWithheldSentence("PLANNER_INPUTS_UNAVAILABLE")).toContain("(PLANNER_INPUTS_UNAVAILABLE)")
  })
})

describe("the served result v2 and THIS Finish's per-Deployment explanation", () => {
  it("reads the served context, the same rows withheld by name, and a version-1 publication without one", () => {
    expect(result("served_context").parsed).toMatchObject({ kind: "served", deploymentContext: { state: "SERVED", members: 3 } })
    expect(result("served_context_withheld").parsed).toMatchObject({ kind: "served",
      deploymentContext: { state: "UNAVAILABLE", reason: "DEPLOYMENT_VERSION_NOT_PLANNER_INPUT" } })
    expect(result("served_without_context").parsed).toMatchObject({ kind: "served",
      deploymentContext: { state: "UNAVAILABLE", reason: "PUBLICATION_WITHOUT_CONTEXT" } })
  })

  it("refuses a decoration that is not whole, and a level-1 answer that carries a context", () => {
    const { capture } = result("served_context")
    const accountId = String(capture._provenance.request.params.account_id)
    const body = capture.body
    const parse = (b: unknown) => parseResultResponse(200, b, accountId).kind
    const [first, ...rest] = body.members
    const { deployment_context: _c, ...bare } = first
    expect(parse({ ...body, members: [bare, ...rest] })).toBe("unavailable")
    expect(parse({ ...body, deployment_context_state: { state: "SERVED", members: 2 } })).toBe("unavailable")
    const { deployment_context_state: _s, ...noKey } = body
    expect(parse(noKey)).toBe("unavailable")
    expect(parse({ ...noKey, contract: RESULT_CONTRACT })).toBe("unavailable")
    const withheld = result("served_context_withheld").capture.body
    expect(parse({ ...withheld, members: [first, ...withheld.members.slice(1)] })).toBe("unavailable")
  })

  it("reads the decoration key exactly by level: every level-2 answer carries it, no level-1 answer does (FE mutant M20)", () => {
    // the real held answer (level 1): tagged level 2 it is read with the key (null, as level 2 writes it) and not without;
    // at level 1 it is read without the key and NOT with it -- the one direction only the key rule decides (a missing key
    // at level 2 is also refused by the non-served-is-null rule)
    const held = read("system-boundary-captures", "result_v1_held")
    const accountId = String(held._provenance.request.query.account_id)
    const v1 = structuredClone(held.body)
    const v2 = { ...structuredClone(held.body), contract: RESULT_CONTRACT_V2 }
    expect(parseResultResponse(held.status, { ...v2, deployment_context_state: null }, accountId).kind).toBe("held")
    expect(parseResultResponse(held.status, v2, accountId).kind).toBe("unavailable")
    expect(parseResultResponse(held.status, v1, accountId).kind).toBe("held")
    expect(parseResultResponse(held.status, { ...v1, deployment_context_state: null }, accountId).kind).toBe("unavailable")
  })

  // The C3f-R harness (tests/test_system_boundary_result_captures.py) roots the regional instance i-...1 and the role under
  // prod and i-...3 under staging: the receipt this Finish pinned is those two Deployments at version 1. The result capture
  // is not of the SAME Finish as a captured receipt, so the pinned list is named here from the producer's placement.
  const pinnedFor = (served: ResultServed, versions = [1, 1]) => {
    const keyOf = (suffix: string) =>
      (served.lists.members.find((m) => m.resource_uid.endsWith(suffix))!.deployment_context as any).deployments[0].key  // eslint-disable-line @typescript-eslint/no-explicit-any
    return pairDeployments(["prod", "staging"], [{ key: keyOf("i-00000000000000001"), version: versions[0] },
                                                 { key: keyOf("i-00000000000000003"), version: versions[1] }])
  }
  const applied: Pairing = { kind: "applied_result", generation: 41 }

  it("explains THIS Finish's applied result per Deployment only when every context is of this receipt", () => {
    const served = result("served_context").parsed as ResultServed
    const explained = finishExplanation(applied, served, pinnedFor(served))
    expect(explained.kind).toBe("explained")
    if (explained.kind !== "explained") return
    const [prod, staging] = explained.explanation.deployments
    expect(prod.deployment.deploymentKey).toBe("prod")
    expect(prod.single.sort()).toEqual(["arn:aws:ec2:eu-west-1:111111111111:instance/i-00000000000000001",
                                        "arn:aws:iam::111111111111:role/r2"])
    expect(staging.single).toEqual(["arn:aws:ec2:eu-west-1:111111111111:instance/i-00000000000000003"])
  })

  it("withholds the explanation whole, by name, for anything that is not this Finish's receipt-bound context", () => {
    const served = result("served_context").parsed as ResultServed
    const pinned = pinnedFor(served)
    const updating: Pairing = { kind: "updating", asOf: 41, why: "GENERATION_MISMATCH" }
    const unknown: Pairing = { kind: "unknown", asOf: null, why: "APPLIED_UNREADABLE" }
    expect(finishExplanation(updating, served, pinned)).toEqual({ kind: "withheld", why: "NOT_THIS_FINISH_RESULT" })
    expect(finishExplanation(unknown, served, pinned)).toEqual({ kind: "withheld", why: "NOT_THIS_FINISH_RESULT" })
    expect(finishExplanation(applied, served, null)).toEqual({ kind: "withheld", why: "RECEIPT_DEPLOYMENTS_NOT_PAIRED" })
    // the receipt pinned prod at another version than the membership was computed against: not this Finish's context
    expect(finishExplanation(applied, served, pinnedFor(served, [2, 1])))
      .toEqual({ kind: "withheld", why: "CONTEXT_NOT_THIS_RECEIPT" })
    const withheld = result("served_context_withheld").parsed
    expect(finishExplanation(applied, withheld, pinned))
      .toEqual({ kind: "withheld", why: "DEPLOYMENT_VERSION_NOT_PLANNER_INPUT" })
    const legacy = read("system-boundary-captures", "result")
    const v1 = parseResultResponse(legacy.status, legacy.body, String(legacy._provenance.request.query.account_id))
    expect(finishExplanation(applied, v1, pinned)).toEqual({ kind: "withheld", why: "RESULT_WITHOUT_CONTEXT" })
    expect(finishExplanationWithheldSentence("CONTEXT_NOT_THIS_RECEIPT")).toContain("Every member is still listed.")
    expect(finishExplanationWithheldSentence("PUBLICATION_WITHOUT_CONTEXT")).toContain("(PUBLICATION_WITHOUT_CONTEXT)")
  })
})
