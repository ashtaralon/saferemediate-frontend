import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// A control plane before its first workload account: the scope options list no
// account and the systems catalog is empty. Home must say so and point to
// Settings › Accounts -- not a red "No Neptune-backed SystemName" fault with Retry.

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

let accounts: { account_id: string; display_name: string; regions: string[]; group_ids: string[]; status: string }[] = []
vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({
    customerId: "localtest",
    groupId: "all",
    accountId: "all",
    region: "all",
    options: { customer_id: "localtest", accounts, groups: [] },
    loading: false,
    error: null,
    refresh: vi.fn(),
    setGroupId: vi.fn(),
  }),
}))

vi.mock("@/lib/use-cached-fetch", () => ({
  STALE_BACKEND_RECOVERING: "backend recovering",
  RECOVERY_POLL_MS: 12000,
  useCachedFetch: (url: string | null) => ({
    data: url?.startsWith("/api/proxy/systems") ? { success: true, systems: [] } : null,
    isStale: false,
    cachedAt: null,
    staleReason: null,
    loading: false,
    error: null,
    retry: vi.fn(),
  }),
}))

import { ExecutiveCockpit } from "@/components/dashboard/v3/executive-cockpit"

describe("Home overview with no workload account connected", () => {
  afterEach(() => {
    cleanup()
    push.mockClear()
    accounts = []
  })

  it("names the state and points to Settings › Accounts instead of a fault", () => {
    render(<ExecutiveCockpit />)
    expect(screen.getByText("No AWS accounts connected")).toBeInTheDocument()
    expect(screen.getByText(/The localtest organization has no AWS accounts in scope/)).toBeInTheDocument()
    expect(screen.queryByText(/No Neptune-backed SystemName/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open Settings › Accounts" }))
    expect(push).toHaveBeenCalledWith("/settings/accounts")
  })

  it("an empty catalog WITH an account connected is not the no-accounts state", () => {
    accounts = [{ account_id: "416651950952", display_name: "testbed-webshop", regions: ["eu-west-1"], group_ids: [], status: "active" }]
    render(<ExecutiveCockpit />)
    expect(screen.queryByText("No AWS accounts connected")).not.toBeInTheDocument()
    expect(screen.getByText(/No Neptune-backed SystemName/)).toBeInTheDocument()
  })
})
