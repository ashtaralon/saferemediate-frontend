/**
 * S2 C4a-2: the draft preview v3 -- the Terraform rows of a draft, as the server joined them -- read (lib/system-boundary-setup-
 * preview.ts) and shown (the wizard's Review panel). Contract S2-C4A2-PREVIEW-TERRAFORM-JOIN-CONTRACT-2026-10-16.
 *
 * Every answer is a REAL capture (__tests__/fixtures/system-boundary-setup-preview-captures-v6/, pinned in its README): a
 * COMPUTED v3 preview with one joined row (3 identities, 2 matched, 1 not in Inventory), one revoked and one unknown binding;
 * a members page of it; and the same draft with its account held. A negative control is ONE named change to a capture.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SetupWizard, type SetupClient } from "@/components/system-boundary/setup-wizard"
import type { DeclarationsView } from "@/lib/system-boundary-authoring"
import { contentHash } from "@/lib/content-hash"
import type { SetupView } from "@/lib/system-boundary-setup"
import { setupPendingStore, type PendingSetupOp } from "@/lib/system-boundary-setup-pending"
import { PREVIEW_CONTRACT_V3, parsePreview, type PreviewFetcher } from "@/lib/system-boundary-setup-preview"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (file: string): any => JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures", file), "utf8"))
const cap = (name: string) => json(`system-boundary-setup-preview-captures-v6/${name}.json`)
const VIEW: DeclarationsView = json("system-boundary/view_after_save.json").body
const DRAFT: SetupView = cap("terraform_draft").body
const PREVIEW = cap("terraform_preview").body
const [JOINED, REVOKED, UNKNOWN] = PREVIEW.terraform.bindings as { binding_id: string }[]

/** A capture's preview body with ONE named change (its digests left as they are: they bind basis and result, not this). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const changed = (change: (body: any) => void, name = "terraform_preview") => {
  const body = structuredClone(cap(name).body)
  change(body)
  return body
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("the v3 reader", () => {
  it("reads the computed v3 preview: its Terraform rows exactly as the server joined them", () => {
    const read = parsePreview(200, PREVIEW)
    if (read.kind !== "OK") throw new Error(JSON.stringify(read))
    expect(read.value.contract).toBe(PREVIEW_CONTRACT_V3)
    expect(read.value.deploymentId).not.toBeNull()                       // a single draft: v1's shape plus the section
    const [joined, revoked, unknown] = read.value.terraform!
    expect([joined.state, revoked.state, unknown.state]).toEqual(["JOINED", "HELD", "HELD"])
    expect(joined.counts).toEqual({ identities: 3, matched: 2, notInInventory: 1, ambiguous: 0, notJoinable: 0 })
    expect(joined.inventoryGeneration).toBe(read.value.accounts[0].inventory.generation)
    expect([revoked.reason, unknown.reason]).toEqual(["BINDING_REVOKED", "BINDING_NOT_FOUND"])
    expect(revoked.rows).toEqual([])
  })

  it("reads its page (contract v3) and the held answer, whose joined row is held for its account", () => {
    const page = parsePreview(200, cap("terraform_preview_page").body)
    expect(page.kind === "OK" && page.value.page?.bucket).toBe("members")
    const held = parsePreview(200, cap("terraform_preview_held").body)
    if (held.kind !== "OK") throw new Error(JSON.stringify(held))
    expect(held.value.state).toBe("HELD")
    expect(held.value.terraform![0]).toMatchObject({ state: "HELD", reason: "ACCOUNT_NOT_JOINED:HELD", counts: null })
  })

  it("is read only from a setup-level-5 answer", () => {
    expect(parsePreview(200, changed((b) => { b.setup_contract = "system_boundary_setup/v4" })))
      .toEqual({ kind: "UNAVAILABLE", status: 200, code: "PREVIEW_CONTRACT_UNKNOWN" })
  })

  it.each([
    ["v3 without its section", (b: any) => { delete b.terraform }],                                             // eslint-disable-line @typescript-eslint/no-explicit-any
    ["an effect other than none", (b: any) => { b.terraform.effect = "members" }],                              // eslint-disable-line @typescript-eslint/no-explicit-any
    ["a held row showing counts", (b: any) => { b.terraform.bindings[1].counts = b.terraform.bindings[0].counts }],  // eslint-disable-line @typescript-eslint/no-explicit-any
    ["a held row showing an identity", (b: any) => { b.terraform.bindings[2].rows = [b.terraform.bindings[0].rows[0]] }],  // eslint-disable-line @typescript-eslint/no-explicit-any
    ["a held row naming a revision", (b: any) => { b.terraform.bindings[1].binding_revision = 1 }],             // eslint-disable-line @typescript-eslint/no-explicit-any
    ["a joined row claiming acquisition", (b: any) => { b.terraform.bindings[0].acquisition = "acquired" }],    // eslint-disable-line @typescript-eslint/no-explicit-any
    ["a joined row claiming resolution", (b: any) => { b.terraform.bindings[0].assessment = "resolved" }],      // eslint-disable-line @typescript-eslint/no-explicit-any
    ["counts that do not add up", (b: any) => { b.terraform.bindings[0].counts.matched = 3 }],                  // eslint-disable-line @typescript-eslint/no-explicit-any
    ["rows and omitted short of the identities", (b: any) => { b.terraform.bindings[0].rows.pop() }],           // eslint-disable-line @typescript-eslint/no-explicit-any
    ["a join on another generation", (b: any) => { b.terraform.bindings[0].inventory_generation += 1 }],         // eslint-disable-line @typescript-eslint/no-explicit-any
    ["an unknown outcome", (b: any) => { b.terraform.bindings[0].rows[0].outcome = "member" }],                 // eslint-disable-line @typescript-eslint/no-explicit-any
    ["another member on a row", (b: any) => { b.terraform.bindings[0].membership = "member" }],                 // eslint-disable-line @typescript-eslint/no-explicit-any
    ["a row of no account", (b: any) => { b.terraform.bindings[0].row.account_id = "1234" }],                   // eslint-disable-line @typescript-eslint/no-explicit-any
  ])("%s is MALFORMED_RESPONSE", (_name, change) => {
    expect(parsePreview(200, changed(change))).toEqual({ kind: "UNAVAILABLE", status: 200, code: "MALFORMED_RESPONSE" })
  })

  it("a joined row of an account the preview held is MALFORMED_RESPONSE (never joined on an unadmitted account)", () => {
    const held = changed((b) => { b.terraform.bindings[0] = cap("terraform_preview").body.terraform.bindings[0] }, "terraform_preview_held")
    expect(parsePreview(200, held)).toEqual({ kind: "UNAVAILABLE", status: 200, code: "MALFORMED_RESPONSE" })
  })

  it("a v1 / v2 answer carrying the section is MALFORMED_RESPONSE", () => {
    const v1 = json("system-boundary-setup-preview-captures-v5/preview.json").body
    expect(parsePreview(200, v1).kind).toBe("OK")                       // the v1 capture as it is
    expect(parsePreview(200, { ...structuredClone(v1), terraform: PREVIEW.terraform }))
      .toEqual({ kind: "UNAVAILABLE", status: 200, code: "MALFORMED_RESPONSE" })
  })

  it("its digests still bind (the section never replaces the identity check)", () => {
    expect(contentHash({ basis_digest: PREVIEW.basis_digest, result_digest: PREVIEW.result_digest })).toBe(PREVIEW.preview_digest)
    expect(parsePreview(200, changed((b) => { b.result_digest = b.basis_digest })).kind).toBe("UNAVAILABLE")
  })
})

function client(view: SetupView = DRAFT): SetupClient {
  return {
    readSetup: vi.fn(async () => ({ kind: "OK" as const, value: structuredClone(view) })),
    readSetupStatus: vi.fn(async () => ({ kind: "UNAVAILABLE" as const, status: 503, code: "NOT_READ" })),
    updateSetup: vi.fn(),
    finishSetup: vi.fn(),
  }
}
async function mount(view: SetupView = DRAFT, body: unknown = PREVIEW) {
  const readPreview: PreviewFetcher = vi.fn(async () => parsePreview(200, structuredClone(body)))
  render(<SetupWizard setupId={view.setup_id} accountId={view.dispositions_derived[0].scope.account_id} view={VIEW} picks={[]}
    onClose={() => undefined} client={client(view)} pendingStore={setupPendingStore(null, new Map<string, PendingSetupOp>())}
    actor="https://idp#alice" stacks={{ state: "unavailable", reason: "not read here" }} readPreview={readPreview}
    readApplied={async () => ({ status: 503, body: {} })} readResult={async () => ({ status: 503, body: {} })} />)
  await act(async () => {})
  await act(async () => {})
  return readPreview
}

describe("the Review panel says what the server joined -- descriptive, never membership", () => {
  it("names the joined counts and generation, the held rows by code in words, and that nothing becomes a member", async () => {
    await mount()
    const section = within(screen.getByTestId("setup-preview-terraform"))
    const joined = section.getByTestId(`setup-preview-terraform-${JOINED.binding_id}`).textContent
    const generation = PREVIEW.accounts[0].inventory.generation
    expect(joined).toContain(`2 of 3 resource(s) of the uploaded state are in this account's Inventory (generation ${generation})`)
    expect(joined).toContain("1 not in it, 0 ambiguous, 0 not joinable")
    expect(joined).toContain("Assessed only, not connected: this uploaded snapshot is not acquired, and makes nothing a member.")
    expect(joined).toContain("aws_s3_bucket.evidence -- not in inventory")
    expect(section.getByTestId(`setup-preview-terraform-${REVOKED.binding_id}`).textContent)
      .toContain("held (BINDING_REVOKED: this Terraform state binding was revoked)")
    expect(section.getByTestId(`setup-preview-terraform-${UNKNOWN.binding_id}`).textContent)
      .toContain("held (BINDING_NOT_FOUND: no Terraform state binding you can see has this id)")
  })

  it("a row the saved setup does not have is not shown as its own", async () => {
    const view = structuredClone(DRAFT)                          // the draft capture without its unknown-key row (an edit)
    view.intent.dispositions = view.intent.dispositions.filter((d) => d.ref?.key !== UNKNOWN.binding_id)
    await mount(view)
    expect(screen.getByTestId(`setup-preview-terraform-${UNKNOWN.binding_id}`).textContent)
      .toContain("The preview names a Terraform row this saved setup does not have")
  })

  it("the held answer says the account was not joined, and why", async () => {
    await mount(DRAFT, cap("terraform_preview_held").body)
    expect(screen.getByTestId(`setup-preview-terraform-${JOINED.binding_id}`).textContent)
      .toContain("held (ACCOUNT_NOT_JOINED:HELD: the preview did not compute this account, so nothing was joined)")
  })
})
