import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ChangeQueueView } from "@/components/change-queue-view"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe("system Change Queue", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("requests both queues through the server-side SystemName scope", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("change-cases")) {
        return new Response(JSON.stringify({ cases: [] }), { status: 200 })
      }
      if (url.includes("capabilities")) {
        return new Response(JSON.stringify({ capabilities: [] }), { status: 200 })
      }
      return new Response(JSON.stringify({ intents: [] }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<ChangeQueueView systemName="Payment-Production" />)

    expect(await screen.findByRole("heading", { name: "Change Queue · Payment-Production" })).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls.filter((url) => url.includes("change-cases"))[0]).toContain("system_name=Payment-Production")
    expect(urls.filter((url) => url.includes("change-assurance%2Fintents"))).toHaveLength(0)
    expect(urls.find((url) => url.includes("change-assurance/intents"))).toContain("system_name=Payment-Production")
    expect(screen.getByText(/case-insensitive SystemName tag boundary/)).toBeInTheDocument()
  })

  it("keeps Lane 1 dossiers rendering when Change Case storage is down", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("change-cases")) {
        return new Response(
          JSON.stringify({ detail: "tenant lifecycle storage is not ready" }),
          { status: 503 },
        )
      }
      if (url.includes("capabilities")) {
        return new Response(JSON.stringify({ capabilities: [] }), { status: 200 })
      }
      return new Response(JSON.stringify({ intents: [] }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<ChangeQueueView />)

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("tenant lifecycle storage is not ready")
    expect(alert).toHaveTextContent(/tenant lifecycle role/)
    expect(alert).toHaveTextContent("Retry")
    // Lane 1 succeeded — its honest empty state still renders.
    expect(
      await screen.findByText("No customer-authored change has been analyzed yet."),
    ).toBeInTheDocument()
    // Lane 2 must not claim "No Change Cases yet" while its storage is unreadable.
    expect(screen.queryByText("No Change Cases yet")).not.toBeInTheDocument()
  })

  it("shows the analysis failure without hiding the Change Case queue", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("change-cases")) {
        return new Response(JSON.stringify({ cases: [] }), { status: 200 })
      }
      if (url.includes("capabilities")) {
        return new Response(JSON.stringify({ capabilities: [] }), { status: 200 })
      }
      return new Response(JSON.stringify({ detail: "intent listing failed" }), { status: 502 })
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<ChangeQueueView />)

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("intent listing failed")
    // Lane 2 succeeded — its empty state still renders.
    expect(await screen.findByText("No Change Cases yet")).toBeInTheDocument()
    // Lane 1 must not claim nothing was analyzed while its listing is unreadable.
    expect(
      screen.queryByText("No customer-authored change has been analyzed yet."),
    ).not.toBeInTheDocument()
  })

  it("renders the back arrow only on the standalone page", async () => {
    const okFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("change-cases")) return new Response(JSON.stringify({ cases: [] }), { status: 200 })
      if (url.includes("capabilities")) return new Response(JSON.stringify({ capabilities: [] }), { status: 200 })
      return new Response(JSON.stringify({ intents: [] }), { status: 200 })
    })
    vi.stubGlobal("fetch", okFetch)

    const standalone = render(<ChangeQueueView showBack />)
    expect(await screen.findByRole("button", { name: "Back to dashboard" })).toBeInTheDocument()
    standalone.unmount()

    // Embedded in the system-detail dashboard tab: no back arrow.
    render(<ChangeQueueView systemName="Payment-Production" />)
    expect(
      await screen.findByRole("heading", { name: "Change Queue · Payment-Production" }),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Back to dashboard" })).not.toBeInTheDocument()
  })
})
