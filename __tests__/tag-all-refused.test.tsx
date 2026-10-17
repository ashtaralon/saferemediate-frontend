/**
 * D18 (resident QA, 2026-10-09): System detail's "Tag All Resources" POSTs /api/proxy/auto-tag. On a resident install the
 * backend contains that write (api/auto_tag.py -> refuse_off_boundary_http("aws_system_tag_write")) and answers 409
 * off_boundary_mutation_refused, which the proxy relays typed. The page showed it as a red "Error: <backend prose>".
 * Now the refusal is handled BY NAME: not available on this installation, nothing written, and membership is set through
 * the System Boundary wizard. The dashboard also no longer calls /api/proxy/auto-tag-trigger (no backend route is mounted).
 *
 * Harness: the REAL SystemDetailDashboard (as egress-deep-link-identity.test.tsx renders it). /api/proxy/auto-tag is the
 * REAL proxy route (app/api/proxy/auto-tag/route.ts), whose backend call answers the backend's 409 body
 * (tests/test_auto_tag_containment.py pins its reason_code / path / contained; the message is the registry's
 * aws_system_tag_write reason, unified/mutation_boundary/off_boundary_refusal.py). Every other URL answers 404.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
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
import { POST as autoTagProxy } from "@/app/api/proxy/auto-tag/route"

const NAME = "payments"
const BACKEND_409 = {
  detail: {
    error: "off_boundary_mutation_refused",
    reason_code: "off_boundary_mutation_refused",
    message: "aws_system_tag_write: POST /api/auto-tag with dry_run=false writes the SystemName tag into AWS (ec2:CreateTags, "
      + "tag:TagResources, s3:PutBucketTagging and per-service TagResource) through ambient SDK clients straight from the route",
    path: "aws_system_tag_write",
    contained: true,
  },
}

function stubFetch(backendAnswer: { status: number; body: unknown }) {
  const urls: { url: string; method: string }[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase()
    urls.push({ url, method })
    if (url === "/api/proxy/auto-tag") {
      // The browser's call reaches the REAL proxy route.
      return autoTagProxy(new Request("https://app.example/api/proxy/auto-tag", { method: "POST", body: init?.body as string,
        headers: { "Content-Type": "application/json" } }))
    }
    if (/^https?:\/\/[^/]+\/api\/auto-tag$/.test(url)) {
      // The proxy's backend call: the backend's own answer.
      return new Response(JSON.stringify(backendAnswer.body), { status: backendAnswer.status, headers: { "Content-Type": "application/json" } })
    }
    return { ok: false, status: 404, headers: new Headers({ "Content-Type": "application/json" }),
             json: async () => ({ error: "unrouted in test" }), text: async () => "{}" } as unknown as Response
  }))
  return urls
}

async function openTagAll() {
  await act(async () => {
    render(
      <AccountScopeProvider>
        <SystemDetailDashboard systemName={NAME} onBack={() => undefined} initialTab="overview" />
      </AccountScopeProvider>,
    )
  })
  fireEvent.click(await screen.findByRole("button", { name: `Tag All Resources in ${NAME}` }))
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tag All Resources" })) })
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

describe("Tag All Resources on an installation that contains the AWS tag write", () => {
  it("says the write is not available here by name, that nothing was written, and where membership is set", async () => {
    const urls = stubFetch({ status: 409, body: BACKEND_409 })
    await openTagAll()
    const refused = await screen.findByTestId("tag-write-refused")
    expect(refused.textContent).toBe(
      "Not available on this installation" +
      "Writing tags to AWS is not available on this installation (off_boundary_mutation_refused); nothing was written. " +
      "A system's membership in Cyntro is set through the System Boundary wizard: Systems › Add System.")
    // Not an error, not a success, and no retry offered for a write the installation refuses.
    expect(screen.queryByText("Error:")).toBeNull()
    expect(screen.queryByText("Tagging Complete!")).toBeNull()
    expect(screen.queryByRole("button", { name: "Tag All Resources" })).toBeNull()
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy()
    // Precondition: the real proxy was asked, and it asked the backend.
    expect(urls.filter((u) => u.url === "/api/proxy/auto-tag" && u.method === "POST")).toHaveLength(1)
    expect(urls.some((u) => /\/api\/auto-tag$/.test(u.url) && u.url !== "/api/proxy/auto-tag")).toBe(true)
  })

  it("control: a refusal of another kind is still shown as an error with its own message", async () => {
    stubFetch({ status: 422, body: { detail: { code: "SYSTEM_NAME_REQUIRED", message: "systemName is required" } } })
    await openTagAll()
    await waitFor(() => expect(screen.getByText("systemName is required")).toBeTruthy())
    expect(screen.queryByTestId("tag-write-refused")).toBeNull()
  })

  it("the dashboard never calls /api/proxy/auto-tag-trigger (no backend route is mounted for it)", () => {
    const source = readFileSync(resolve(process.cwd(), "components/system-detail-dashboard.tsx"), "utf8")
    expect(source).not.toContain("/api/proxy/auto-tag-trigger")
  })
})
