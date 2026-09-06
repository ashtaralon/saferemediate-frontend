import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SavedQuestionGallery } from "@/components/copilot/saved-question-gallery"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function readyCapability() {
  return Response.json({
    enabled: true,
    status: "ready",
    systemName: "payments",
    release_fingerprint: "release-1",
  })
}

async function askWith(response: Record<string, unknown>) {
  const fetchMock = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(readyCapability())
    .mockResolvedValueOnce(Response.json(response))

  render(<SavedQuestionGallery systemName="payments" />)
  const input = await screen.findByPlaceholderText("Ask a question about this system's security graph")
  await waitFor(() => expect(input).toBeEnabled())
  fireEvent.change(input, { target: { value: "how many crown jewels?" } })
  fireEvent.click(screen.getByRole("button", { name: "Ask" }))
  return fetchMock
}

describe("Cyntro Analyst UI states", () => {
  it("renders a deterministic answer with operation and provenance", async () => {
    const fetchMock = await askWith({
      status: "answered",
      effective_scope: { system_id: "payments" },
      operation: "crown_jewels.count",
      deterministic_answer: "There are 2 crown jewels in payments.",
      claims: [{
        claim_id: "claim-1",
        metric: "crown_jewel_count",
        value: 2,
        unit: "count",
        effective_as_of: "2026-09-06T00:00:00Z",
      }],
      provenance: {
        authority_state: "authoritative",
        coverage_state: "complete",
        effective_as_of: "2026-09-06T00:00:00Z",
        limitations: [],
      },
    })

    expect(await screen.findByText("There are 2 crown jewels in payments.")).toBeInTheDocument()
    expect(screen.getByText(/crown_jewels.count/)).toBeInTheDocument()
    expect(screen.getByText(/Coverage: complete/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/proxy/analyst/query",
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("makes partial coverage visible and never turns it into zero", async () => {
    await askWith({
      status: "partial",
      effective_scope: { system_id: "payments" },
      operation: "vulnerabilities.count",
      deterministic_answer: "3 critical vulnerabilities are confirmed; coverage is incomplete.",
      claims: [],
      reason_code: "ANALYST_VULNERABILITY_COVERAGE_INCOMPLETE",
      provenance: {
        authority_state: "insufficient",
        coverage_state: "partial",
        limitations: ["one asset has stale Inspector coverage"],
      },
    })

    expect(await screen.findByText(/This answer is partial/)).toBeInTheDocument()
    expect(screen.getByText(/3 critical vulnerabilities are confirmed/)).toBeInTheDocument()
    expect(screen.getByText("one asset has stale Inspector coverage")).toBeInTheDocument()
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument()
  })

  it("renders abstention as a safe state without an answer", async () => {
    await askWith({
      status: "abstain",
      effective_scope: { system_id: "payments" },
      reason_code: "UNSAFE_REQUEST",
      release_fingerprint: "release-1",
    })

    expect(await screen.findByText(/did not answer because the request is outside/)).toBeInTheDocument()
    expect(screen.getByText("UNSAFE_REQUEST")).toBeInTheDocument()
    expect(screen.queryByTestId("analyst-answer")).not.toBeInTheDocument()
  })

  it("keeps the input disabled when the capability gate is closed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json(
        { enabled: false, status: "unavailable", reason_code: "ANALYST_DISABLED" },
        { status: 503 },
      ),
    )

    render(<SavedQuestionGallery systemName="payments" />)

    expect(await screen.findByText(/not enabled for this customer-resident deployment/)).toBeInTheDocument()
    expect(screen.getByRole("textbox")).toBeDisabled()
  })
})
