/**
 * S2 lifecycle: the Terraform states a person uploaded -- the reader (lib/terraform-binding.ts ``listTerraformBindings``) and
 * the panel (components/system-boundary/terraform-bindings-panel.tsx), against the backend's REAL answers
 * (__tests__/fixtures/terraform-binding-list-captures, and the binding route captures for revoke). A negative control is ONE
 * named edit of a capture. Delayed answers are the same captures, released when the test says so.
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
  it("reads the producer's list: index order, its reference states, complete", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(respond(list("list")))
    const out = await listTerraformBindings(ACCOUNT)
    if (out.kind !== "OK") throw new Error(JSON.stringify(out))
    expect(out.value.rows.map((r) => r.referenceInYourSetups)).toEqual(["none_found", "none_found", "found"])
    expect([out.value.complete, out.value.nextCursor]).toEqual([true, null])
    expect(String(fetch.mock.calls[0][0])).toBe(`/api/proxy/system-boundary/terraform-bindings/list?account_id=${ACCOUNT}`)
  })

  it("pages with the cursor it was given; a page of no row with a cursor is NOT the end, and continues", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(respond(list("list_page_1"))).mockResolvedValueOnce(respond(list("list_page_2")))
    const first = await listTerraformBindings(null)
    if (first.kind !== "OK") throw new Error(first.kind)
    expect([first.value.rows.length, first.value.complete, typeof first.value.nextCursor]).toEqual([1, false, "string"])
    const second = await listTerraformBindings(null, first.value.nextCursor)          // a full page again: more may follow
    expect(second.kind === "OK" && [second.value.rows.length, second.value.complete, typeof second.value.nextCursor]).toEqual([1, false, "string"])
    expect(String(fetch.mock.calls[1][0])).toContain(`cursor=${encodeURIComponent(first.value.nextCursor!)}`)
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(respond(list("list_scoped_incomplete"))).mockResolvedValueOnce(respond(list("list_scoped_continued")))
    const hidden = await listTerraformBindings(null)
    expect(hidden).toEqual({ kind: "OK", status: 200, value: { rows: [], complete: false, nextCursor: list("list_scoped_incomplete").body.next_cursor } })
    const rest = await listTerraformBindings(null, list("list_scoped_incomplete").body.next_cursor)
    expect(rest.kind === "OK" && [rest.value.rows.length, rest.value.complete, rest.value.nextCursor]).toEqual([2, true, null])
  })

  it("another person's answer is empty and complete; a bad cursor is named; an account not asked about is no row", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(respond(list("list_another_person")))
    expect(await listTerraformBindings(null)).toEqual({ kind: "OK", status: 200, value: { rows: [], complete: true, nextCursor: null } })
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(respond(list("list_cursor_invalid")))
    expect(await listTerraformBindings(null, "x")).toEqual({ kind: "REFUSED", status: 400, code: "CURSOR_INVALID", reason: null })
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(respond(list("list")))
    expect(await listTerraformBindings("111111111111")).toMatchObject({ kind: "UNKNOWN", code: "MALFORMED_RESPONSE" })
  })

  it.each([
    ["complete with a next page", (b: any) => { b.next_cursor = "abc" }],                                   // eslint-disable-line @typescript-eslint/no-explicit-any
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

/** An answer the test releases: ``release(capture)`` answers it, ``fail(error)`` makes the request fail. */
function later() {
  let release!: (c: unknown) => void
  let fail!: (e: Error) => void
  const promise = new Promise<unknown>((resolve, reject) => { release = resolve; fail = reject })
  return { promise, release, fail }
}
type Later = ReturnType<typeof later>

/** The panel's backend: list answers by cursor (a queue per cursor; its last answer repeats), revoke answers in order; each
 *  entry a capture, an Error (the request fails) or a ``later()`` released by the test. Records each request's body. */
function backend({ pages = { "": [list("list")] } as Record<string, unknown[]>, revokes = [] as unknown[] } = {}) {
  const sent: { url: string; body: unknown }[] = []
  const queue = [...revokes]
  const queues = Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, [...v]]))
  const answer = async (entry: unknown) => {
    const value = entry && typeof entry === "object" && "promise" in entry ? await (entry as Later).promise : entry
    if (value instanceof Error) throw value
    return respond(value as never)
  }
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input)
    sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (url.includes("/revoke")) return answer(queue.shift())
    const cursor = new URL(url, "https://app.example").searchParams.get("cursor") ?? ""
    const q = queues[cursor]
    return answer(q ? (q.length > 1 ? q.shift() : q[0]) : list("list_cursor_invalid"))
  })
  return sent
}
const revokesOf = (sent: { url: string; body: unknown }[]) => sent.filter((s) => s.url.includes("/revoke"))
const readsOf = (sent: { url: string; body: unknown }[]) => sent.filter((s) => !s.url.includes("/revoke"))

function ids() {
  let n = 0
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`
}
const panel = (editable: boolean, requestId: () => string) =>
  <TerraformBindingsPanel accountId={ACCOUNT} editable={editable} requestId={requestId} />
async function settled() {
  await waitFor(() => expect(screen.queryAllByTestId(/^terraform-binding-7fb/).length + screen.queryAllByText(/visible to you|read bound|could not/).length).toBeGreaterThan(0))
}
async function mount(requestId: () => string = ids()) {
  const view = render(panel(true, requestId))
  await settled()
  return view
}
const row = (id: string) => within(screen.getByTestId(`terraform-binding-${id}`))
const confirmation = () => within(screen.getByTestId("terraform-binding-revoke-confirm"))
const ROWS = list("list").body.bindings as { binding_id: string; reference_in_your_setups: string }[]
const TARGET = binding("revoke").body.binding_id as string                         // the binding revoke.json answers for
const OTHER = ROWS.map((r) => r.binding_id).find((id) => id !== TARGET)!
const NAMED = ROWS.find((r) => r.reference_in_your_setups === "found")!.binding_id
const revokeButton = (id: string) => row(id).getByRole("button", { name: "Revoke…" }) as HTMLButtonElement
async function confirmAndSend(id: string) {
  fireEvent.click(revokeButton(id))
  fireEvent.click(confirmation().getByLabelText("I confirm this revoke"))
  fireEvent.click(confirmation().getByRole("button", { name: "Revoke" }))
}

describe("the panel", () => {
  it("lists each state with its reference in words -- never 'unused' -- and states what it does not show", async () => {
    backend()
    await mount()
    const text = screen.getByTestId("terraform-bindings-panel").textContent ?? ""
    expect(row(NAMED).getByText(/named by a setup you can see/)).toBeTruthy()
    expect(text.match(/no reference found in your visible setups/g)).toHaveLength(2)
    expect(text).not.toMatch(/unused/i)
    expect(text).toContain("States uploaded before this list existed are not shown here.")
  })

  it("pages with Show more; a page of only uploads no longer visible says so and reads further -- never the end", async () => {
    const first = list("list_page_1")
    backend({ pages: { "": [first], [first.body.next_cursor]: [list("list_page_2")] } })
    await mount()
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    await waitFor(() => expect(screen.getAllByTestId(/^terraform-binding-7fb/)).toHaveLength(2))
    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy()            // page 2 was full: more may follow
    cleanup()
    const hidden = list("list_scoped_incomplete")
    backend({ pages: { "": [hidden], [hidden.body.next_cursor]: [list("list_scoped_continued")] } })
    await mount()
    expect(screen.getByTestId("terraform-bindings-none-yet").textContent).toContain("Show more reads further")
    expect(screen.queryByText(/No Terraform state you uploaded/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    await waitFor(() => expect(screen.getAllByTestId(/^terraform-binding-7fb/)).toHaveLength(2))
    expect([screen.queryByRole("button", { name: "Show more" }), screen.queryByTestId("terraform-bindings-none-yet")]).toEqual([null, null])
    cleanup()
    backend({ pages: { "": [list("list_other_account")] } })
    await mount()
    expect(screen.getByText("No Terraform state you uploaded for this account is visible to you.")).toBeTruthy()
    expect(screen.queryByTestId("terraform-bindings-incomplete")).toBeNull()        // a complete list is never called incomplete
  })

  it("a later page repeating a row already shown is not appended: the list says start again", async () => {
    const first = list("list_page_1")
    const repeat = edited("list_page_2", (b) => { b.bindings = first.body.bindings })
    backend({ pages: { "": [first], [first.body.next_cursor]: [repeat] } })
    await mount()
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("The list changed while you read it; start again"))
    expect(screen.getAllByTestId(/^terraform-binding-7fb/)).toHaveLength(1)
  })

  it("revokes only after an explicit confirmation, at the row's revision, then reads the list again (the record stays)", async () => {
    const sent = backend({ revokes: [binding("revoke")] })
    await mount()
    fireEvent.click(revokeButton(TARGET))
    expect(confirmation().getByText(/This cannot be undone/).textContent).toContain(TARGET)
    expect((confirmation().getByRole("button", { name: "Revoke" }) as HTMLButtonElement).disabled).toBe(true)
    expect(revokesOf(sent)).toHaveLength(0)
    fireEvent.click(confirmation().getByLabelText("I confirm this revoke"))
    fireEvent.click(confirmation().getByRole("button", { name: "Revoke" }))
    await waitFor(() => expect(readsOf(sent)).toHaveLength(2))                        // the list read again
    expect(revokesOf(sent)).toEqual([{ url: `/api/proxy/system-boundary/terraform-bindings/${TARGET}/revoke`,
                                       body: { request_id: "00000000-0000-4000-8000-000000000001", base_revision: 1 } }])
  })

  it("an unknown revoke offers the SAME request again, only when clicked; a refusal is named", async () => {
    const sent = backend({ revokes: [new TypeError("Failed to fetch"), binding("revoke_revoked")] })
    await mount()
    await confirmAndSend(TARGET)
    await waitFor(() => expect(screen.getByText(/Whether it was revoked is not known/)).toBeTruthy())
    expect(revokesOf(sent)).toHaveLength(1)                                           // never resent on its own
    fireEvent.click(screen.getByRole("button", { name: "Send the same revoke again" }))
    await waitFor(() => expect(screen.getByText(/Not revoked \(BINDING_REVOKED\)/)).toBeTruthy())
    const [a, b] = revokesOf(sent).map((s) => s.body)
    expect(b).toEqual(a)
  })

  it("one revoke at a time (L1-F1): while A awaits its answer or is unknown, no other revoke starts and A keeps its retry", async () => {
    const answerA = later()
    const sent = backend({ pages: { "": [list("list")] }, revokes: [answerA, binding("revoke")] })
    await mount()
    await confirmAndSend(TARGET)
    expect(confirmation().getByRole("button", { name: "Revoking…" })).toBeTruthy()
    expect(revokeButton(OTHER).disabled).toBe(true)                                   // B cannot start while A is unanswered
    fireEvent.click(revokeButton(OTHER))
    expect(confirmation().getByText(/This cannot be undone/).textContent).toContain(TARGET)
    expect(screen.getByTestId("terraform-bindings-one-at-a-time")).toBeTruthy()
    await act(async () => { answerA.fail(new TypeError("Failed to fetch")) })          // A's answer arrives late: unknown
    expect(confirmation().getByText(/Whether it was revoked is not known/)).toBeTruthy()
    expect(confirmation().getByText(/This cannot be undone/).textContent).toContain(TARGET)   // A's, never B's
    expect(revokeButton(OTHER).disabled).toBe(true)                                   // still: A's outcome is unresolved
    expect(revokesOf(sent).map((s) => s.url)).toEqual([`/api/proxy/system-boundary/terraform-bindings/${TARGET}/revoke`])
    fireEvent.click(confirmation().getByRole("button", { name: "Send the same revoke again" }))
    await waitFor(() => expect(screen.queryByTestId("terraform-binding-revoke-confirm")).toBeNull())
    await waitFor(() => expect(readsOf(sent)).toHaveLength(2))
    const [first, again] = revokesOf(sent)
    expect([again.url, again.body]).toEqual([first.url, first.body])                  // the exact request, resent when clicked
    expect(revokeButton(OTHER).disabled).toBe(false)                                  // resolved: B may start now
  })

  it("an unknown outcome is dismissed only by the person, and dismissing reads what the server now holds", async () => {
    const sent = backend({ revokes: [new TypeError("Failed to fetch")] })
    await mount()
    await confirmAndSend(TARGET)
    await waitFor(() => expect(screen.getByText(/Whether it was revoked is not known/)).toBeTruthy())
    expect(readsOf(sent)).toHaveLength(1)
    fireEvent.click(confirmation().getByRole("button", { name: "Dismiss and read the list again" }))
    await waitFor(() => expect(readsOf(sent)).toHaveLength(2))
    expect([screen.queryByTestId("terraform-binding-revoke-confirm"), revokesOf(sent).length]).toEqual([null, 1])
    expect(revokeButton(OTHER).disabled).toBe(false)
  })

  it("losing editability (L1-F2) closes every send -- an open, ticked confirmation and an unknown retry -- now and later", async () => {
    const requestId = ids()
    const sent = backend({ revokes: [new TypeError("Failed to fetch")] })
    const view = await mount(requestId)
    fireEvent.click(revokeButton(TARGET))
    fireEvent.click(confirmation().getByLabelText("I confirm this revoke"))
    view.rerender(panel(false, requestId))                                            // the setup stops being editable
    await act(async () => {})
    const send = () => confirmation().getByRole("button", { name: "Revoke" }) as HTMLButtonElement
    expect(send().disabled).toBe(true)
    const tick = confirmation().getByLabelText("I confirm this revoke") as HTMLInputElement
    expect([tick.checked, tick.disabled]).toEqual([false, true])                      // unticked, and cannot be ticked now
    expect(screen.getByTestId("terraform-binding-revoke-not-editable").textContent).toContain("nothing will be sent")
    fireEvent.click(send())
    expect(revokesOf(sent)).toHaveLength(0)
    view.rerender(panel(true, requestId))                                             // editable again: nothing sent by itself
    await act(async () => {})
    expect([send().disabled, revokesOf(sent).length]).toEqual([true, 0])              // the person must confirm again
    fireEvent.click(confirmation().getByLabelText("I confirm this revoke"))
    fireEvent.click(send())
    await waitFor(() => expect(screen.getByText(/Whether it was revoked is not known/)).toBeTruthy())
    view.rerender(panel(false, requestId))
    await act(async () => {})
    const retry = confirmation().getByRole("button", { name: "Send the same revoke again" }) as HTMLButtonElement
    expect(retry.disabled).toBe(true)
    expect(screen.getByTestId("terraform-binding-revoke-not-editable").textContent).toContain("outcome is still unknown")
    fireEvent.click(retry)
    view.rerender(panel(true, requestId))
    await act(async () => {})
    expect([retry.disabled, revokesOf(sent).length]).toEqual([false, 1])             // offered again, never sent on its own
  })

  it("an older read's answer is never applied over a newer one", async () => {
    const first = list("list_page_1")
    const slow = later()
    const sent = backend({ pages: { "": [first, list("list")], [first.body.next_cursor]: [slow] }, revokes: [binding("revoke")] })
    await mount()
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))                // page 2 is slow ...
    await confirmAndSend(TARGET)                                                      // ... a revoke re-reads from the start
    await waitFor(() => expect(screen.getAllByTestId(/^terraform-binding-7fb/)).toHaveLength(3))
    await act(async () => { slow.release(list("list_page_2")) })                      // the older read answers last
    expect(screen.getAllByTestId(/^terraform-binding-7fb/)).toHaveLength(3)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(readsOf(sent)).toHaveLength(3)
  })

  it("a cursor the server refuses says start again, and starting again reads the first page", async () => {
    const first = list("list_page_1")
    const sent = backend({ pages: { "": [first] } })                                  // the next page's cursor is refused
    await mount()
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("start again (CURSOR_INVALID)"))
    fireEvent.click(screen.getByRole("button", { name: "Start again" }))
    await act(async () => {})
    expect(sent.map((s) => new URL(s.url, "https://app.example").searchParams.get("cursor"))).toEqual([null, first.body.next_cursor, null])
  })
})
