import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SavedQuestionGallery } from "@/components/copilot/saved-question-gallery"
import { fetchWithEnvelope } from "@/components/trust/use-trust-envelope"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/**
 * The copilot's inventory questions are dormant: no rendered control reaches them (measured
 * 2026-09-16 on frontend main c5235ad7). Their refusal handling is ready, but re-exposing them
 * is a deliberate, reviewed change. This control fails if a control starts issuing an
 * inventory or copilot/ask request without that review.
 */
describe("the copilot inventory routes stay unreachable from the rendered gallery", () => {
  it("no rendered control issues a resource-inventory or copilot/ask request", async () => {
    const urls: string[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : input.url
      urls.push(url)
      if (url.startsWith("/api/proxy/analyst/query?")) {
        return Response.json({ enabled: true, status: "ready", systemName: "payments" })
      }
      return Response.json({ status: "abstain", reason_code: "ANALYST_OUT_OF_SCOPE" })
    })
    render(<SavedQuestionGallery systemName="payments" />)
    const input = await screen.findByPlaceholderText("Ask a question about this system's security graph")
    await waitFor(() => expect(input).toBeEnabled())
    for (const label of ["How many S3 buckets do I have?", "List my IAM roles", "Count resources by type"]) {
      expect(screen.queryByText(label)).toBeNull()
    }
    const clicked = new Set<string>()
    for (let round = 0; round < 20; round++) {
      const next = screen
        .getAllByRole("button")
        .find((button) => !clicked.has(button.textContent || "") && !(button as HTMLButtonElement).disabled)
      if (!next) break
      clicked.add(next.textContent || "")
      await act(async () => {
        fireEvent.click(next)
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(clicked.size).toBeGreaterThan(0)
    expect(urls.filter((url) => url.includes("resource-inventory") || url.includes("copilot/ask"))).toEqual([])
  })

  it("positive control: the same recorder does see an inventory request", async () => {
    const urls: string[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      urls.push(typeof input === "string" ? input : input.url)
      return Response.json({ result: { count: 1 }, provenance: null })
    })
    await fetchWithEnvelope("/api/proxy/resource-inventory/count?resource_type=s3")
    expect(urls.some((url) => url.includes("resource-inventory/count"))).toBe(true)
  })
})
