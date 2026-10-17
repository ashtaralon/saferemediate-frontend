/**
 * B5 review fix (2026-10-08): the Traffic tab's deep link (the Attack Path exfil chip's "View in Traffic") belongs to the
 * system IDENTITY that was open when it arrived (name + key + account). Two identities may share a name: switching from one
 * to the other must never carry the first one's workload filter over, and the deep link is CONSUMED once the Traffic tab
 * has taken it. Transition test for the final phase -- WRITTEN, NOT RUN.
 *
 * Harness: the real SystemDetailDashboard (as __tests__/brss-held-score-surfaces.test.tsx renders it); fetch is routed by
 * URL and every unrouted URL answers 404, so the only thing asserted is WHICH egress inventory request the page makes.
 */
import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  router: { push: () => undefined, replace: () => undefined, prefetch: () => undefined, back: () => undefined },
}))
vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => nav.router,
  usePathname: () => "/",
}))

import { SystemDetailDashboard } from "@/components/system-detail-dashboard"
import { AccountScopeProvider } from "@/lib/account-scope-context"

const NAME = "payments"
const KEY_A = "split:payments@team@222222222222/eu-west-1"
const KEY_B = "authored:payments"
const ACCOUNT = "222222222222"

function stubFetch() {
  const urls: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    urls.push(url)
    return { ok: false, status: 404, headers: new Headers({ "Content-Type": "application/json" }),
             json: async () => ({ error: "unrouted in test" }), text: async () => "{}" } as unknown as Response
  }))
  return urls
}

const inventoryRequests = (urls: string[]) =>
  urls.filter((u) => u.includes("/external-inventory")).map((u) => new URL(`https://x${u}`).searchParams)

function page(systemKey: string, systemAccountId: string | null, initialTab: string) {
  return (
    <AccountScopeProvider>
      <SystemDetailDashboard systemName={NAME} systemKey={systemKey} systemAccountId={systemAccountId}
                             onBack={() => undefined} initialTab={initialTab} />
    </AccountScopeProvider>
  )
}

function deepLink(workloadId: string) {
  window.dispatchEvent(new CustomEvent("cyntro:traffic:deep-link", { detail: { workloadId, direction: "outbound" } }))
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("the Traffic deep link is the open identity's, and is consumed", () => {
  it("lands on that identity's inventory filtered to the workload", async () => {
    const urls = stubFetch()
    render(page(KEY_A, ACCOUNT, "egress"))
    await act(async () => deepLink("i-0aaa"))
    await waitFor(() => expect(inventoryRequests(urls).length).toBeGreaterThan(0))
    const [first] = inventoryRequests(urls)
    expect([first.get("workload_id"), first.get("system_key"), first.get("account_id")]).toEqual(["i-0aaa", KEY_A, ACCOUNT])
  })

  it("switching to another identity of the same name never inherits the workload filter", async () => {
    const urls = stubFetch()
    const { rerender } = render(page(KEY_A, ACCOUNT, "egress"))
    await act(async () => deepLink("i-0aaa"))
    await waitFor(() => expect(inventoryRequests(urls).length).toBeGreaterThan(0))
    urls.length = 0
    rerender(page(KEY_B, null, "egress"))
    fireEvent.click(await screen.findByRole("button", { name: "Traffic Inventory" }))
    await waitFor(() => expect(inventoryRequests(urls).length).toBeGreaterThan(0))
    for (const request of inventoryRequests(urls)) {
      expect(request.get("system_key")).toBe(KEY_B)
      expect(request.has("workload_id")).toBe(false)
    }
  })

  it("a deep link that arrived for one identity is dropped when another opens before the Traffic tab", async () => {
    const urls = stubFetch()
    const { rerender } = render(page(KEY_A, ACCOUNT, "overview"))
    await act(async () => deepLink("i-0aaa"))
    rerender(page(KEY_B, null, "overview"))
    await act(async () => {
      window.dispatchEvent(new CustomEvent("cyntro:navigate-tab", { detail: { tabId: "egress" } }))
    })
    fireEvent.click(await screen.findByRole("button", { name: "Traffic Inventory" }))
    await waitFor(() => expect(inventoryRequests(urls).length).toBeGreaterThan(0))
    expect(inventoryRequests(urls).every((request) => !request.has("workload_id"))).toBe(true)
  })

  it("is consumed: leaving the Traffic tab and coming back does not re-apply it", async () => {
    const urls = stubFetch()
    render(page(KEY_A, ACCOUNT, "egress"))
    await act(async () => deepLink("i-0aaa"))
    await waitFor(() => expect(inventoryRequests(urls).length).toBeGreaterThan(0))
    await act(async () => {
      window.dispatchEvent(new CustomEvent("cyntro:navigate-tab", { detail: { tabId: "overview" } }))
    })
    urls.length = 0
    await act(async () => {
      window.dispatchEvent(new CustomEvent("cyntro:navigate-tab", { detail: { tabId: "egress" } }))
    })
    fireEvent.click(await screen.findByRole("button", { name: "Traffic Inventory" }))
    await waitFor(() => expect(inventoryRequests(urls).length).toBeGreaterThan(0))
    expect(inventoryRequests(urls).every((request) => !request.has("workload_id"))).toBe(true)
  })
})
