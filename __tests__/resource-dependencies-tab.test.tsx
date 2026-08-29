import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ResourceDependenciesTab } from "@/components/inventory/resource-dependencies-tab"

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({
    customerId: "customer-1",
    groupId: "all",
    accountId: "111111111111",
    region: "eu-west-1",
    options: null,
  }),
}))

function payload({ page = 100, truncated = true } = {}) {
  return {
    success: true,
    resource_id: "sg-1",
    connections: {
      inbound: [
        {
          source: { id: "i-1", name: "payments-api", type: "EC2Instance" },
          relationship: {
            type: "SECURED_BY",
            plane: "ALLOWED",
            evidence_kind: "CONFIG_PROVEN",
            source_system: "security_group_collector",
            freshness: { state: "TIMESTAMP_AVAILABLE", value: "2026-08-29T10:00:00Z" },
          },
        },
      ],
      outbound: [],
    },
    inbound_count: 1,
    outbound_count: 0,
    scope: {
      account_id: "111111111111",
      account_match_mode: "EXACT",
      authority: "SERVER_DEPLOYMENT_CONFIG",
    },
    coverage: {
      inbound: {
        returned: 1,
        relationship_total: truncated ? 192 : 1,
        neighbor_total: truncated ? 170 : 1,
        page_size: page,
        truncated,
      },
      outbound: {
        returned: 0,
        relationship_total: 0,
        neighbor_total: 0,
        page_size: page,
        truncated: false,
      },
    },
  }
}

describe("All Services Dependencies tab", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(cleanup)

  it("renders scoped evidence and refuses to present an empty direction as absence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(payload())))

    render(<ResourceDependenciesTab resourceId="sg-1" />)

    expect(await screen.findByText("Known dependencies within collected scope")).toBeInTheDocument()
    expect(screen.getByText(/192 adjacent graph relationships are recorded/)).toBeInTheDocument()
    expect(screen.getByText("Account 111111111111")).toBeInTheDocument()
    expect(screen.getByText("Identity EXACT")).toBeInTheDocument()
    expect(screen.getByText("payments-api")).toBeInTheDocument()
    expect(screen.getByText("Configured")).toBeInTheDocument()
    expect(screen.getByText("CONFIG_PROVEN")).toBeInTheDocument()
    expect(screen.getByText(/This is not proof that none exist/)).toBeInTheDocument()
    expect(screen.getByText("This dependency set is truncated")).toBeInTheDocument()
  })

  it("requests the expanded bounded page without hiding remaining truncation", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      return Response.json(payload({
        page: url.includes("page=500") ? 500 : 100,
        truncated: true,
      }))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<ResourceDependenciesTab resourceId="sg-1" />)

    const button = await screen.findByRole("button", { name: "Load up to 500 per direction" })
    fireEvent.click(button)

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([value]) => String(value).includes("page=500"))).toBe(true)
    })
    expect(await screen.findByText("This dependency set is truncated")).toBeInTheDocument()
  })

  it("turns a failed read into an explicit no-conclusion state", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(
        { error: "backend unavailable" },
        { status: 503 },
      ))
      .mockResolvedValueOnce(Response.json(payload({ truncated: false })))
    vi.stubGlobal("fetch", fetchMock)

    render(<ResourceDependenciesTab resourceId="sg-1" />)

    expect(await screen.findByText("Dependencies are unavailable")).toBeInTheDocument()
    expect(screen.getByText("No dependency or safety conclusion was produced.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByText("Known dependencies within collected scope")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
