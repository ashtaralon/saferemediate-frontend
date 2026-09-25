/**
 * Callers of useCachedFetch that used to render an EMPTY SUCCESS when the hook
 * had no reading — the state a refused or held read now always produces
 * (data null, error set). Each must name the failure instead.
 *
 * Render chains: app/home-dense/page.tsx → home-dense.tsx → live-now-strip.tsx;
 * app/posture/page.tsx → posture-dashboard.tsx.
 *
 * The refusal body is the backend's own (fixtures/cf01-attack-path-evidence).
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import holdsFixture from "@/__tests__/fixtures/cf01-attack-path-evidence/iap-payments-holds.json"

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined }),
  usePathname: () => "/",
}))

import { LiveNowStrip } from "@/components/dashboard/dense/live-now-strip"
import { PostureDashboard } from "@/components/posture/posture-dashboard"

const REFUSED = (holdsFixture as Record<string, { status: number; body: unknown }>).install_serving_read_refused

function refuseEverything() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(REFUSED.body), {
        status: REFUSED.status,
        headers: { "content-type": "application/json" },
      }),
    ),
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("a refused read is never an empty success", () => {
  it("LiveNowStrip says activity is unavailable, not 'Engine idle'", async () => {
    refuseEverything()
    await act(async () => {
      render(<LiveNowStrip />)
    })
    const unavailable = await screen.findByTestId("live-now-unavailable")
    expect(unavailable).toHaveTextContent("Remediation activity unavailable")
    expect(unavailable).toHaveTextContent("SERVING_READ_REFUSED: FACADE_READ_OUTSIDE_ADMISSION")
    expect(screen.queryByText("Engine idle")).toBeNull()
    expect(screen.queryByText("No remediation events recorded")).toBeNull()
  })

  it("PostureDashboard names the refused summary, not 'has not produced a snapshot yet'", async () => {
    refuseEverything()
    await act(async () => {
      render(<PostureDashboard />)
    })
    await waitFor(() =>
      expect(screen.getByTestId("posture-summary-not-ready")).toHaveTextContent(
        "Posture summary unavailable — Read refused by the server — SERVING_READ_REFUSED: FACADE_READ_OUTSIDE_ADMISSION",
      ),
    )
    expect(screen.queryByText(/has not produced a snapshot yet/)).toBeNull()
  })
})
