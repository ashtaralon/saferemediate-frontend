/// <reference types="vitest/globals" />
/**
 * ReplayVerifyPanel state machine + drift self-heal tests.
 *
 * The state machine derives 6 resting states from (replay_count,
 * last_verdict) on the SimulationRun. The 7th state (verifying) is
 * UI-local during in-flight POST.
 *
 * Critical contract test: drift state auto-clears on a successful
 * BYTE_EQUIVALENT re-verify (feedback_amber_must_self_heal). Without
 * this, drift becomes wallpaper and legitimate amber warnings get
 * ignored.
 */

import React from "react"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  deriveReplayState,
  formatRelativeOrIso,
  ReplayVerifyPanel,
} from "@/components/iam-shared-roles-replay-verify"
import type {
  ReplayResponse,
  SimulationRun,
} from "@/lib/types/atlas-simulate"

type FetchMock = ReturnType<typeof vi.fn>

function makeRun(overrides: Partial<SimulationRun> = {}): SimulationRun {
  return {
    sim_id: "sim-fixt1",
    plan_id: "plan-fixt1",
    role_arn: "arn:aws:iam::000:role/test",
    system_name: "alon-prod",
    started_at: "2026-05-31T05:07:33Z",
    completed_at: "2026-05-31T05:07:33Z",
    status: "COMPLETED",
    catalog_version: "v_2026_05_01",
    engine_version: "0.1.0-pre-alpha",
    counterfactual_id: "sha256:abc",
    graph_snapshot_id: "g1",
    foothold_id: "arn:aws:lambda:eu-west-1:000:function:f",
    foothold_name: "f",
    jewels_total: 2,
    jewels_evaluated: 2,
    before_chains_total: 0,
    after_chains_total: 0,
    pairs_failed: 0,
    error_message: null,
    results: [],
    aggregate: {
      before_chains_total: 0,
      after_chains_total: 0,
      jewels_with_zero_after: 2,
      jewels_with_drop: 0,
    },
    progress: { evaluated: 2, total: 2, failed: 0 },
    replay_count: 0,
    last_replayed_at: null,
    last_verdict: null,
    last_replay_id: null,
    ...overrides,
  }
}

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ──────────────────────────────────────────────────────────────────────
// State derivation (pure)
// ──────────────────────────────────────────────────────────────────────

describe("deriveReplayState", () => {
  it("returns never_verified when replay_count is 0", () => {
    expect(
      deriveReplayState({ replay_count: 0, last_verdict: null })
    ).toBe("never_verified")
  })

  it("returns historical_untracked for pre-PR-A.0 sims (count > 0, verdict null)", () => {
    expect(
      deriveReplayState({ replay_count: 4, last_verdict: null })
    ).toBe("historical_untracked")
  })

  it("maps each verdict literal to its panel state", () => {
    expect(
      deriveReplayState({ replay_count: 1, last_verdict: "BYTE_EQUIVALENT" })
    ).toBe("byte_equivalent")
    expect(
      deriveReplayState({ replay_count: 1, last_verdict: "ENGINE_DRIFT" })
    ).toBe("engine_drift")
    expect(
      deriveReplayState({ replay_count: 1, last_verdict: "PLAN_DRIFT" })
    ).toBe("plan_drift")
    expect(
      deriveReplayState({ replay_count: 1, last_verdict: "SOURCE_MISSING" })
    ).toBe("source_missing")
  })
})

// ──────────────────────────────────────────────────────────────────────
// Time formatter
// ──────────────────────────────────────────────────────────────────────

describe("formatRelativeOrIso", () => {
  const now = new Date("2026-05-31T12:00:00Z").getTime()

  it("falls back to ISO date past 30 days", () => {
    const { display } = formatRelativeOrIso("2026-04-15T12:00:00Z", now)
    expect(display).toBe("2026-04-15")
  })

  it("uses Intl.RelativeTimeFormat under 30 days", () => {
    const { display } = formatRelativeOrIso("2026-05-29T12:00:00Z", now)
    // English RTF "2 days ago" — exact phrasing depends on locale.
    expect(display).toMatch(/\b2\b.*day/i)
  })

  it("returns full ISO in tooltip regardless of display format", () => {
    const iso = "2026-04-15T12:00:00Z"
    const { tooltip } = formatRelativeOrIso(iso, now)
    expect(tooltip).toBe(iso)
  })

  it("graceful — empty display when ISO is missing", () => {
    expect(formatRelativeOrIso(null).display).toBe("—")
    expect(formatRelativeOrIso(undefined).display).toBe("—")
  })
})

// ──────────────────────────────────────────────────────────────────────
// Render smoke per resting state
// ──────────────────────────────────────────────────────────────────────

describe("ReplayVerifyPanel — render per state", () => {
  it("never_verified — CTA reads 'Run replay verify'", () => {
    render(<ReplayVerifyPanel run={makeRun()} />)
    expect(screen.getByText(/Determinism not yet verified/)).toBeTruthy()
    expect(screen.getByRole("button", { name: /Run replay verify/ })).toBeTruthy()
  })

  it("historical_untracked — CTA reads 'Re-verify to capture verdict'", () => {
    render(
      <ReplayVerifyPanel
        run={makeRun({ replay_count: 4, last_verdict: null, last_replayed_at: "2026-05-31T06:49:25Z" })}
      />
    )
    expect(
      screen.getByText(/Replay history exists, verdict not tracked/)
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: /Re-verify to capture verdict/ })
    ).toBeTruthy()
  })

  it("byte_equivalent — calm 'Determinism verified' headline", () => {
    render(
      <ReplayVerifyPanel
        run={makeRun({
          replay_count: 5,
          last_verdict: "BYTE_EQUIVALENT",
          last_replayed_at: "2026-05-31T10:56:53Z",
        })}
      />
    )
    expect(screen.getByText(/Determinism verified/)).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Re-verify$/ })).toBeTruthy()
  })

  it("engine_drift — descriptive 'Engine produced different result' (NOT accusative)", () => {
    render(
      <ReplayVerifyPanel
        run={makeRun({
          replay_count: 6,
          last_verdict: "ENGINE_DRIFT",
          last_replayed_at: "2026-05-31T11:30:00Z",
        })}
      />
    )
    expect(
      screen.getByText(/Engine produced different result than recorded/)
    ).toBeTruthy()
    // Negative assertion: no accusative copy.
    const root = screen.getByText(
      /Engine produced different result/
    ).closest("[data-replay-state]") as HTMLElement
    const text = root.textContent ?? ""
    expect(/suspicious|malicious|hostile|threat/i.test(text)).toBe(false)
  })

  it("plan_drift — footer link, no primary CTA (same pattern as source_missing)", () => {
    // PLAN_DRIFT can't be reconciled by re-verifying the same sim.
    // Panel must NOT render a primary CTA button — disabled CTAs are
    // a UX trap. Instead, the body carries a footer link that sends
    // the operator to the role surface to re-run simulate.
    render(
      <ReplayVerifyPanel
        run={makeRun({
          replay_count: 2,
          last_verdict: "PLAN_DRIFT",
          last_replayed_at: "2026-05-31T11:30:00Z",
        })}
      />
    )
    expect(screen.getByText(/Plan changed since simulate/)).toBeTruthy()
    // No re-verify / re-run-simulate button anywhere in this state.
    expect(screen.queryByRole("button")).toBeNull()
    // Footer link present.
    expect(
      screen.getByText(/re-run simulate from this role/)
    ).toBeTruthy()
  })

  it("source_missing — navigational hint, no primary CTA", () => {
    render(
      <ReplayVerifyPanel
        run={makeRun({
          replay_count: 1,
          last_verdict: "SOURCE_MISSING",
          last_replayed_at: "2026-05-31T11:30:00Z",
        })}
      />
    )
    expect(screen.getByText(/Source plan no longer available/)).toBeTruthy()
    expect(screen.getByText(/browse plans for this role/)).toBeTruthy()
    // No re-verify CTA — the sim can't be re-derived.
    expect(screen.queryByRole("button", { name: /Re-verify/ })).toBeNull()
  })

  it("hides entirely when SimulationRun is not COMPLETED", () => {
    const { container } = render(
      <ReplayVerifyPanel run={makeRun({ status: "RUNNING" })} />
    )
    expect(container.firstChild).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────
// THE critical contract test — drift self-heal
// ──────────────────────────────────────────────────────────────────────

describe("ReplayVerifyPanel — verifying-state transition", () => {
  it("engine_drift → click → verifying (visible during in-flight) → resolves", async () => {
    // Confirms the state machine traverses through the transient
    // "verifying" state instead of jumping straight from amber to
    // green. Important because (a) operator gets immediate feedback
    // the re-verify is happening, (b) prevents the "lying-to-operator"
    // flash where green renders before backend confirms.
    let resolveFetch: ((v: unknown) => void) | null = null
    ;(global.fetch as FetchMock).mockReturnValueOnce(
      new Promise((res) => {
        resolveFetch = res
      })
    )

    const onReverified = vi.fn()
    const driftRun = makeRun({
      replay_count: 6,
      last_verdict: "ENGINE_DRIFT",
      last_replayed_at: "2026-05-31T11:30:00Z",
    })
    const { container } = render(
      <ReplayVerifyPanel run={driftRun} onReverified={onReverified} />
    )

    // Initial state: engine_drift (amber).
    expect(
      (container.querySelector("[data-replay-state]") as HTMLElement)
        .getAttribute("data-replay-state")
    ).toBe("engine_drift")

    // Operator clicks re-verify. fetch is pending (hasn't resolved).
    fireEvent.click(screen.getByRole("button", { name: /^Re-verify$/ }))

    // Panel must immediately transition to verifying — not stay on
    // amber, not jump to green. Asserts the state machine respects
    // the transient state.
    await waitFor(() => {
      expect(
        (container.querySelector("[data-replay-state]") as HTMLElement)
          .getAttribute("data-replay-state")
      ).toBe("verifying")
    })
    expect(screen.getByText(/Verifying determinism/)).toBeTruthy()
    expect(onReverified).not.toHaveBeenCalled()

    // Now resolve the fetch with a BYTE_EQUIVALENT response.
    resolveFetch!({
      ok: true,
      status: 200,
      json: async () => ({ verdict: "BYTE_EQUIVALENT", replay_id: "r1" }),
      text: async () => '{"verdict":"BYTE_EQUIVALENT"}',
    })

    // Parent gets the response; verifying clears.
    await waitFor(() => expect(onReverified).toHaveBeenCalled())
    expect(
      (container.querySelector("[data-replay-state]") as HTMLElement)
        .getAttribute("data-replay-state")
    ).not.toBe("verifying")
  })
})

describe("ReplayVerifyPanel — drift self-heal", () => {
  it("ENGINE_DRIFT → BYTE_EQUIVALENT clears amber when parent refetches", async () => {
    // The component is stateless wrt verdict — it reads from props.
    // Self-heal works because (a) PR-A.0's atomic SET overwrites
    // last_verdict unconditionally on the (:SimulationRun), and (b)
    // the parent refetches after onReverified fires, replacing the
    // run prop with the new BYTE_EQUIVALENT state. This test
    // simulates that flow.

    const onReverified = vi.fn()
    const replayResponse: ReplayResponse = {
      sim_id: "sim-fixt1",
      replay_id: "replay-new-001",
      ran_at: "2026-05-31T12:00:00Z",
      verdict: "BYTE_EQUIVALENT",
      catalog_version_then: "v_2026_05_01",
      catalog_version_now: "v_2026_05_01",
      engine_version_then: "0.1.0-pre-alpha",
      engine_version_now: "0.1.0-pre-alpha",
      counterfactual_id_then: "sha256:abc",
      counterfactual_id_now: "sha256:abc",
      jewels_total: 2,
      jewels_byte_equivalent: 2,
      jewels_drifted: 0,
      per_jewel_drift: [],
      triggered_by: "operator-ui",
      notes: null,
    }
    ;(global.fetch as FetchMock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => replayResponse,
      text: async () => JSON.stringify(replayResponse),
    } as unknown as Response)

    // Start: ENGINE_DRIFT state, amber.
    const driftRun = makeRun({
      replay_count: 6,
      last_verdict: "ENGINE_DRIFT",
      last_replayed_at: "2026-05-31T11:30:00Z",
    })
    const { rerender, container } = render(
      <ReplayVerifyPanel run={driftRun} onReverified={onReverified} />
    )

    const panelBefore = container.querySelector(
      "[data-replay-state]"
    ) as HTMLElement
    expect(panelBefore.getAttribute("data-replay-state")).toBe("engine_drift")

    // Operator clicks re-verify.
    fireEvent.click(
      screen.getByRole("button", { name: /^Re-verify$/ })
    )

    // After fetch resolves, parent gets the new verdict via callback.
    await waitFor(() => {
      expect(onReverified).toHaveBeenCalledWith(replayResponse)
    })

    // Parent refetches and re-renders with the new run state.
    const healedRun = makeRun({
      replay_count: 7,
      last_verdict: "BYTE_EQUIVALENT",
      last_replayed_at: replayResponse.ran_at,
      last_replay_id: replayResponse.replay_id,
    })
    rerender(<ReplayVerifyPanel run={healedRun} onReverified={onReverified} />)

    // The amber state must be gone. No persistent "this plan once
    // drifted" label anywhere in the DOM (feedback_amber_must_self_heal).
    const panelAfter = container.querySelector(
      "[data-replay-state]"
    ) as HTMLElement
    expect(panelAfter.getAttribute("data-replay-state")).toBe(
      "byte_equivalent"
    )
    expect(screen.queryByText(/different result/i)).toBeNull()
    expect(screen.getByText(/Determinism verified/)).toBeTruthy()
  })
})

// ──────────────────────────────────────────────────────────────────────
// Graceful degradation — null per-jewel counts
// ──────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────
// Prod-shape sanity render — captured live sim payload
// ──────────────────────────────────────────────────────────────────────

describe("ReplayVerifyPanel — prod-shape sanity", () => {
  it("renders cleanly against the live alon-prod fixture (sim-fcfcc161d02e)", async () => {
    // Fixture captured 2026-05-31 from
    //   GET https://saferemediate-backend-f.onrender.com/api/iam/shared-roles/simulate/sim-fcfcc161d02e
    // post-PR-A.1 deploy (commit 23b0e8e). All 4 replay-state fields
    // populated: replay_count=5, last_verdict=BYTE_EQUIVALENT,
    // last_replayed_at set, last_replay_id set.
    //
    // This test asserts the component handles the real prod shape
    // without crashing or rendering placeholders — same shape the
    // operator will see in production.
    const fixture = (await import(
      "./fixtures/replay-sim-fcfcc161d02e.json"
    )) as unknown as { default: SimulationRun }
    const run = fixture.default

    const { container } = render(<ReplayVerifyPanel run={run} />)

    // Asserts the BYTE_EQUIVALENT state is reached on real prod data.
    const panel = container.querySelector("[data-replay-state]") as HTMLElement
    expect(panel.getAttribute("data-replay-state")).toBe("byte_equivalent")
    expect(screen.getByText(/Determinism verified/)).toBeTruthy()
    // No undefined placeholders leaked into the DOM.
    expect(panel.textContent ?? "").not.toMatch(/undefined/i)
  })
})

describe("ReplayVerifyPanel — graceful degradation", () => {
  it("renders verdict + relative time + replay_count when jewel counts are absent", () => {
    render(
      <ReplayVerifyPanel
        run={makeRun({
          replay_count: 5,
          last_verdict: "BYTE_EQUIVALENT",
          last_replayed_at: "2026-05-31T10:56:53Z",
          // Force the jewel-totals path off:
          jewels_total: 0,
        })}
      />
    )
    expect(screen.getByText(/Determinism verified/)).toBeTruthy()
    // Must NOT render "0 of 0 jewels" or "undefined of undefined".
    const root = screen.getByText(/Determinism verified/).closest(
      "[data-replay-state]"
    ) as HTMLElement
    const text = root.textContent ?? ""
    expect(text).not.toMatch(/0 of 0 jewels/)
    expect(text).not.toMatch(/undefined/)
    // Replay count headline still present.
    expect(text).toMatch(/Replay #5/)
  })
})
