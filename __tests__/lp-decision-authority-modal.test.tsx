import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import captured from "./fixtures/lp-decision-authority-chain.json"
import full from "./fixtures/lp-review-preview-install-chain.json"
import { DecisionAuthorityPanel } from "@/components/lp-decision-authority-panel"
import { freshnessAgeLabel } from "@/components/trust/trust-envelope-badge"
import { reviewRefusalCopy } from "@/lib/lp-preview-refusal"
import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"

// Bodies captured from the backend's mounted routes on the install chain (see `_source` in each fixture).

function reply(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response
}

function stubFetch(review: { status: number; body: unknown }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes("/gap-analysis")) return reply(review.status, review.body)
    if (url.includes("/simulate-fix")) return reply(200, full.preview)
    return reply(404, { detail: { code: "FIXTURE_UNROUTED" } })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function renderModal() {
  return render(
    <IAMPermissionAnalysisModal
      isOpen
      onClose={() => {}}
      roleName="fixture-web-role"
      roleArn="arn:aws:iam::111111111111:role/fixture-web-role"
      systemName="fixture-webshop"
      applyDisabled
    />,
  )
}

describe("the mounted IAM Permissions modal renders the decision authority", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("shows the receipted generation from the Review, with coverage and removal kept apart", async () => {
    stubFetch({ status: 200, body: full.review_envelope })
    renderModal()
    const panel = await screen.findByTestId("decision-authority")
    expect(panel.getAttribute("data-kind")).toBe("populated")
    const receipt = full.review_envelope.result.decision_authority.receipt
    expect(within(panel).getByTestId("decision-authority-receipt").textContent).toContain(
      `Generation ${receipt.projection_generation}`,
    )
    expect(within(panel).getByTestId("decision-authority-removal").textContent).toContain("Cleared for removal: 0")
    expect(panel.textContent).toContain("LAYER_UNKNOWN")
  })

  it("shows the Preview's grade as informational and not decision grade", async () => {
    stubFetch({ status: 200, body: full.review_envelope })
    renderModal()
    const preview = await screen.findByTestId("decision-authority-preview", {}, { timeout: 5000 })
    expect(preview.getAttribute("data-grade")).toBe("not_graded")
    expect(preview.textContent).toContain("does not authorize removal")
  })

  it("never labels an install's unread freshness as never synced", async () => {
    stubFetch({ status: 200, body: full.review_envelope })
    renderModal()
    await screen.findByTestId("decision-authority")
    const toggle = document.querySelector("[data-trust-envelope] button") as HTMLElement | null
    expect(toggle).not.toBeNull()
    fireEvent.click(toggle as HTMLElement)
    await waitFor(() => expect(document.body.textContent).toContain("not read on this deployment"))
    expect(document.querySelector("[data-trust-envelope]")?.textContent).not.toContain("never synced")
  })

  it("shows a typed install hold as a hold, never as an empty review", async () => {
    stubFetch({ status: 503, body: { detail: { code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ" } } })
    renderModal()
    await waitFor(() => expect(document.body.textContent).toContain("This view is held on this deployment"))
    expect(screen.queryByTestId("decision-authority")).toBeNull()
  })
})

describe("DecisionAuthorityPanel over each captured state", () => {
  it.each([
    ["populated", "populated"],
    ["empty", "empty"],
    ["role_not_published", "unavailable"],
    ["not_published", "unavailable"],
    ["not_resident", "unavailable"],
  ] as const)("%s renders as %s", (key, kind) => {
    render(<DecisionAuthorityPanel review={captured[key]} />)
    const panel = screen.getByTestId("decision-authority")
    expect(panel.getAttribute("data-kind")).toBe(kind)
    if (kind === "unavailable") {
      expect(screen.queryByTestId("decision-authority-removal")).toBeNull()
      expect(screen.queryByTestId("decision-authority-receipt")).toBeNull()
    }
  })

  it("renders nothing about the Preview before a Preview ran", () => {
    render(<DecisionAuthorityPanel review={captured.populated} />)
    expect(screen.queryByTestId("decision-authority-preview")).toBeNull()
  })
})

describe("copy for install states", () => {
  it("labels each unknown-freshness reason truthfully", () => {
    const base = { last_sync: null, age_seconds: null, status: "unknown" as const }
    expect(freshnessAgeLabel({ ...base, unknown_reason: "not_read_on_install" })).toBe("not read on this deployment")
    expect(freshnessAgeLabel({ ...base, unknown_reason: "lookup_failed" })).toBe("lookup failed")
    expect(freshnessAgeLabel({ ...base, unknown_reason: "unknown_source" })).toBe("unknown (unknown_source)")
    expect(freshnessAgeLabel(base)).toBe("never synced")
  })

  it.each(["SERVING_ROUTE_HELD", "CONSUMER_READINESS_UNOBSERVABLE", "CONSUMER_NOT_READY"])(
    "%s says nothing was read and is not a fact about the role",
    (code) => {
      const copy = reviewRefusalCopy({ code, status: 503, message: "" })
      expect(copy.body).toContain("nothing was read")
      expect(copy.body).toContain("not a fact about this role")
    },
  )
})
