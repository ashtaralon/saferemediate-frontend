/**
 * The declaration form's model (lib/system-boundary-declaration.ts) over the PRODUCER goldens of the authoring routes
 * (__tests__/fixtures/system-boundary, backend 61c2cd9d): the view and limits the server served, the roots a real picker
 * selected and the answers the real routes gave. Answers reach the model through the real client (saveDeclaration over
 * a fetch that returns the golden), never as a hand-built result. The one regional root (the goldens' roots are all
 * account-wide) is a row of the real account-inventory route's capture, picked as the inventory picks it.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  rootFromInventory,
  saveDeclaration,
  type CreateEnvelope,
  type DeclarationsView,
  type DeclaredRoot,
  type SaveResult,
} from "@/lib/system-boundary-authoring"
import {
  buildDeclaration,
  cellsOf,
  deploymentCovers,
  deploymentsOf,
  describeResult,
  reusableSystems,
  type DraftDeclaration,
  type PickedRoot,
} from "@/lib/system-boundary-declaration"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function golden(name: string): any {
  return JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/system-boundary", `${name}.json`), "utf8"))
}

const REQUESTS = golden("requests")
const CREATE: CreateEnvelope = REQUESTS.create
const REFUSED: CreateEnvelope = REQUESTS.refused
const VIEW0: DeclarationsView = golden("view_initial").body
const VIEW1: DeclarationsView = golden("view_after_save").body
const REGISTRATION = (VIEW1.roots[0].body.provenance as { registration_id: string }).registration_id

function picked(root: DeclaredRoot): PickedRoot {
  return { root: structuredClone(root) as DeclaredRoot, label: root.resource_uid.split("/").pop() ?? root.resource_uid,
           publication: { ...root.selection.publication, registration_id: REGISTRATION } }
}

function draftOf(envelope: CreateEnvelope, over: Partial<DraftDeclaration> = {}): DraftDeclaration {
  const system = envelope.declaration.system
  const deployment = envelope.declaration.deployment
  return {
    roots: envelope.declaration.roots.map((r) => picked(r as DeclaredRoot)),
    system: system.mode === "new" ? { mode: "new", displayName: system.display_name, criticality: system.criticality ?? null }
      : { mode: "existing", systemKey: "" },
    deployment: deployment.mode === "new"
      ? { mode: "new", deploymentKey: deployment.deployment_key, environment: deployment.environment,
          environmentRaw: deployment.environment_raw ?? "" }
      : { mode: "existing", deploymentKey: "" },
    ...over,
  }
}

/** The real client's reading of a golden answer to ``envelope``. */
async function answered(name: string, envelope: CreateEnvelope): Promise<SaveResult> {
  const { status, body } = golden(name)
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(body, { status }))
  return saveDeclaration(envelope)
}

afterEach(() => vi.restoreAllMocks())

describe("the declaration model -- what is sent", () => {
  it("builds exactly the create the real backend saved, from the roots a real picker selected", () => {
    const built = buildDeclaration(draftOf(CREATE), VIEW0)
    expect(built).toEqual({ ok: true, declaration: CREATE.declaration })
    expect(golden("save_saved").status).toBe(201)               // that very request was SAVED by the real route
    expect(cellsOf(CREATE.declaration.roots as DeclaredRoot[])).toEqual([{ account_id: "111122223333", region: "global" }])
  })

  it("builds the mixed create the resolver refused, too: the refusal is the server's, by name, never guessed here", () => {
    expect(buildDeclaration(draftOf(REFUSED), VIEW0)).toEqual({ ok: true, declaration: REFUSED.declaration })
    // Both roots are account-wide (an IAM role, and the S3 bucket the resolver refused): ONE cell, the request's own scopes.
    expect(cellsOf(REFUSED.declaration.roots as DeclaredRoot[])).toEqual([{ account_id: "111122223333", region: "global" }])
  })

  it("accepts each of the seven served criticality tiers, and none at all (omitted, never null)", () => {
    expect(VIEW0.limits.criticalities).toHaveLength(7)
    for (const tier of VIEW0.limits.criticalities) {
      const built = buildDeclaration(draftOf(CREATE, { system: { mode: "new", displayName: "Payments", criticality: tier } }), VIEW0)
      expect(built.ok && built.declaration.system).toEqual({ mode: "new", display_name: "Payments", criticality: tier })
    }
    const none = buildDeclaration(draftOf(CREATE, { system: { mode: "new", displayName: "  Pay   ments ", criticality: null } }), VIEW0)
    expect(none.ok && none.declaration.system).toEqual({ mode: "new", display_name: "Pay ments" })
  })

  it("refuses locally only what the served limits and the view already rule out", () => {
    const limits = VIEW0.limits
    const cases: [Partial<DraftDeclaration>, string][] = [
      [{ roots: [] }, "Pick at least one resource as a root."],
      [{ system: { mode: "new", displayName: " \t ", criticality: null } }, "Name the system."],
      [{ system: { mode: "new", displayName: "x".repeat(limits.max_display_name + 1), criticality: null } },
       `A system name is at most ${limits.max_display_name} characters.`],
      [{ system: { mode: "new", displayName: "Payments", criticality: "URGENT" } }, "Choose one of the listed criticality tiers."],
      [{ deployment: { mode: "new", deploymentKey: "pr od", environment: "PRODUCTION", environmentRaw: "" } },
       "A deployment key is 1-64 letters, digits, dots, dashes or underscores."],
      [{ deployment: { mode: "new", deploymentKey: "prod", environment: "", environmentRaw: "" } }, "Choose the deployment's environment."],
      [{ deployment: { mode: "new", deploymentKey: "prod", environment: "PRODUCTION", environmentRaw: "x".repeat(limits.max_environment_raw + 1) } },
       `Your own environment word is at most ${limits.max_environment_raw} characters.`],
      [{ deployment: { mode: "existing", deploymentKey: "DEPLOYMENT#none" } }, "A new system starts with a new deployment."],
      [{ system: { mode: "existing", systemKey: "SYSTEM#none" } }, "The chosen system is no longer available; reload and choose again."],
    ]
    for (const [over, problem] of cases) {
      const built = buildDeclaration(draftOf(CREATE, over), VIEW0)
      expect(built.ok ? [] : built.problems).toContain(problem)
    }
    const many = Array.from({ length: limits.max_roots + 1 }, (_, i) => picked({ ...(CREATE.declaration.roots[0] as DeclaredRoot),
      resource_uid: `${CREATE.declaration.roots[0].resource_uid}-${i}` }))
    const tooMany = buildDeclaration(draftOf(CREATE, { roots: many }), VIEW0)
    expect(tooMany.ok ? [] : tooMany.problems).toContain(`Pick at most ${limits.max_roots} roots in one save.`)
  })
})

describe("the declaration model -- reusing what exists", () => {
  it("reuses the saved System and Deployment at the versions the view read, and keeps the System's criticality", () => {
    const [system] = reusableSystems(VIEW1)
    const [deployment] = deploymentsOf(VIEW1, system.key)
    expect([system.body.display_name, system.body.criticality, deployment.body.deployment_key]).toEqual(["Payments", "LOW", "prod"])
    const draft = draftOf(CREATE, { system: { mode: "existing", systemKey: system.key },
                                    deployment: { mode: "existing", deploymentKey: deployment.key } })
    expect(buildDeclaration(draft, VIEW1)).toEqual({ ok: true, declaration: {
      system: { mode: "ref", system_id: system.body.system_id, expected_version: system.version },
      deployment: { mode: "ref", deployment_id: deployment.body.deployment_id, expected_version: deployment.version },
      roots: CREATE.declaration.roots } })
  })

  it("names a picked root outside an existing Deployment's cells (its global role is inside, a regional instance is not)", () => {
    const [system] = reusableSystems(VIEW1)
    const [deployment] = deploymentsOf(VIEW1, system.key)
    // Every authoring golden's root is account-wide, so the regional root comes from the REAL inventory route's answer for
    // the same account (fixtures/account-inventory-captures), picked by the real rootFromInventory with its publication.
    const page = JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/account-inventory-captures/populated_page1.json"), "utf8")).body
    const pick = (type: string) => rootFromInventory(page.account_id, page.rows.find(
      (row: { resource_type: string; eligibility: { selectable: boolean } }) => row.resource_type === type && row.eligibility.selectable), page.publication)
    const [role, instance] = [pick("iam:role"), pick("ec2:instance")]
    expect([role.region, instance.region]).toEqual(["global", "eu-west-1"])
    expect(deployment.body.scopes).toEqual([{ account_id: page.account_id, region: "global" }])   // outside by Region, not account
    expect([deploymentCovers(deployment, role), deploymentCovers(deployment, instance)]).toEqual([true, false])
    expect(cellsOf([instance, role])).toEqual([
      { account_id: page.account_id, region: "eu-west-1" }, { account_id: page.account_id, region: "global" }])
    const built = buildDeclaration(draftOf(CREATE, { roots: [picked(role), picked(instance)],
                                                     system: { mode: "existing", systemKey: system.key },
                                                     deployment: { mode: "existing", deploymentKey: deployment.key } }), VIEW1)
    expect(built.ok ? [] : built.problems).toEqual(["1 picked root(s) are outside this deployment's accounts and Regions."])
  })
})

describe("the declaration model -- what the person is told", () => {
  it("a save is Saved and preparing -- never Applied -- whether it committed now or replays", async () => {
    expect(describeResult(await answered("save_saved", CREATE))).toEqual({ kind: "saved", revision: 2, replayed: false,
      message: "Saved as revision 2. Cyntro is preparing this system's membership; nothing is applied yet." })
    const replayed = describeResult(await answered("save_replayed", CREATE))
    expect([replayed.kind, replayed.kind === "saved" && replayed.replayed]).toEqual(["saved", true])
  })

  it("names every root the resolver did not admit, in words, and every other refusal by its message and code", async () => {
    const refused = describeResult(await answered("save_root_not_admitted", REFUSED))
    expect(refused).toEqual({ kind: "refused", code: "ROOT_NOT_ADMITTED",
      message: "Some picked resources cannot be roots right now. Nothing was saved.",
      roots: [{ root: golden("save_root_not_admitted").body.detail.roots[0],
                reason: "it has no verified identity yet, so it cannot be a root" }] })
    for (const [name, code, words] of [
      ["save_display_name_taken", "DISPLAY_NAME_TAKEN", "already exists"],
      ["save_base_revision_conflict", "BASE_REVISION_CONFLICT", "changed since you opened this form"],
      ["save_account_authority_changed", "ACCOUNT_AUTHORITY_CHANGED", "registration changed while saving"],
    ] as const) {
      const outcome = describeResult(await answered(name, CREATE))
      expect([outcome.kind, outcome.kind === "refused" && outcome.code]).toEqual(["refused", code])
      expect(outcome.message).toContain(words)
    }
  })

  it("an unconfirmed save asks for the SAME request again", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"))
    expect(describeResult(await saveDeclaration(CREATE))).toEqual({ kind: "resend", code: "NETWORK_ERROR",
      message: "The save could not be confirmed. Resend the same request: it is safe, and it can never save twice." })
  })
})
