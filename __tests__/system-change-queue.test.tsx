import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ChangeQueueView } from "@/components/change-queue-view"

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
})
