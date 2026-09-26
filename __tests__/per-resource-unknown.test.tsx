/**
 * Per-Resource Analysis renders unobserved as UNKNOWN, never "0 used / 100% over-permissioned" (G7 #664/#498).
 *
 * Fixtures are captured from the real backend route (GET /api/remediation/per-resource-analysis/{role}), both at the
 * truthful head (nullable counts, aggregate null unless every resource was observed) and at backend main ae872942
 * (numbers, including 100% for a resource it never observed but marks has_observed_data=false). The mounted panel must
 * render both without throwing, draw no verdict or removal from missing evidence, and keep its legacy writes held.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react"
import truthful from "./fixtures/per-resource-analysis-unknown-chain.json"
import legacy from "./fixtures/per-resource-analysis-legacy-chain.json"
import { PerResourceAnalysis } from "@/components/per-resource-analysis"

type Capture = { role: { role_name: string; role_arn: string; total_permissions: number | null }; analyses: unknown[] }

let requests: { method: string; url: string }[] = []

function serve(capture: Capture) {
  requests = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    requests.push({ method: init?.method || "GET", url })
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
    // Navigation only: the scan lists the captured role so it can be opened; its fields come from the capture.
    if (url.startsWith("/api/proxy/iam/shared-roles")) {
      return json({ shared_roles: [{ role_name: capture.role.role_name, role_arn: capture.role.role_arn,
        allowed_count: capture.role.total_permissions, consumer_kinds: { Lambda: capture.analyses.length } }] })
    }
    if (url.startsWith("/api/proxy/sg/shared-sgs")) return json({ shared_sgs: [] })
    if (url === "/api/proxy/cyntro/analyze") return json(capture)
    return json({ error: "not served in this test" }, 404)
  }))
}

async function open(capture: Capture) {
  serve(capture)
  render(<PerResourceAnalysis />)
  fireEvent.click(screen.getByText("Scan AWS Account"))
  // One consumer kind is not "action required": the role is listed under the other scan tab.
  fireEvent.click(await screen.findByText("No Issues"))
  fireEvent.click(await screen.findByText(capture.role.role_name))
  await screen.findByTestId("per-resource-used")
}

function perResourceTab() {
  fireEvent.click(screen.getByText("Per-Resource View"))
}

function row(name: string) {
  return screen.getAllByText(name).map((el) => el.closest("div.px-4.py-3")).find(Boolean) as HTMLElement
}

beforeEach(() => { requests = [] })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("truthful backend: nullable counts", () => {
  it("a role whose resources were never observed shows unknown and draws no verdict", async () => {
    await open(truthful.unobserved as Capture)
    expect(screen.getByTestId("per-resource-used").textContent).toBe("—")
    expect(screen.getByTestId("per-resource-unused").textContent).toBe("—")
    expect(screen.getByTestId("per-resource-verdict-unknown").textContent).toContain("observed for 0 of 2")
    expect(screen.queryByText(/Over-permissioned|Least privilege achieved|unused permissions detected/i)).toBeNull()
    perResourceTab()
    for (const name of ["idle-a", "idle-b"]) {
      const r = row(name)
      expect(within(r).getByTestId("per-resource-row-used").textContent).toBe("—")
      expect(within(r).getByTestId("per-resource-row-utilization").textContent).toBe("—")
    }
    expect(screen.queryByText(/100%/)).toBeNull()
    expect(screen.queryByText(/remove:/)).toBeNull()
    expect(screen.getByTestId("per-resource-unobserved").textContent).toContain("idle-a, idle-b")
  })

  it("a partially observed role keeps the observed numbers and the aggregate unknown", async () => {
    await open(truthful.mixed as Capture)
    expect(screen.getByTestId("per-resource-used").textContent).toBe("—")      // a partial union is a lower bound
    expect(screen.getByTestId("per-resource-verdict-unknown").textContent).toContain("observed for 1 of 2")
    perResourceTab()
    expect(within(row("worker")).getByTestId("per-resource-row-used").textContent).toBe("2")
    expect(within(row("worker")).getByTestId("per-resource-row-utilization").textContent).toBe("50%")
    expect(within(row("worker")).getByTestId("per-resource-row-unused").textContent).toBe("—")  // role-flat: not derivable
    expect(within(row("idle")).getByTestId("per-resource-row-used").textContent).toBe("—")
    expect(within(row("idle")).getByTestId("per-resource-row-utilization").textContent).toBe("—")
    expect(screen.getByTestId("per-resource-unobserved").textContent).toContain("idle")
    expect(screen.getByTestId("per-resource-observed-keep").textContent).toContain("worker")
    expect(screen.queryByText(/remove:/)).toBeNull()
  })

  it("a fully observed role shows its aggregate but no per-resource removal it cannot derive", async () => {
    await open(truthful.observed as Capture)
    expect(screen.getByTestId("per-resource-used").textContent).toBe("2")
    expect(screen.getByTestId("per-resource-unused").textContent).toBe("2")
    expect(screen.queryByTestId("per-resource-verdict-unknown")).toBeNull()
    perResourceTab()
    expect(within(row("reader")).getByTestId("per-resource-row-used").textContent).toBe("2")
    expect(screen.queryByText(/remove:/)).toBeNull()
  })
})

describe("legacy backend (numbers): still renders, and an unobserved row is unknown", () => {
  it("the 100% it sends for a never-observed resource is not shown", async () => {
    await open(legacy.mixed as Capture)
    expect(screen.getByTestId("per-resource-used").textContent).toBe("—")
    perResourceTab()
    expect(within(row("idle")).getByTestId("per-resource-row-used").textContent).toBe("—")
    expect(within(row("idle")).getByTestId("per-resource-row-utilization").textContent).toBe("—")
    expect(within(row("idle")).getByTestId("per-resource-row-unused").textContent).toBe("—")
    expect(within(row("worker")).getByTestId("per-resource-row-used").textContent).toBe("2")
    expect(screen.queryByText(/100%/)).toBeNull()
    expect(screen.getByTestId("per-resource-unobserved").textContent).toContain("idle")
  })

  it("a fully observed legacy answer renders as before", async () => {
    await open(legacy.observed as Capture)
    expect(screen.getByTestId("per-resource-used").textContent).toBe("2")
    expect(screen.getByTestId("per-resource-unused").textContent).toBe("2")
  })
})

it("the legacy Remediate stays held: no remediate request is sent", async () => {
  await open(truthful.observed as Capture)
  perResourceTab()
  fireEvent.click(screen.getByText("Remediate Now"))
  await waitFor(() => expect(requests.some((r) => r.url.includes("/api/proxy/cyntro/remediate"))).toBe(false))
  expect(requests.filter((r) => r.method !== "GET").map((r) => r.url)).toEqual(["/api/proxy/cyntro/analyze"])
})
