/**
 * Correcting declarations (lib/system-boundary-correction.ts) over the PRODUCER goldens (__tests__/fixtures/system-boundary,
 * backend 472d4105): from the view a person saw just before each captured correction, the model must build EXACTLY the
 * correction the real route answered -- and the answers, read through the real client, say what happened.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  saveCorrection,
  type BoundaryRecord,
  type CorrectionEnvelope,
  type DeclarationsView,
  type DeclaredRoot,
  type SaveResult,
} from "@/lib/system-boundary-authoring"
import type { RootSelection } from "@/lib/system-boundary-authoring"   // deep fixtures (wizard on discovery widened DeclaredRoot)
import { buildCorrection, declaredIn, environmentEffect, type CorrectionIntent } from "@/lib/system-boundary-correction"
import { describeResult, type PickedRoot } from "@/lib/system-boundary-declaration"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function golden(name: string): any {
  return JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/system-boundary", `${name}.json`), "utf8"))
}

const REQUESTS = golden("requests")
const ACCOUNT: string = REQUESTS.create.declaration.roots[0].account_id
const view = (name: string): DeclarationsView => golden(name).body

function picked(root: DeclaredRoot): PickedRoot {
  return { root, label: root.resource_uid.split("/").pop()!, publication: { ...(root.selection as RootSelection).publication, registration_id: "r" } }
}

function key(records: BoundaryRecord[], field: string, value: string): string {
  return records.find((r) => !r.tombstoned && r.body[field] === value)!.key
}

function seed(current: DeclarationsView, uidSuffix: string): string {
  return current.roots.find((r) => !r.tombstoned && String(r.body.resource_uid).endsWith(`/${uidSuffix}`))!.key
}

const PROD = (current: DeclarationsView) => key(current.deployments, "deployment_key", "prod")

async function answered(name: string, envelope: CorrectionEnvelope): Promise<SaveResult> {
  const { status, body } = golden(name)
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(body, { status }))
  return saveCorrection(envelope)
}

afterEach(() => vi.restoreAllMocks())

describe("the correction model rebuilds exactly what the real route answered", () => {
  const cases: [string, string, string, (current: DeclarationsView) => CorrectionIntent][] = [
    ["criticality", "correction", "view_after_save", (v) => ({ kind: "criticality", systemKey: v.systems[0].key, criticality: "CRITICAL" })],
    ["add", "add", "view_after_correction", (v) => ({ kind: "roots", deploymentKey: PROD(v),
      add: [picked(REQUESTS.add.correction.roots.add[0])], remove: [], move: [] })],
    ["replace: A+B becomes A+C in ONE correction", "replace", "view_before_replace", (v) => ({ kind: "roots", deploymentKey: PROD(v),
      add: [picked(REQUESTS.replace.correction.roots.add[0])], remove: [seed(v, "api-role")], move: [] })],
    ["the customer's own word", "raw", "view_after_replace", (v) => ({ kind: "environment", deploymentKey: PROD(v), environmentRaw: "production" })],
    ["an environment edit that keeps the word", "env_conflict", "view_before_environment", (v) => ({ kind: "environment",
      deploymentKey: PROD(v), environment: "STAGING" })],
    ["an environment edit that clears the word", "env", "view_before_environment", (v) => ({ kind: "environment",
      deploymentKey: PROD(v), environment: "STAGING", environmentRaw: null })],
    ["move", "move", "view_before_move", (v) => ({ kind: "roots", deploymentKey: PROD(v), add: [], remove: [],
      move: [{ rootKey: seed(v, "web-role"), toDeploymentKey: key(v.deployments, "deployment_key", "dr") }] })],
    ["remove", "remove", "view_before_remove", (v) => ({ kind: "roots", deploymentKey: PROD(v), add: [], remove: [seed(v, "batch-role")], move: [] })],
  ]

  it.each(cases)("%s", (_label, request, before, intent) => {
    const current = view(before)
    expect(current.completed_revision).toBe(REQUESTS[request].base_revision)        // the view it was read from
    expect(buildCorrection(intent(current), current)).toEqual({ ok: true, correction: REQUESTS[request].correction })
  })
})

describe("what the person sees and is told", () => {
  it("after the replacement the declared roots are A+C -- never A+B+C -- and after moving and removing, what remains", () => {
    const roots = (name: string) => declaredIn(view(name), ACCOUNT).flatMap(({ system, deployments }) => deployments.map(({ deployment, roots: rs }) =>
      [system.body.display_name, deployment.body.deployment_key, rs.map((r) => String(r.body.resource_uid).split("/").pop()).sort()]))
    expect(roots("view_before_replace")).toEqual([["Payments", "prod", ["api-role", "web-role"]]])
    expect(roots("view_after_replace")).toEqual([["Payments", "prod", ["batch-role", "web-role"]]])
    expect(roots("view_after_corrections")).toEqual([["Payments", "dr", ["dr-role", "web-role"]], ["Payments", "prod", []]])
  })

  it("an environment edit spells out its effect before the save -- a KEPT word included", () => {
    const current = view("view_before_environment")
    const prod = current.deployments.find((d) => d.key === PROD(current))!
    expect(environmentEffect(prod, { environment: "STAGING" })).toEqual([
      "Environment: PRODUCTION becomes STAGING.", 'Your own word "production" is KEPT and must still fit the environment.'])
    expect(environmentEffect(prod, { environment: "STAGING", environment_raw: null })).toEqual([
      "Environment: PRODUCTION becomes STAGING.", 'Your own word "production" is cleared.'])
  })

  it("the real answers: a surviving alias is refused by name; every other correction is Saved, never Applied", async () => {
    const conflict = describeResult(await answered("correction_environment_conflict", REQUESTS.env_conflict))
    expect([conflict.kind, conflict.kind === "refused" && conflict.code, conflict.message]).toEqual(
      ["refused", "ENVIRONMENT_RAW_CONFLICT", "Your own environment word names a different environment."])
    for (const [name, request, revision] of [["correction_saved", "correction", 3], ["correction_replace_saved", "replace", 5],
                                             ["correction_environment_saved", "env", 7], ["correction_move_saved", "move", 9],
                                             ["correction_remove_saved", "remove", 10]] as const) {
      const outcome = describeResult(await answered(name, REQUESTS[request]))
      expect([outcome.kind, outcome.kind === "saved" && outcome.revision]).toEqual(["saved", revision])
      expect(outcome.message).toContain("nothing is applied yet")
    }
  })

  it("refuses locally only what the view rules out", () => {
    const current = view("view_before_replace")
    const prod = PROD(current)
    const cases: [CorrectionIntent, string][] = [
      [{ kind: "criticality", systemKey: current.systems[0].key, criticality: "CRITICAL" }, "Nothing to change."],
      [{ kind: "criticality", systemKey: current.systems[0].key, criticality: "URGENT" }, "Choose one of the listed criticality tiers."],
      [{ kind: "criticality", systemKey: "SYSTEM#gone", criticality: null }, "The system has changed since this page was read; reload and try again."],
      [{ kind: "environment", deploymentKey: prod }, "Nothing to change."],
      [{ kind: "roots", deploymentKey: prod, add: [], remove: [], move: [] }, "Nothing to change."],
      [{ kind: "roots", deploymentKey: prod, add: [], remove: ["SEED#gone"], move: [] },
       "A root to remove has changed since this page was read; reload and try again."],
      [{ kind: "roots", deploymentKey: prod, add: [], remove: [seed(current, "api-role")],
         move: [{ rootKey: seed(current, "api-role"), toDeploymentKey: prod }] }, "A root can be removed or moved, not both."],
    ]
    for (const [intent, problem] of cases) {
      const built = buildCorrection(intent, current)
      expect(built.ok ? [] : built.problems).toContain(problem)
    }
  })
})
