/**
 * A connected account's basic resource discovery on its Settings › Accounts row: how far the run is, and Retry only where a
 * retry can repair something. Answers are the producer's captures (backend tests/fixtures/account_resources_captures, byte-
 * equal here); a case that changes one names it.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DiscoveryRowStatus, type RetrySender } from "@/components/accounts/discovery-row-status"
import { discoveryRetryable, parseDiscoveryResponse, type DiscoveryFetcher, type DiscoveryStatus } from "@/lib/account-resources"

function capture(name: string): { status: number; body: Record<string, any> } {
  const file = JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/account-resources", `${name}.json`), "utf8"))
  return { status: file.status, body: structuredClone(file.body) }
}

const ACCOUNT: string = capture("discovery_access_needed").body.account_id
const CUSTOMER = "acme"

async function row(answer: { status: number; body: unknown }, send: RetrySender = vi.fn(async () => ({ ok: true, status: 202, code: null }))) {
  const fetchStatus: DiscoveryFetcher = async () => answer
  await act(async () => {
    render(<DiscoveryRowStatus accountId={ACCOUNT} customerId={CUSTOMER} fetchStatus={fetchStatus} send={send} />)
  })
  return send
}

describe("the account row's discovery", () => {
  it("a run with a listing refused for access offers Retry, bound to the registration and run on screen", async () => {
    const body = capture("discovery_access_needed").body
    const send = await row({ status: 200, body })
    expect(screen.getByTestId(`discovery-row-${ACCOUNT}`).textContent).toContain("0 resources found · finished with 1 gap")
    fireEvent.click(screen.getByRole("button", { name: `Retry resource discovery for ${ACCOUNT}` }))
    await waitFor(() => expect(screen.getByText("Retry requested · waiting for discovery to resume")).toBeTruthy())
    expect(send).toHaveBeenCalledWith(
      `/api/proxy/admin/accounts/${ACCOUNT}/discovery-retry?customer_id=${CUSTOMER}`,
      { registration_id: body.registration_id, run_id: body.run_id })
  })

  it("a complete run says complete for the supported types and offers no Retry", async () => {
    await row(capture("discovery_listed_empty"))
    expect(screen.getByTestId(`discovery-row-${ACCOUNT}`).textContent).toContain("0 resources found · complete for the supported types")
    expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull()
  })

  it("a gap only a new reader can close (not supported yet) offers no Retry", async () => {
    const status = parseDiscoveryResponse(200, capture("discovery_complete_with_gaps").body, ACCOUNT) as DiscoveryStatus
    expect(status.gaps.map((g) => g.status)).toEqual(["UNSUPPORTED"])
    expect(discoveryRetryable(status)).toBe(false)
    await row(capture("discovery_complete_with_gaps"))
    expect(screen.getByTestId(`discovery-row-${ACCOUNT}`).textContent).toContain("7 resources found · finished with 0 gaps")
    expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull()
  })

  it("a moving run says found so far", async () => {
    await row(capture("discovery_no_plan_yet"))
    expect(screen.getByTestId(`discovery-row-${ACCOUNT}`).textContent).toContain("Resources: discovering · 0 resources found so far")
  })

  it("a held run says held, with its code, and offers nothing", async () => {
    await row(capture("discovery_held_account_removed"))
    expect(screen.getByTestId(`discovery-row-${ACCOUNT}`).textContent).toBe("Resources: held (ACCOUNT_REMOVED)")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("an account without a run shows nothing (it keeps the published inventory)", async () => {
    await row(capture("discovery_not_requested"))
    expect(screen.queryByTestId(`discovery-row-${ACCOUNT}`)).toBeNull()
  })

  it("a start message held by a blocker is named, and Retry is offered (a case: the dispatch blocker set)", async () => {
    const body = { ...capture("discovery_no_plan_yet").body, dispatch: { state: "PENDING", at: null, blocker: "SEND_FAILED:Throttling" } }
    await row({ status: 200, body })
    expect(screen.getByText("Discovery has not started: SEND_FAILED:Throttling")).toBeTruthy()
    expect(screen.getByRole("button", { name: `Retry resource discovery for ${ACCOUNT}` })).toBeTruthy()
  })

  it("a refused retry is named and can be asked again", async () => {
    const send = vi.fn(async () => ({ ok: false, status: 409, code: "DISCOVERY_RUN_SUPERSEDED" }))
    await row(capture("discovery_access_needed"), send)
    fireEvent.click(screen.getByRole("button", { name: `Retry resource discovery for ${ACCOUNT}` }))
    expect((await screen.findByRole("alert")).textContent).toBe("Retry not accepted (DISCOVERY_RUN_SUPERSEDED).")
    expect(screen.getByRole("button", { name: `Retry resource discovery for ${ACCOUNT}` }).hasAttribute("disabled")).toBe(false)
  })
})

/** The 202 only queues the request: the row follows it. Answers are the captures with the `retry` field set per case. */
describe("following an accepted retry", () => {
  const BUTTON = { name: `Retry resource discovery for ${ACCOUNT}` }
  const gap = (retry: Record<string, unknown> | null) => ({ status: 200, body: { ...capture("discovery_access_needed").body, retry } })

  type Answer = { status: number; body: unknown }
  function followed(answers: Answer[], send: RetrySender = vi.fn(async () => ({ ok: true, status: 202, code: null })),
    override: () => Promise<Answer> | null = () => null) {
    let calls = 0
    const fetchStatus: DiscoveryFetcher = async () => (await override()) ?? answers[Math.min(calls++, answers.length - 1)]
    render(<DiscoveryRowStatus accountId={ACCOUNT} customerId={CUSTOMER} fetchStatus={fetchStatus} send={send}
      followMs={5} followMax={4} />)
    return { send, calls: () => calls }
  }

  it("a queued request whose run starts later: the row keeps following, then shows the moving run", async () => {
    const queued = gap({ status: "queued", outcome: null, detail: null })
    const done = gap({ status: "done", outcome: "DISCOVERY_RETRY_SENT", detail: null })
    const started = { status: 200, body: { ...capture("discovery_no_plan_yet").body,
      retry: { status: "done", outcome: "DISCOVERY_RETRY_SENT", detail: null } } }
    followed([gap(null), queued, queued, done, started])
    fireEvent.click(await screen.findByRole("button", BUTTON))
    expect(await screen.findByText("Retry requested · waiting for discovery to resume")).toBeTruthy()
    expect(screen.queryByRole("button", BUTTON)).toBeNull()
    await waitFor(() => expect(screen.getByTestId(`discovery-row-${ACCOUNT}`).textContent)
      .toContain("Resources: discovering · 0 resources found so far"))
    // The follow ends on that answer (the effect runs right after the render that shows it), never at the bound.
    await waitFor(() => expect(screen.queryByText(/waiting for discovery to resume|has not changed yet/)).toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(screen.queryByText(/waiting for discovery to resume|has not changed yet/)).toBeNull()
  })

  it("a retry that finishes between two refreshes ends the follow on COMPLETE, without a moving answer in between", async () => {
    const sent = { status: "done", outcome: "DISCOVERY_RETRY_SENT", detail: null }
    const complete = { status: 200, body: { ...capture("discovery_listed_empty").body, retry: sent } }
    followed([gap(null), gap({ status: "queued", outcome: null, detail: null }), complete])
    fireEvent.click(await screen.findByRole("button", BUTTON))
    await waitFor(() => expect(screen.getByTestId(`discovery-row-${ACCOUNT}`).textContent)
      .toBe("Resources: 0 resources found · complete for the supported types"))
    await new Promise((resolve) => setTimeout(resolve, 40))   // past the bound: nothing more is said
    expect(screen.getByTestId(`discovery-row-${ACCOUNT}`).textContent)
      .toBe("Resources: 0 resources found · complete for the supported types")
  })

  it("a request the connector refuses is named, and Retry can be asked again (an earlier refusal is not re-read)", async () => {
    const queued = gap({ status: "queued", outcome: null, detail: null })
    const refused = gap({ status: "failed", outcome: "DISCOVERY_RETRY_REFUSED", detail: "ACCOUNT_REMOVED" })
    let second = false                                 // until the second request: the first one's answers, then refused
    // The second request's answers arrive late, so the row renders it following with the first refusal still on screen.
    const late = () => new Promise<Answer>((resolve) => setTimeout(() => resolve(queued), 15))
    const { send } = followed([gap(null), queued, refused], undefined, () => (second ? late() : null))
    fireEvent.click(await screen.findByRole("button", BUTTON))
    expect((await screen.findByRole("alert")).textContent).toBe("Retry not accepted (DISCOVERY_RETRY_REFUSED: ACCOUNT_REMOVED).")
    await new Promise((resolve) => setTimeout(resolve, 20))   // any refresh still in flight lands (on the refusal)
    second = true
    fireEvent.click(screen.getByRole("button", BUTTON))
    // The answer on screen still carries the first refusal: the second request is followed to its own end (here: the
    // bound, its request still queued), never resolved by the earlier refusal.
    expect(await screen.findByRole("status")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("a request that never moves the run stops being followed at the bound, says so, and offers Retry again", async () => {
    const { calls } = followed([gap(null), gap({ status: "done", outcome: "DISCOVERY_RETRY_SENT", detail: null })])
    fireEvent.click(await screen.findByRole("button", BUTTON))
    expect((await screen.findByRole("status")).textContent).toBe("Retry sent; the discovery status has not changed yet.")
    expect(screen.getByRole("button", BUTTON).hasAttribute("disabled")).toBe(false)
    const atBound = calls()
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(calls()).toBe(atBound)                     // initial load + the send's refresh + followMax refreshes, then none
    expect(atBound).toBe(2 + 4)
  })
})
