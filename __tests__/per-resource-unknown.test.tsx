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
import reviewCapture from "./fixtures/per-resource-review-for-recommend.json"
import { NextRequest } from "next/server"
import { PerResourceAnalysis } from "@/components/per-resource-analysis"

type Capture = { role: { role_name: string; role_arn: string; total_permissions: number | null }; analyses: unknown[] }

let requests: { method: string; url: string }[] = []

/** The Compare view's data, produced by the REAL /api/proxy/cyntro/recommend handler over a Review body captured from
 *  the real backend route (fixtures/per-resource-review-for-recommend.json). */
async function recommendFromCapturedReview(review: any = reviewCapture.review): Promise<unknown> {
  const realFetch = globalThis.fetch
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(review), { status: 200 })))
  try {
    const { POST } = await import("@/app/api/proxy/cyntro/recommend/route")
    const res = await POST(new NextRequest("http://localhost/api/proxy/cyntro/recommend", {
      method: "POST", body: JSON.stringify({ role_name: reviewCapture.review.role_name, days: 90 }),
    }))
    expect(res.status).toBe(200)
    return await res.json()
  } finally {
    vi.stubGlobal("fetch", realFetch)
  }
}

let recommendBody: unknown = null

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
    if (url === "/api/proxy/cyntro/recommend" && recommendBody) return json(recommendBody)
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
    expect(within(row("worker")).getByTestId("per-resource-row-used").textContent).toBe("1")
    expect(within(row("worker")).getByTestId("per-resource-row-utilization").textContent).toBe("50%")
    expect(within(row("worker")).getByTestId("per-resource-row-unused").textContent).toBe("—")  // role-flat: not derivable
    expect(within(row("idle")).getByTestId("per-resource-row-used").textContent).toBe("—")
    expect(within(row("idle")).getByTestId("per-resource-row-utilization").textContent).toBe("—")
    expect(screen.getByTestId("per-resource-unobserved").textContent).toContain("idle")
    expect(screen.getByTestId("per-resource-observed-keep").textContent).toContain("worker")
    expect(screen.queryByText(/remove:/)).toBeNull()
    // Review G3: a partially observed role proposes no split and offers no Simulate Split.
    expect(screen.getByTestId("per-resource-split-unavailable").textContent).toContain("1 of 2")
    expect(screen.queryByText(/Split into/)).toBeNull()
    expect(screen.queryByText("Simulate Split")).toBeNull()
  })

  it("a fully observed role shows its aggregate but no per-resource removal it cannot derive", async () => {
    await open(truthful.observed as Capture)
    expect(screen.getByTestId("per-resource-used").textContent).toBe("2")
    expect(screen.getByTestId("per-resource-unused").textContent).toBe("0")
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

  it("a fully observed legacy answer keeps its aggregate but never shows the role-flat subtraction as a removal", async () => {
    await open(legacy.observed as Capture)
    expect(screen.getByTestId("per-resource-used").textContent).toBe("2")
    expect(screen.getByTestId("per-resource-unused").textContent).toBe("2")
    perResourceTab()
    for (const name of ["worker", "reader"]) {
      expect(within(row(name)).getByTestId("per-resource-row-unused").textContent).toBe("—")
    }
    const text = document.body.textContent || ""
    expect(text).not.toMatch(/remove:|remove \d|Never used \(/)
    expect(text).not.toContain("High-risk unused")
    expect(text).not.toMatch(/\(1\)/)          // the legacy backend's invented call_count
  })

  it("the legacy unobserved row carries no risk factor or removal", async () => {
    await open(legacy.mixed as Capture)
    perResourceTab()
    const text = document.body.textContent || ""
    expect(text).not.toContain("High-risk unused")
    expect(text).not.toMatch(/remove:|remove \d|Never used \(/)
  })
})

it("the legacy Remediate stays held: no remediate request is sent", async () => {
  await open(truthful.observed as Capture)
  perResourceTab()
  fireEvent.click(screen.getByText("Remediate Now"))
  await waitFor(() => expect(requests.some((r) => r.url.includes("/api/proxy/cyntro/remediate"))).toBe(false))
  expect(requests.filter((r) => r.method !== "GET").map((r) => r.url)).toEqual(["/api/proxy/cyntro/analyze"])
})


describe("Compare Approaches over the real recommend proxy", () => {
  beforeEach(async () => { recommendBody = await recommendFromCapturedReview() })
  afterEach(() => { recommendBody = null })

  it("with no resource observed, the per-resource card claims no exposure, reduction or elimination", async () => {
    await open(truthful.unobserved as Capture)
    perResourceTab()
    expect(screen.getByTestId("per-resource-split-unavailable").textContent).toContain("0 of 2")
    expect(screen.queryByText(/Split into/)).toBeNull()
    expect(screen.queryByText("Simulate Split")).toBeNull()
    fireEvent.click(screen.getByText("Compare Approaches"))
    await screen.findByTestId("per-resource-cyntro-risk-reduction")
    expect(screen.getByTestId("per-resource-cyntro-exposure").textContent).toBe("—")
    expect(screen.getByTestId("per-resource-cyntro-risk-reduction").textContent).toBe("—")
    expect(screen.queryByText(/more risk/)).toBeNull()
    expect(screen.queryByText("Simulate Split")).toBeNull()
  })

  it("with every resource observed, the card states the observed numbers", async () => {
    await open(truthful.observed as Capture)
    perResourceTab()
    expect(screen.queryByTestId("per-resource-split-unavailable")).toBeNull()
    fireEvent.click(screen.getByText("Compare Approaches"))
    await screen.findByTestId("per-resource-cyntro-risk-reduction")
    expect(screen.getByTestId("per-resource-cyntro-exposure").textContent).toBe("3")    // worker 1 + reader 2
    // Both sides from the one per-resource answer (the Review and it describe ONE role): grant 2 x 2 resources = 4,
    // after = 1 + 2 = 3 -> 25%; the aggregated fix gives each resource the observed union (2), 2 x 2 = 4 -> 25% more.
    expect(screen.getByTestId("per-resource-cyntro-risk-reduction").textContent).toBe("25%")
    expect(screen.getByTestId("per-resource-eliminates").textContent).toContain("25% more risk")
    // Positive control for the wildcard case's "no bar" assertion: here the same selector finds the bar.
    expect(screen.getByTestId("per-resource-cyntro-risk-reduction").closest("div.pt-3")?.querySelector("div.h-2")).not.toBeNull()
    expect(screen.getByTestId("per-resource-aggregated-used").textContent).toContain("1")  // the Review's used count
    expect(screen.getAllByText("Simulate Split").length).toBeGreaterThan(0)
  })
})

describe("/api/proxy/cyntro/analyze passes the backend through, never synthesizes", () => {
  async function callAnalyze(backend: Response) {
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => { calls.push(String(input)); return backend }))
    const { POST } = await import("@/app/api/proxy/cyntro/analyze/route")
    const res = await POST(new NextRequest("http://localhost/api/proxy/cyntro/analyze", {
      method: "POST", body: JSON.stringify({ role_name: "shared-app-role", days: 90 }),
    }))
    return { res, calls }
  }

  it("a held per-resource read is returned as the backend's own refusal, with no gap-analysis fallback", async () => {
    const refusal = { detail: { code: "LP_ANALYSIS_VIEW_HELD", message: "held on this install" } }
    const { res, calls } = await callAnalyze(new Response(JSON.stringify(refusal), { status: 503 }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual(refusal)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain("/api/remediation/per-resource-analysis/shared-app-role")
  })

  it("a served answer passes through unchanged", async () => {
    const { res, calls } = await callAnalyze(new Response(JSON.stringify(truthful.mixed), { status: 200 }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(truthful.mixed)
    expect(calls).toHaveLength(1)
  })
})


describe("a grant the observations cannot be compared with (real wildcard capture)", () => {
  beforeEach(async () => { recommendBody = await recommendFromCapturedReview(reviewCapture.review_wildcard) })
  afterEach(() => { recommendBody = null })

  it("draws no reduction, no elimination claim and says why", async () => {
    await open(truthful.wildcard as Capture)
    const verdict = screen.getByTestId("per-resource-verdict-unknown").textContent || ""
    expect(verdict).toContain("Every resource was observed")
    expect(verdict).toContain("wildcards")
    perResourceTab()
    const util = within(row("worker")).getByTestId("per-resource-row-utilization")
    expect(util.textContent).toBe("—")
    expect(util.getAttribute("title")).toContain("wildcards")
    fireEvent.click(screen.getByText("Compare Approaches"))
    await screen.findByTestId("per-resource-cyntro-risk-reduction")
    expect(screen.getByTestId("per-resource-cyntro-risk-reduction").textContent).toBe("—")
    expect(screen.queryByTestId("per-resource-eliminates")).toBeNull()
    // The label and its value are separate elements, so a text regex across them could never match: assert the value
    // itself carries no percentage, and that no reduction bar is drawn for it.
    expect(screen.getByTestId("per-resource-cyntro-risk-reduction").textContent).not.toMatch(/%/)
    expect(screen.getByTestId("per-resource-cyntro-risk-reduction").closest("div.pt-3")?.querySelector("div.h-2")).toBeNull()
  })
})

describe("the recommend proxy's hold is shown", () => {
  beforeEach(async () => {
    // The captured Review with its summary counts removed: an answer that does not carry them.
    const review = JSON.parse(JSON.stringify(reviewCapture.review))
    delete review.summary.total_permissions
    delete review.summary.used_count
    recommendBody = await recommendFromCapturedReview(review)
  })
  afterEach(() => { recommendBody = null })

  it("says usage was not measured and proposes nothing", async () => {
    await open(truthful.observed as Capture)
    perResourceTab()
    fireEvent.click(screen.getByText("Compare Approaches"))
    expect((await screen.findByTestId("per-resource-recommend-held")).textContent).toContain("Held: usage not measured")
    expect(screen.getByTestId("per-resource-aggregated-used").textContent).toContain("—")
  })
})
