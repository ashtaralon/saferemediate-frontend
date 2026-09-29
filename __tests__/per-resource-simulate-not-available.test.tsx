/**
 * Backend POST /api/simulate runs no simulation, and no proxy may hand a caller a number from it.
 *
 * That path used to answer a hard-coded confidence and EXECUTE recommendation; it now answers 501
 * SIMULATION_NOT_AVAILABLE_ON_THIS_PATH. Three proxies forward to it (lib/server/legacy-simulate-proxy.ts):
 * /api/proxy/cyntro/simulate (per-resource "Simulate Split"), /api/proxy/simulate (SimulateFixModal), and
 * /api/proxy/systems/[systemId]/issues/[issueId]/simulate (system-detail-dashboard "Simulate Fix"). Backend bodies are
 * captured from the real backend app (fixtures/legacy-simulate-captures.json), for the new handler AND the old one C1
 * still serves, and every answer below is produced by the REAL proxy handlers over those captures.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { NextRequest } from "next/server"
import truthful from "./fixtures/per-resource-analysis-unknown-chain.json"
import captures from "./fixtures/legacy-simulate-captures.json"
import reviewCapture from "./fixtures/per-resource-review-for-recommend.json"
import { PerResourceAnalysis } from "@/components/per-resource-analysis"

const CODE = "SIMULATION_NOT_AVAILABLE_ON_THIS_PATH"
const PROXY_BODY = { role_name: "fixture-role", days: 90 }

type Capture = { status: number; body: unknown }
type Answer = { status: number; body: any; forwarded: { url: string; body: unknown }[] }
type Proxy = "cyntro" | "simulate" | "system-issue"

/** Run a REAL proxy handler with the backend answering `backend`. */
async function proxyOver(backend: Capture, proxy: Proxy = "cyntro"): Promise<Answer> {
  const forwarded: { url: string; body: unknown }[] = []
  const realFetch = globalThis.fetch
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    forwarded.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return new Response(JSON.stringify(backend.body), { status: backend.status, headers: { "Content-Type": "application/json" } })
  }))
  try {
    let res: Response
    if (proxy === "cyntro") {
      const { POST } = await import("@/app/api/proxy/cyntro/simulate/route")
      res = await POST(new NextRequest("http://localhost/api/proxy/cyntro/simulate", {
        method: "POST", body: JSON.stringify(PROXY_BODY),
      }))
    } else if (proxy === "simulate") {
      const { POST } = await import("@/app/api/proxy/simulate/route")
      res = await POST(new NextRequest("http://localhost/api/proxy/simulate", {
        method: "POST", body: JSON.stringify({ finding_id: "fixture-finding" }),
      }))
    } else {
      const { POST } = await import("@/app/api/proxy/systems/[systemId]/issues/[issueId]/simulate/route")
      res = await POST(new NextRequest("http://localhost/api/proxy/systems/fixture-system/issues/fixture-issue/simulate", {
        method: "POST", body: JSON.stringify({}),
      }), { params: Promise.resolve({ systemId: "fixture-system", issueId: "fixture-issue" }) })
    }
    return { status: res.status, body: await res.json(), forwarded }
  } finally {
    vi.stubGlobal("fetch", realFetch)
  }
}

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf)
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [k, ...keysOf(v)])
  }
  return []
}

/** Every key the old backend body or the old proxy reshapes rendered a value from. */
const RENDERED_VALUE_KEYS = ["results", "confidence", "total_events", "successful", "denied", "passed", "all_passed",
  "recommendation", "simulation_id", "current_state", "impact", "blastRadius", "summary", "decision", "simulation",
  "affectedResources", "affected_resources", "affected_resources_count", "status"]

/** The Compare view's data, produced by the REAL recommend proxy over a captured Review (as per-resource-unknown does). */
async function recommendFromCapturedReview(): Promise<unknown> {
  const realFetch = globalThis.fetch
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(reviewCapture.review), { status: 200 })))
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

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

for (const proxy of ["cyntro", "simulate", "system-issue"] as const) {
  describe(`${proxy} proxy: relays only the typed refusal of backend POST /api/simulate`, () => {
    it("the backend's 501 keeps its status, code and message, and nothing else", async () => {
      const answer = await proxyOver(captures.head_not_available, proxy)
      expect(answer.forwarded).toHaveLength(1)
      expect(answer.forwarded[0].url.endsWith("/api/simulate")).toBe(true)
      expect(answer.status).toBe(501)
      expect(answer.body.code).toBe(CODE)
      expect(answer.body.detail.code).toBe(CODE)
      expect(answer.body.error).toBe(captures.head_not_available.body.detail.message)
      expect(JSON.stringify(answer.body)).not.toMatch(/\d/)
    })

    it("an old backend's hard-coded 200 becomes the same typed refusal, with none of its values", async () => {
      const answer = await proxyOver(captures.legacy_fabricated_200, proxy)
      expect(answer.status).toBe(501)
      expect(answer.body.code).toBe(CODE)
      expect(keysOf(answer.body).filter((k) => RENDERED_VALUE_KEYS.includes(k))).toEqual([])
      expect(JSON.stringify(answer.body)).not.toMatch(/\d/)
    })

    it("an old backend's own 400 refusal keeps its status and message", async () => {
      const answer = await proxyOver(captures.legacy_proxy_body_400, proxy)
      expect(answer.status).toBe(400)
      expect(answer.body.error).toBe("resource_id is required")
      expect(JSON.stringify(answer.body)).not.toMatch(/\d/)
    })
  })
}

it("the per-resource proxy forwards the request as sent: no resource ARN built from a hard-coded account", async () => {
  const answer = await proxyOver(captures.head_not_available, "cyntro")
  expect(answer.forwarded[0].body).toEqual(PROXY_BODY)
})

describe("Simulate Split renders the refusal with no numbers", () => {
  const analysis = truthful.observed as any

  async function openWith(simulate: Answer, recommend: unknown) {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
      if (url.startsWith("/api/proxy/iam/shared-roles")) {
        return json({ shared_roles: [{ role_name: analysis.role.role_name, role_arn: analysis.role.role_arn,
          allowed_count: analysis.role.total_permissions, consumer_kinds: { Lambda: analysis.analyses.length } }] })
      }
      if (url.startsWith("/api/proxy/sg/shared-sgs")) return json({ shared_sgs: [] })
      if (url === "/api/proxy/cyntro/analyze") return json(analysis)
      if (url === "/api/proxy/cyntro/recommend") return json(recommend)
      if (url === "/api/proxy/cyntro/simulate") return json(simulate.body, simulate.status)
      return json({ error: "not served in this test" }, 404)
    }))
    render(<PerResourceAnalysis />)
    fireEvent.click(screen.getByText("Scan AWS Account"))
    fireEvent.click(await screen.findByText("No Issues"))
    fireEvent.click(await screen.findByText(analysis.role.role_name))
    await screen.findByTestId("per-resource-used")
  }

  /** Both "Simulate Split" buttons: the per-resource tab's, and the Compare section's (rendered after Compare). */
  async function clickSimulateAndReadBanner(site: "per-resource-tab" | "comparison"): Promise<string> {
    fireEvent.click(screen.getByText("Per-Resource View"))
    expect(screen.getAllByText("Simulate Split")).toHaveLength(1)
    if (site === "comparison") {
      fireEvent.click(screen.getByText("Compare Approaches"))
      await screen.findByTestId("per-resource-cyntro-risk-reduction")
      expect(screen.getAllByText("Simulate Split")).toHaveLength(2)
    }
    const buttons = screen.getAllByText("Simulate Split")
    fireEvent.click(buttons[buttons.length - 1])
    const message = await screen.findByText((text) => text.startsWith(`${CODE}:`))
    return message.closest("div.rounded-lg")?.textContent ?? ""
  }

  for (const [name, backend] of [
    ["the new backend's 501", captures.head_not_available],
    ["an old backend's fabricated 200", captures.legacy_fabricated_200],
  ] as const) {
    for (const site of ["per-resource-tab", "comparison"] as const) {
      it(`over ${name}, from the ${site} button`, async () => {
        const recommend = await recommendFromCapturedReview()
        const answer = await proxyOver(backend)
        await openWith(answer, recommend)
        const banner = await clickSimulateAndReadBanner(site)
        expect(banner).toContain("Error")
        expect(banner).toContain("does not run a simulation")
        expect(banner).not.toMatch(/\d/)
        expect(screen.queryByText("Simulation Results")).toBeNull()
        expect(screen.queryByText(/% confidence/)).toBeNull()
        expect(screen.queryByText(/Events replayed/)).toBeNull()
        expect(screen.queryByText(/Safe to proceed/)).toBeNull()
        expect(screen.queryByText("Execute Live")).toBeNull()
      })
    }
  }
})
