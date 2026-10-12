/**
 * S0 NSW-04 (Codex second review 2026-10-12): a disposition's scope is the person's, row by row, and agrees with the SERVED
 * requirement profile.
 *
 * The level-3 profile (backend unified/requirement_profile.py, served beside every view) needs (account_id, region) for
 * history:cloudtrail and history:vpc_flow; the wizard asked for neither Region and gave iac the FIRST ROOT's Region. A setup
 * holds one disposition per (subject, account, Region) -- the wizard kept one per subject. Every answer here is a REAL
 * capture (__tests__/fixtures/system-boundary-setup-captures-v3/, system-boundary-captures/stacks.json); an edit of one is said.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SetupWizard, type SetupClient, type StackOption } from "@/components/system-boundary/setup-wizard"
import type { DeclarationsView } from "@/lib/system-boundary-authoring"
import { expectedFacts, type AuthoredDisposition, type SetupIntent, type SetupView, type SetupWrite } from "@/lib/system-boundary-setup"
import { setupPendingStore, type PendingSetupOp } from "@/lib/system-boundary-setup-pending"
import { parseStacksResponse } from "@/lib/system-boundary-stacks"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (file: string): any => JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures", file), "utf8"))
const VIEW: DeclarationsView = json("system-boundary/view_after_save.json").body
const DRAFT: SetupView = json("system-boundary-setup-captures-v3/read_draft.json").body
const ACCOUNT = DRAFT.dispositions_derived[0].scope.account_id
const ROOT_REGION = (DRAFT.intent.declaration as { roots: { region: string }[] }).roots[0].region

/** The census's real stacks answer, moved to this setup's account, with the nested stack in us-east-1 -- a Region no root of
 *  this setup is in (an edit of the capture: ARN, account and Region changed together). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stacksAnswer(): any {
  const capture = json("system-boundary-captures/stacks.json")
  const body = JSON.parse(JSON.stringify(capture.body).replaceAll(capture.body.account_id, ACCOUNT))
  const nested = body.stacks[1]
  nested.stack_id = nested.stack_id.replace(":eu-west-1:", ":us-east-1:")
  nested.region = "us-east-1"
  nested.parent_stack_id = null                                          // a stack of its own in that Region
  return body
}

/** That answer as the wizard is given it -- parsed by the census reader, as Your setups does. */
function stacks(): StackOption[] {
  const parsed = parseStacksResponse(200, stacksAnswer(), ACCOUNT)
  if (parsed.kind !== "data") throw new Error(`the edited capture must still parse: ${JSON.stringify(parsed)}`)
  return parsed.stacks.filter((s) => s.settled).map((s) => ({ stack_id: s.stackId, label: `${s.stackName} (${s.region})`, region: s.region }))
}

function client(view: SetupView = DRAFT) {
  const updates: SetupIntent[] = []
  const c: SetupClient = {
    readSetup: vi.fn(async () => ({ kind: "OK" as const, value: structuredClone(view) })),
    readSetupStatus: vi.fn(async () => ({ kind: "OK" as const, value: json("system-boundary-setup-captures-v3/status.json").body })),
    updateSetup: vi.fn(async (_id: string, _rid: string, base: number, steps: SetupIntent): Promise<SetupWrite> => {
      updates.push(steps)
      return { kind: "SAVED", status: 200, view: { ...structuredClone(view), state_version: base + 1, intent: steps } }
    }),
    finishSetup: vi.fn(),
  }
  return { c, updates }
}

async function open(c: SetupClient, stackOptions: StackOption[] | null = null) {
  render(<SetupWizard setupId={DRAFT.setup_id} accountId={ACCOUNT} view={VIEW} picks={[]} onClose={() => undefined} client={c}
    pendingStore={setupPendingStore(null, new Map<string, PendingSetupOp>())} actor="https://idp#alice"
    stacks={stackOptions ? { state: "served", stacks: stackOptions } : { state: "unavailable", reason: "The account census is not published yet." }}
    readApplied={async () => ({ status: 503, body: {} })} readResult={async () => ({ status: 503, body: {} })} />)
  await act(async () => {})
}

const step = (name: string) => fireEvent.click(screen.getByRole("button", { name }))
const subject = (s: string) => within(screen.getByTestId(`setup-subject-${s}`))

function addFor(s: string, label: string, region: string, choice: string) {
  fireEvent.change(subject(s).getByLabelText(`Region for ${label}`), { target: { value: region } })
  fireEvent.change(subject(s).getByLabelText(`${label} for this Region`), { target: { value: choice } })
}

async function saved(updates: SetupIntent[]): Promise<AuthoredDisposition[]> {
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }))
  await act(async () => {})
  expect(updates).toHaveLength(1)
  return updates[0].dispositions
}

const rows = (ds: AuthoredDisposition[], s: string) =>
  ds.filter((d) => d.subject === s).map((d) => [d.scope.region ?? null, d.choice]).sort()

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("NSW-04: Regions the profile needs are asked for, row by row, never taken from a root", () => {
  it("a history source is requested for the Regions the person names -- each its own row, each supported by the served profile", async () => {
    const { c, updates } = client()
    await open(c)
    step("6. Historical data")
    addFor("history:cloudtrail", "CloudTrail history", "us-east-1", "requested")
    addFor("history:vpc_flow", "VPC Flow Log history", ROOT_REGION, "requested")
    addFor("history:vpc_flow", "VPC Flow Log history", "", "no_history")              // all of the account: kept account-wide
    const sent = await saved(updates)
    expect(rows(sent, "history:cloudtrail")).toEqual([[ROOT_REGION, "no_history"], ["us-east-1", "requested"]])
    expect(rows(sent, "history:vpc_flow")).toEqual([[ROOT_REGION, "requested"], [null, "no_history"]].sort())
    for (const d of sent.filter((d) => d.choice === "requested" && d.subject.startsWith("history:"))) {
      expect(expectedFacts(d.subject, d.scope, DRAFT.requirement_profile)).toEqual({ support: "SUPPORTED", reason: null })
    }
    const accountWide = sent.find((d) => d.subject === "history:vpc_flow" && !d.scope.region)!
    expect(expectedFacts(accountWide.subject, accountWide.scope, DRAFT.requirement_profile))
      .toEqual({ support: "UNSUPPORTED", reason: "SCOPE_INCOMPLETE:region" })          // said as a named limit, not hidden
  })

  it("a request without a Region, a Region the backend would refuse and a Region already chosen are refused by name", async () => {
    const { c, updates } = client()
    await open(c)
    step("6. Historical data")
    addFor("history:cloudtrail", "CloudTrail history", "", "requested")
    expect(subject("history:cloudtrail").getByRole("alert").textContent).toBe("A request needs a Region: the requirement profile asks for one.")
    addFor("history:cloudtrail", "CloudTrail history", "EU West 1", "requested")
    expect(subject("history:cloudtrail").getByRole("alert").textContent).toBe("\"EU West 1\" is not a Region name.")
    addFor("history:cloudtrail", "CloudTrail history", ROOT_REGION, "connect_later")
    expect(subject("history:cloudtrail").getByRole("alert").textContent).toBe(`${ROOT_REGION} already has a choice here; change that one.`)
    expect(rows(await saved(updates), "history:cloudtrail")).toEqual([[ROOT_REGION, "no_history"]])
  })

  it("infrastructure as code chosen with no stack names no Region -- never the first root's", async () => {
    // The draft capture without its iac row (an edit): the person chooses iac afresh.
    const view = structuredClone(DRAFT)
    view.intent.dispositions = view.intent.dispositions.filter((d) => d.subject !== "iac")
    view.dispositions_derived = view.dispositions_derived.filter((d) => d.subject !== "iac")
    const { c, updates } = client(view)
    await open(c, stacks())
    step("3. Code and infrastructure")
    fireEvent.change(subject("iac").getByLabelText("Infrastructure as code"), { target: { value: "connect_later" } })
    expect((await saved(updates)).find((d) => d.subject === "iac")!.scope).toEqual({ account_id: ACCOUNT })
  })

  it("infrastructure as code using an existing stack takes THAT stack's Region", async () => {
    const options = stacks()
    const elsewhere = options.find((s) => s.region !== ROOT_REGION)!
    const { c, updates } = client()
    await open(c, options)
    step("3. Code and infrastructure")
    fireEvent.change(subject("iac").getByLabelText(`Infrastructure as code, ${ACCOUNT} / ${ROOT_REGION}`),
                     { target: { value: "use_existing" } })
    fireEvent.change(subject("iac").getByLabelText("CloudFormation stack"), { target: { value: elsewhere.stack_id } })
    expect((await saved(updates)).find((d) => d.subject === "iac")).toMatchObject({
      scope: { account_id: ACCOUNT, region: elsewhere.region }, ref: { kind: "stack_binding", key: elsewhere.stack_id } })
  })

  it("the stack census's own Region reaches the setup through Your setups: a stack chosen there scopes iac to it", async () => {
    const { GuidedSetups } = await import("@/components/system-boundary/guided-setups")
    const census = stacksAnswer()
    const elsewhere = census.stacks.find((s: { region: string }) => s.region !== ROOT_REGION)
    const owner = DRAFT.owner
    const { c, updates } = client()
    render(<GuidedSetups accountId={ACCOUNT} view={VIEW} picks={[]} actor={owner} client={c}
      listSetups={async () => ({ kind: "OK" as const, value: json("system-boundary-setup-captures-v3/list.json").body })}
      readStacks={async () => ({ status: 200, body: census })} pendingStore={setupPendingStore(null, new Map<string, PendingSetupOp>())}
      readApplied={async () => ({ status: 503, body: {} })} readResult={async () => ({ status: 503, body: {} })} />)
    fireEvent.click(screen.getByTestId("setup-mine"))
    await act(async () => {})
    fireEvent.click(within(screen.getByTestId("setup-resume-list")).getByRole("button"))
    await act(async () => {})
    step("3. Code and infrastructure")
    fireEvent.change(subject("iac").getByLabelText(`Infrastructure as code, ${ACCOUNT} / ${ROOT_REGION}`),
                     { target: { value: "use_existing" } })
    fireEvent.change(subject("iac").getByLabelText("CloudFormation stack"), { target: { value: elsewhere.stack_id } })
    expect((await saved(updates)).find((d) => d.subject === "iac")!.scope).toEqual({ account_id: ACCOUNT, region: elsewhere.region })
  })

  it("switching iac from a Terraform-state request to an existing stack never sends that state's path as a stack", async () => {
    const { c, updates } = client()
    await open(c, stacks())
    step("3. Code and infrastructure")
    expect(DRAFT.intent.dispositions.find((d) => d.subject === "iac")!.ref).toMatchObject({ kind: "terraform_state" })
    fireEvent.change(subject("iac").getByLabelText(`Infrastructure as code, ${ACCOUNT} / ${ROOT_REGION}`),
                     { target: { value: "use_existing" } })
    expect((await saved(updates)).find((d) => d.subject === "iac")!.ref).toEqual({ kind: "stack_binding", key: "" })
  })

  it("(S0-R04) changing an all-of-the-account history row to a request is refused without a Region; another choice is not", async () => {
    const { c, updates } = client()
    await open(c)
    step("6. Historical data")
    addFor("history:vpc_flow", "VPC Flow Log history", "", "no_history")
    const row = () => subject("history:vpc_flow").getByLabelText(`VPC Flow Log history, ${ACCOUNT} / all Regions`)
    fireEvent.change(row(), { target: { value: "requested" } })
    expect(subject("history:vpc_flow").getByRole("alert").textContent).toBe("A request needs a Region: the requirement profile asks for one.")
    expect((row() as HTMLSelectElement).value).toBe("no_history")                      // the row stays as it was
    fireEvent.change(row(), { target: { value: "connect_later" } })                    // positive: a choice that needs no Region
    expect(subject("history:vpc_flow").queryByRole("alert")).toBeNull()
    expect(rows(await saved(updates), "history:vpc_flow")).toEqual([[null, "connect_later"]])
  })

  it("(S0-R05) a stack whose Region another iac row already has is refused; one in the row's own Region is taken", async () => {
    const options = stacks()
    const elsewhere = options.find((s) => s.region !== ROOT_REGION)!, here = options.find((s) => s.region === ROOT_REGION)!
    // The draft capture with a second iac row in the other Region (an edit): two rows of one subject.
    const view = structuredClone(DRAFT)
    view.intent.dispositions.push({ subject: "iac", scope: { account_id: ACCOUNT, region: elsewhere.region }, choice: "connect_later",
                                    reason_code: "CONNECT_LATER" })
    const { c, updates } = client(view)
    await open(c, options)
    step("3. Code and infrastructure")
    fireEvent.change(subject("iac").getByLabelText(`Infrastructure as code, ${ACCOUNT} / ${ROOT_REGION}`), { target: { value: "use_existing" } })
    fireEvent.change(subject("iac").getByLabelText("CloudFormation stack"), { target: { value: elsewhere.stack_id } })
    expect(subject("iac").getByRole("alert").textContent).toBe(`${elsewhere.region} already has a choice here; change that one.`)
    expect((subject("iac").getByLabelText("CloudFormation stack") as HTMLSelectElement).value).toBe("")   // the row as it was
    fireEvent.change(subject("iac").getByLabelText("CloudFormation stack"), { target: { value: here.stack_id } })
    expect(subject("iac").queryByRole("alert")).toBeNull()
    const sent = (await saved(updates)).filter((d) => d.subject === "iac")
    expect(sent.map((d) => [d.scope.region, d.choice, d.ref?.key ?? null]).sort()).toEqual([
      [ROOT_REGION, "use_existing", here.stack_id], [elsewhere.region, "connect_later", null]].sort())
  })

  it("(S0-R05) a row of another account is offered none of this account's stacks, and keeps what it has", async () => {
    const foreign = "222222222222"
    // The draft capture with its iac row moved to another account (an edit), as a setup saved elsewhere could hold it.
    const view = structuredClone(DRAFT)
    const index = view.intent.dispositions.findIndex((d) => d.subject === "iac")
    view.intent.dispositions[index] = { ...view.intent.dispositions[index], scope: { account_id: foreign, region: ROOT_REGION } }
    const { c, updates } = client(view)
    await open(c, stacks())
    step("3. Code and infrastructure")
    const row = subject("iac").getByLabelText(`Infrastructure as code, ${foreign} / ${ROOT_REGION}`)
    expect((within(row).getByRole("option", { name: "Use what this account already has" }) as HTMLOptionElement).disabled).toBe(true)
    fireEvent.change(row, { target: { value: "use_existing" } })
    expect(subject("iac").getByRole("alert").textContent)
      .toBe(`No CloudFormation stacks of account ${foreign} are listed here, so none can be used for it.`)
    expect(subject("iac").queryByLabelText("CloudFormation stack")).toBeNull()
    expect((await saved(updates)).find((d) => d.subject === "iac")).toEqual(view.intent.dispositions[index])
  })

  it("a saved setup with one subject in two Regions, and a row this screen does not offer, is resumed and saved back whole", async () => {
    // The draft capture with a second CloudTrail row (us-east-1, requested) and a live source row this screen offers no control
    // for -- an edit of the capture, each derived row its authored one's as the server reads it.
    const view = structuredClone(DRAFT)
    const second = { ...structuredClone(view.intent.dispositions[1]), scope: { account_id: ACCOUNT, region: "us-east-1" },
                     choice: "requested" as const, reason_code: "OWNER_TO_CONNECT" }
    const other = { subject: "live_source:config", scope: { account_id: ACCOUNT, region: ROOT_REGION }, choice: "deferred" as const,
                    reason_code: "LATER" }
    view.intent.dispositions = [...view.intent.dispositions, second, other]
    const { c, updates } = client(view)
    await open(c)
    step("6. Historical data")
    const sent = await saved(updates)                                    // saved back untouched: nothing merged, nothing dropped
    const key = (d: AuthoredDisposition) => JSON.stringify([d.subject, d.scope.account_id, d.scope.region ?? null])
    expect(sent.map(key).sort()).toEqual(view.intent.dispositions.map(key).sort())
    expect(sent.find((d) => d.subject === "live_source:config")).toEqual(other)
    expect(sent.find((d) => d.subject === "history:cloudtrail" && d.scope.region === "us-east-1")).toEqual(second)
    cleanup()
    await open(client(view).c)
    step("6. Historical data")                                         // and each Region is shown as its own row
    expect(screen.getByTestId(`setup-row-history:cloudtrail-${ROOT_REGION}`)).toBeTruthy()
    expect(screen.getByTestId("setup-row-history:cloudtrail-us-east-1")).toBeTruthy()
  })
})
