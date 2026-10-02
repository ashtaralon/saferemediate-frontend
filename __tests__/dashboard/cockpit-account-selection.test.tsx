/**
 * The Executive cockpit's systems catalog carries the selected account (withAccountScope), so the server's
 * 422 ACCOUNT_SCOPE_REQUIRED there may point at the scope bar -- and, when an account IS selected, it is a
 * diagnostic instead. The REAL fetch hook runs; only the server answer is stubbed (the backend's typed body,
 * cyntro_data/semantic/estate_read.py _refuse_http).
 */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

let selected = "all"
vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({
    customerId: "localtest",
    groupId: "all",
    accountId: selected,
    region: "all",
    options: {
      customer_id: "localtest",
      accounts: [
        { account_id: "416651950952", display_name: "workload-a", regions: ["eu-west-1"], group_ids: [], status: "CONNECTED" },
        { account_id: "376419027176", display_name: "workload-b", regions: ["eu-west-1"], group_ids: [], status: "CONNECTED" },
      ],
      groups: [],
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
    setGroupId: vi.fn(),
  }),
}))

import { ExecutiveCockpit } from "@/components/dashboard/v3/executive-cockpit"

const SCOPE_REQUIRED = { detail: { code: "ACCOUNT_SCOPE_REQUIRED", reason: "several workload accounts are connected" } }
let requested: string[] = []

beforeEach(() => {
  window.localStorage.clear()
  requested = []
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    requested.push(String(url))
    return new Response(JSON.stringify(SCOPE_REQUIRED), { status: 422, headers: { "content-type": "application/json" } })
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  selected = "all"
})

describe("Executive cockpit: a refusal for want of one account", () => {
  it("no account selected: offers the scope bar", async () => {
    render(<ExecutiveCockpit />)
    expect(await screen.findByText(/choose one account in the scope bar/)).toBeInTheDocument()
    expect(requested.some((u) => u.startsWith("/api/proxy/systems") && !u.includes("account_id="))).toBe(true)
  })

  it("an account selected and still refused: a diagnostic, never 'choose an account'", async () => {
    selected = "416651950952"
    render(<ExecutiveCockpit />)
    expect(await screen.findByText(/An account is selected, but the server still asked for one/)).toBeInTheDocument()
    expect(screen.queryByText(/choose one account in the scope bar/)).not.toBeInTheDocument()
    expect(requested.some((u) => u.includes("account_id=416651950952"))).toBe(true)
  })
})
