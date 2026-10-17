/**
 * Dependency map observation window: the choice is SENT as `window` (with
 * from/to for custom), the window the backend served (clamped to coverage) is
 * what the map shows, and an absent edge reads "Not observed between <from>
 * and <to>", never "does not exist".
 *
 * Map bodies are TEST INPUTS shaped like /api/dependency-map-v2 plus the
 * effective-window contract (lib/observation-coverage.ts readEffectiveWindow).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://backend.test" }))

import GraphViewV2 from "@/components/dependency-map/graph-view-v2"
import { GET as dependencyMapV2 } from "@/app/api/proxy/dependency-map/v2/route"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const NODES = [
  { id: "i-web", name: "web", type: "EC2", category: "Compute", vpc_id: "vpc-1", is_internet_exposed: false, security_groups: [], permission_gaps: 0 },
  { id: "db-1", name: "orders-db", type: "RDS", category: "Database", vpc_id: "vpc-1", is_internet_exposed: false, security_groups: [], permission_gaps: 0 },
]

const WINDOWS: Record<string, { from: string; to: string; clamped: boolean; reason?: string }> = {
  "7d": { from: "2026-09-24T00:00:00Z", to: "2026-10-01T00:00:00Z", clamped: false },
  "30d": { from: "2026-09-20T00:00:00Z", to: "2026-10-01T00:00:00Z", clamped: true, reason: "coverage begins 2026-09-20" },
  custom: { from: "2026-09-20T00:00:00Z", to: "2026-09-10T23:59:59Z", clamped: true },
}

function mapBody(url: URL) {
  const window = url.searchParams.get("window") || "7d"
  const mode = url.searchParams.get("mode")
  const served = WINDOWS[window]
  return {
    containers: [{ id: "vpc-1", name: "main", type: "VPC" }],
    nodes: NODES,
    edges: mode === "observed+potential"
      ? [{ id: "e-allowed", source: "i-web", target: "db-1", kind: "ALLOWED", port: 5432, protocol: "tcp", flows: 0, bytes_total: 0 }]
      : [],
    coverage: { flow_logs_enabled_enis_pct: 100, analysis_window: window, observed_edges: 0, total_flows: 0, notes: [] },
    effective_window: { from: served.from, to: served.to, requested_window: window, clamped: served.clamped, clamp_reason: served.reason ?? null },
    observation: { from: served.from, to: served.to, sources: [] },
  }
}

function stubMap() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => json(mapBody(new URL(String(input), "https://app.test"))))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

async function waitForServed(text: RegExp) {
  await waitFor(() => expect(screen.getByTestId("effective-window")).toHaveTextContent(text))
}

function requested(fetchMock: ReturnType<typeof vi.fn>): URL[] {
  return fetchMock.mock.calls.map(([input]) => new URL(String(input), "https://app.test"))
}

describe("GraphViewV2 observation window", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("sends window=7d by default and renders the effective window the backend served", async () => {
    const fetchMock = stubMap()
    render(<GraphViewV2 systemName="webshop" />)

    await waitFor(() => expect(screen.getByTestId("effective-window")).toHaveTextContent("Showing 2026-09-24 00:00 UTC → 2026-10-01 00:00 UTC"))
    const [first] = requested(fetchMock)
    expect(first.pathname).toBe("/api/proxy/dependency-map/v2")
    expect(first.searchParams.get("window")).toBe("7d")
    expect(first.searchParams.get("mode")).toBe("observed")
    expect(screen.getByRole("button", { name: "7d" })).toHaveAttribute("aria-pressed", "true")
    // The response's own observation range.
    expect(screen.getByTestId("dependency-map-observation")).toHaveTextContent("Observed 2026-09-24 00:00 UTC → 2026-10-01 00:00 UTC")
    // No observed edges: said with the window, not as "nothing talks".
    expect(screen.getByTestId("no-observed-edges")).toHaveTextContent(
      "No connections were observed between 2026-09-24 00:00 UTC and 2026-10-01 00:00 UTC. Absence in a window is not proof that a connection is unused.",
    )
  })

  it("re-requests with window=30d and shows that the backend clamped it to available coverage", async () => {
    const fetchMock = stubMap()
    render(<GraphViewV2 systemName="webshop" />)
    await waitForServed(/Showing 2026-09-24/)

    fireEvent.click(screen.getByRole("button", { name: "30d" }))

    await waitFor(() => expect(requested(fetchMock).some((url) => url.searchParams.get("window") === "30d")).toBe(true))
    await waitFor(() => expect(screen.getByTestId("effective-window")).toHaveTextContent(
      "Showing 2026-09-20 00:00 UTC → 2026-10-01 00:00 UTC · clamped to available coverage (requested 30d) — coverage begins 2026-09-20",
    ))
    expect(screen.getByTestId("absent-edge-copy")).toHaveTextContent("Not observed between 2026-09-20 00:00 UTC and 2026-10-01 00:00 UTC")
  })

  it("sends a custom window as window=custom with UTC from/to", async () => {
    const fetchMock = stubMap()
    render(<GraphViewV2 systemName="webshop" />)
    await waitForServed(/Showing 2026-09-24/)

    fireEvent.click(screen.getByRole("button", { name: "Custom" }))
    const apply = screen.getByRole("button", { name: "Apply" })
    expect(apply).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Window start (UTC date)"), { target: { value: "2026-09-01" } })
    fireEvent.change(screen.getByLabelText("Window end (UTC date)"), { target: { value: "2026-09-10" } })
    fireEvent.click(apply)

    await waitFor(() => {
      const custom = requested(fetchMock).find((url) => url.searchParams.get("window") === "custom")
      expect(custom?.searchParams.get("from")).toBe("2026-09-01T00:00:00Z")
      expect(custom?.searchParams.get("to")).toBe("2026-09-10T23:59:59Z")
    })
  })

  it("labels absent (allowed, unobserved) edges 'Not observed between <from> and <to>'", async () => {
    const fetchMock = stubMap()
    const { container } = render(<GraphViewV2 systemName="webshop" />)
    await waitForServed(/Showing 2026-09-24/)

    fireEvent.click(screen.getByRole("button", { name: /Potential Paths/ }))
    await waitFor(() => expect(requested(fetchMock).some((url) => url.searchParams.get("mode") === "observed+potential")).toBe(true))
    await waitFor(() => expect(container.querySelector('[data-edge-kind="ALLOWED"] title')).not.toBeNull())

    expect(container.querySelector('[data-edge-kind="ALLOWED"] title')?.textContent).toBe(
      "Allowed by security-group rules. Not observed between 2026-09-24 00:00 UTC and 2026-10-01 00:00 UTC.",
    )
    expect(screen.getByTestId("absent-edge-copy")).toHaveTextContent("Not observed between 2026-09-24 00:00 UTC and 2026-10-01 00:00 UTC")
  })

  it("falls back to 'Not observed in the recorded window' when the backend reports no window", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ containers: [], nodes: NODES, edges: [], coverage: null })))
    render(<GraphViewV2 systemName="webshop" />)

    await waitFor(() => expect(screen.getByTestId("effective-window")).toHaveTextContent(
      "Requested 7 days · the backend did not report the window it served",
    ))
    expect(screen.getByTestId("absent-edge-copy")).toHaveTextContent("Not observed in the recorded window")
    expect(screen.getByTestId("dependency-map-observation")).toHaveTextContent("Observation not recorded yet")
  })
})

describe("dependency-map v2 proxy forwards the window", () => {
  afterEach(() => vi.restoreAllMocks())

  it("passes a custom from/to through to the backend", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ nodes: [], edges: [] }))
    const response = await dependencyMapV2(new NextRequest(
      "https://app.test/api/proxy/dependency-map/v2?systemId=webshop&window=custom&from=2026-09-01T00%3A00%3A00Z&to=2026-09-10T23%3A59%3A59Z&mode=observed",
    ))
    expect(response.status).toBe(200)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://backend.test/api/dependency-map-v2?systemId=webshop&window=custom&from=2026-09-01T00%3A00%3A00Z&to=2026-09-10T23%3A59%3A59Z&mode=observed",
    )
  })
})
