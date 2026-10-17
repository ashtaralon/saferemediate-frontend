/**
 * QA-05d (rehearsal.32 QA): adding an account again after it was removed -- Review says so, from the listing's own removed
 * audit: who removed it, when, from what state, and that adding it again starts afresh. Under R1 (fix round r33) the add is
 * immediate; this is information, never a gate.
 *
 * Inputs are the REAL backend's answers (fixtures/settings-c-producer, README): 41_offboarded_listing (222222222222 removed by
 * "Alice Operator") and 29_org_not_configured_setup (the organization read, so the ID can be added only as unverified).
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({ customerId: "acme", refresh: vi.fn() }),
}))
vi.mock("@/components/left-sidebar-nav", () => ({ LeftSidebarNav: () => null }))

import AccountSettingsPage from "@/app/settings/accounts/page"
import offboarded from "@/__tests__/fixtures/settings-c-producer/41_offboarded_listing.json"
import organization from "@/__tests__/fixtures/settings-c-producer/29_org_not_configured_setup.json"
import { formatUtcInstantExact, removedAccountSentence, removedByLabel, type RemovedAccount } from "@/lib/account-admin"

const CUSTOMER = "acme"
const REMOVED = (offboarded as any).body.removed[0] as RemovedAccount

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function install(listing: unknown = (offboarded as any).body) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || "GET"
    if (url === `/api/proxy/admin/accounts?customer_id=${CUSTOMER}` && method === "GET") return json(listing)
    if (url === `/api/proxy/admin/accounts/organization?customer_id=${CUSTOMER}` && method === "GET") {
      return json((organization as any).body)
    }
    if (url.startsWith("/api/proxy/admin/accounts/groups/all?")) return json({ customer_id: CUSTOMER, groups: [] })
    return json({ detail: `unexpected ${method} ${url}` }, 404)
  }))
}

async function reviewAdding(accountId: string, listing?: unknown) {
  install(listing)
  await act(async () => { render(<AccountSettingsPage />) })
  fireEvent.click(await screen.findByRole("button", { name: /Add AWS account/ }))
  const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
  fireEvent.change(within(dialog).getByLabelText(/Read role ARN/), {
    target: { value: `arn:aws:iam::${accountId}:role/CyntroRead-${CUSTOMER}` },
  })
  fireEvent.click(within(dialog).getByRole("button", { name: "Review" }))
  return dialog
}

afterEach(() => { vi.unstubAllGlobals() })

describe("QA-05d: Review of an account added again", () => {
  it("says it was removed before, by whom, when and from what state, and that adding it starts afresh", async () => {
    expect(REMOVED.account_id).toBe("222222222222")
    const dialog = await reviewAdding(REMOVED.account_id)
    const note = within(dialog).getByTestId("add-account-removed-before")
    expect(note).toHaveTextContent(`This account was removed from Cyntro before. ${removedAccountSentence(REMOVED)}`)
    expect(note).toHaveTextContent("Adding it again starts a new registration that collects afresh")
    expect(note).toHaveTextContent("Alice Operator")
    // Information, never a gate: the review is the ordinary (unverified) one, and it can be added once acknowledged.
    expect(within(dialog).getByRole("button", { name: /Add as unverified/ })).toBeInTheDocument()
  })

  it("D13: a removal before confirmation by an unnamed operator says who and when, without the raw token identity", async () => {
    // The QA case, explicitly MUTATED from the 41 capture: the registration was withdrawn before it was confirmed, and the
    // remover's token named nobody (by_display absent), so the backend recorded only "<issuer>#<subject>" (connector.py).
    const withdrawn = {
      ...REMOVED, status: "WITHDRAWN", from_status: "PENDING_UNVERIFIED", by_display: null,
      by: "https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_AbCdEf123#3f2b9c1e-7a6d-4e2f-9b1a-0c8d5e4f6a7b",
    }
    const dialog = await reviewAdding(REMOVED.account_id, { ...(offboarded as any).body, removed: [withdrawn] })
    const note = within(dialog).getByTestId("add-account-removed-before")
    expect(note).toHaveTextContent(
      `This account was removed from Cyntro before. An operator (3f2b9c1e…) removed it on ${formatUtcInstantExact(REMOVED.at!)}, ` +
      "before it was confirmed. Adding it again starts a new registration that collects afresh")
    expect(note).not.toHaveTextContent("cognito-idp")
    expect(note).not.toHaveTextContent("#")
  })

  it("says nothing of the kind for an account never removed", async () => {
    const dialog = await reviewAdding("454545454545")
    expect(within(dialog).queryByTestId("add-account-removed-before")).toBeNull()
  })
})

describe("D13: who removed an account, as people read it", () => {
  const TOKEN = "https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_AbCdEf123#3f2b9c1e-7a6d-4e2f-9b1a-0c8d5e4f6a7b"
  it.each([
    ["the resolved name", { by_display: "Alice Operator", by: TOKEN }, "Alice Operator"],
    ["the resolved email", { by_display: "alice@example.com", by: TOKEN }, "alice@example.com"],
    ["a recorded email", { by_display: null, by: "alice@example.com" }, "alice@example.com"],
    ["a token identity: an operator and the subject, cut past 12", { by_display: null, by: TOKEN }, "An operator (3f2b9c1e…)"],
    ["a short subject whole", { by: "https://cognito-idp.eu-west-1.amazonaws.com/pool#00u-alice" }, "An operator (00u-alice)"],
    ["nothing recorded", { by_display: null, by: null }, null],
  ])("%s", (_name, item, expected) => {
    expect(removedByLabel(item as Pick<RemovedAccount, "by" | "by_display">)).toBe(expected)
  })

  it("says the stage of the removal and its time, and nothing it does not know", () => {
    expect(removedAccountSentence({ status: "WITHDRAWN", by: TOKEN, at: null })).toBe(
      "An operator (3f2b9c1e…) removed it, before it was confirmed.")
    expect(removedAccountSentence({ status: "WITHDRAWN", at: "2026-10-06T13:46:44.993968+00:00" })).toBe(
      "It was removed on 2026-10-06 13:46:44.993 UTC, before it was confirmed.")
  })
})
