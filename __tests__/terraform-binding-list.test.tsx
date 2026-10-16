/**
 * S2 lifecycle: the list of uploaded Terraform states a person can see -- the reader (lib/terraform-binding.ts
 * ``listTerraformBindings``) and the panel (components/system-boundary/terraform-bindings-panel.tsx), against the backend's
 * REAL answers (__tests__/fixtures/terraform-binding-list-captures, and the binding route captures for revoke). A negative
 * control is ONE named edit of a capture.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TerraformBindingsPanel } from "@/components/system-boundary/terraform-bindings-panel"
import { LIST_CONTRACT, listTerraformBindings } from "@/lib/terraform-binding"

const FIX = path.join(__dirname, "fixtures")
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cap = (dir: string, name: string): any => JSON.parse(readFileSync(path.join(FIX, dir, `${name}.json`), "utf8"))
const list = (name: string) => cap("terraform-binding-list-captures", name)
const binding = (name: string) => cap("terraform-binding-captures", name)
const ACCOUNT = list("list").body.bindings[0].account_id as string
const respond = (c: { status: number; content_type: string; body: unknown }) =>
  new Response(JSON.stringify(c.body), { status: c.status, headers: { "content-type": c.content_type } })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edited = (name: string, change: (b: any) => void) => { const c = list(name); change(c.body); return c }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("the list reader", () => {
  it("reads the producer's list: newest first, its reference states, complete", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(respond(list("list")))
    const out = await listTerraformBindings(ACCOUNT)
    if (out.kind !== "OK") throw new Error(JSON.stringify(out))
    expect(out.value.rows.map((r) => r.referenceInYourSetups)).toEqual(["none_found", "none_found", "found"])
    expect([out.value.complete, out.value.nextCursor]).toEqual([true, null])
    expect(String(fetch.mock.calls[0][0])).toBe(`/api/proxy/system-boundary/terraform-bindings/list?account_id=${ACCOUNT}`)
  })

  it("pages with the cursor it was given, and reads the bounded, incomplete answer as NOT the end", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(respond(list("list_page_1"))).mockResolvedValueOnce(respond(list("list_page_2")))
    const first = await listTerraformBindings(null)
    if (first.kind !== "OK") throw new Error(first.kind)
    expect([first.value.rows.length, first.value.complete, typeof first.value.nextCursor]).toEqual([1, false, "string"])
    const second = await listTerraformBindings(null, first.value.nextCursor)          // a full page again: more may follow
    expect(second.kind === "OK" && [second.value.rows.length, second.value.complete, typeof second.value.nextCursor]).toEqual([1, false, "string"])
    expect(String(fetch.mock.calls[1][0])).toContain(`cursor=${encodeURIComponent(first.value.nextCursor!)}`)
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(respond(list("list_scoped_incomplete")))
    expect(await listTerraformBindings(null)).toEqual({ kind: "OK", status: 200, value: { rows: [], complete: false, nextCursor: null } })
  })

  it("names a bad cursor, and an account it was not asked about is no row of this list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(respond(list("list_cursor_invalid")))
    expect(await listTerraformBindings(null, "x")).toEqual({ kind: "REFUSED", status: 400, code: "CURSOR_INVALID", reason: null })
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(respond(list("list")))
    expect(await listTerraformBindings("111111111111")).toMatchObject({ kind: "UNKNOWN", code: "MALFORMED_RESPONSE" })
  })

  it.each([
    ["complete with a next page", (b: any) => { b.next_cursor = "abc" }],                                   // eslint-disable-line @typescript-eslint/no-explicit-any
    ["a cursor following no row shown", (b: any) => { b.bindings = []; b.complete = false; b.next_cursor = "abc" }],  // eslint-disable-line @typescript-eslint/no-explicit-any
    ["'unused' as a reference state", (b: any) => { b.bindings[0].reference_in_your_setups = "unused" }],    // eslint-disable-line @typescript-eslint/no-explicit-any
    ["a row with an identity of the state", (b: any) => { b.bindings[0].arn = "arn:aws:s3:::x" }],          // eslint-disable-line @typescript-eslint/no-explicit-any
    ["a revoked row without when", (b: any) => { b.bindings[0].status = "REVOKED" }],                       // eslint-disable-line @typescript-eslint/no-explicit-any
    ["the same row twice", (b: any) => { b.bindings[1] = b.bindings[0] }],                                  // eslint-disable-line @typescript-eslint/no-explicit-any
    ["more rows than a page holds", (b: any) => {                                                           // eslint-disable-line @typescript-eslint/no-explicit-any
      b.bindings = Array.from({ length: 51 }, (_, i) => ({ ...b.bindings[0], binding_id: `7fb10000-0000-4000-8000-${String(i).padStart(12, "0")}` })) }],
  ])("%s is MALFORMED_RESPONSE", async (_name, change) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(respond(edited("list", change)))
    expect(await listTerraformBindings(null)).toMatchObject({ kind: "UNKNOWN", code: "MALFORMED_RESPONSE" })
  })

  it("an answer of another contract is CONTRACT_UNKNOWN", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(respond(edited("list", (b) => { b.contract = "terraform_workspace_binding_read/v1" })))
    expect(await listTerraformBindings(null)).toMatchObject({ kind: "UNKNOWN", code: "CONTRACT_UNKNOWN" })
    expect(list("list").body.contract).toBe(LIST_CONTRACT)
  })
})

/** The panel's backend: list pages by cursor; revoke answers as given, recording each request's body. */
function backend({ pages = { "": list("list") } as Record<string, unknown>, revokes = [] as unknown[] } = {}) {
  const sent: { url: string; body: unknown }[] = []
  const queue = [...revokes]
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input)
    sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (url.includes("/revoke")) {
      const next = queue.shift()
      if (next instanceof Error) throw next
      return respond(next as never)
    }
    const cursor = new URL(url, "https://app.example").searchParams.get("cursor") ?? ""
    return respond((pages[cursor] ?? list("list_cursor_invalid")) as never)
  })
  return sent
}
async function mount(rid = "00000000-0000-4000-8000-00000000aaaa") {
  render(<TerraformBindingsPanel accountId={ACCOUNT} editable requestId={() => rid} />)
  await waitFor(() => expect(screen.queryAllByTestId(/^terraform-binding-7fb/).length + screen.queryAllByText(/visible to you|read bound|could not/).length).toBeGreaterThan(0))
}
const row = (id: string) => within(screen.getByTestId(`terraform-binding-${id}`))
const OLDEST = list("list").body.bindings[2].binding_id as string                 // the one a visible setup names; revoke.json's

describe("the panel", () => {
  it("lists each state with its reference in words -- never 'unused' -- and keeps nothing secret-looking", async () => {
    backend()
    await mount()
    const panel = screen.getByTestId("terraform-bindings-panel").textContent ?? ""
    expect(row(OLDEST).getByText(/named by a setup you can see/)).toBeTruthy()
    expect(panel.match(/no reference found in your visible setups/g)).toHaveLength(2)
    expect(panel).not.toMatch(/unused/i)
  })

  it("pages with Show more, and says the list is incomplete -- never ended -- when the read bound cut it short", async () => {
    const first = list("list_page_1")
    backend({ pages: { "": first, [first.body.next_cursor]: list("list_page_2") } })
    await mount()
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    await waitFor(() => expect(screen.getAllByTestId(/^terraform-binding-7fb/)).toHaveLength(2))
    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy()            // page 2 was full: more may follow
    cleanup()
    backend({ pages: { "": list("list_scoped_incomplete") } })
    await mount()
    expect(screen.getByTestId("terraform-bindings-incomplete").textContent).toContain("Not every upload could be listed")
    expect(screen.queryByText(/No uploaded Terraform state/)).toBeNull()
    cleanup()
    backend({ pages: { "": list("list_other_account") } })
    await mount()
    expect(screen.getByText("No uploaded Terraform state of this account is visible to you.")).toBeTruthy()
    expect(screen.queryByTestId("terraform-bindings-incomplete")).toBeNull()        // a complete list is never called incomplete
  })

  it("revokes only after an explicit confirmation, at the row's revision, then reads the list again (the record stays)", async () => {
    const sent = backend({ revokes: [binding("revoke")] })
    await mount()
    fireEvent.click(row(OLDEST).getByRole("button", { name: "Revoke…" }))
    const confirm = within(screen.getByTestId("terraform-binding-revoke-confirm"))
    expect(confirm.getByText(/This cannot be undone/).textContent).toContain(OLDEST)
    expect((confirm.getByRole("button", { name: "Revoke" }) as HTMLButtonElement).disabled).toBe(true)
    expect(sent.filter((s) => s.url.includes("/revoke"))).toHaveLength(0)
    fireEvent.click(confirm.getByLabelText("I confirm this revoke"))
    fireEvent.click(confirm.getByRole("button", { name: "Revoke" }))
    await waitFor(() => expect(sent.filter((s) => !s.url.includes("/revoke"))).toHaveLength(2))       // the list read again
    const revokes = sent.filter((s) => s.url.includes("/revoke"))
    expect(revokes).toEqual([{ url: `/api/proxy/system-boundary/terraform-bindings/${OLDEST}/revoke`,
                                body: { request_id: "00000000-0000-4000-8000-00000000aaaa", base_revision: 1 } }])
  })

  it("an unknown revoke offers the SAME request again, only when clicked; a refusal is named", async () => {
    const sent = backend({ revokes: [new TypeError("Failed to fetch"), binding("revoke_revoked")] })
    await mount()
    fireEvent.click(row(OLDEST).getByRole("button", { name: "Revoke…" }))
    fireEvent.click(screen.getByLabelText("I confirm this revoke"))
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }))
    await waitFor(() => expect(screen.getByText(/Whether it was revoked is not known/)).toBeTruthy())
    expect(sent.filter((s) => s.url.includes("/revoke"))).toHaveLength(1)              // never resent on its own
    fireEvent.click(screen.getByRole("button", { name: "Send the same revoke again" }))
    await waitFor(() => expect(screen.getByText(/Not revoked \(BINDING_REVOKED\)/)).toBeTruthy())
    const [a, b] = sent.filter((s) => s.url.includes("/revoke")).map((s) => s.body)
    expect(b).toEqual(a)
  })

  it("a cursor the server refuses says start again, and starting again reads the first page", async () => {
    const first = list("list_page_1")
    const sent = backend({ pages: { "": first } })                                  // the next page's cursor is refused
    await mount()
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("start again (CURSOR_INVALID)"))
    fireEvent.click(screen.getByRole("button", { name: "Start again" }))
    await act(async () => {})
    expect(sent.map((s) => new URL(s.url, "https://app.example").searchParams.get("cursor"))).toEqual([null, first.body.next_cursor, null])
  })
})
