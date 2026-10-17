"use client"

/**
 * One account's basic resource discovery, on its Settings › Accounts row: how far the run is (found so far / found / finished
 * with gaps / held), and -- only where it can help -- Retry.
 *
 * Retry is offered when the run's start message is held by a named blocker, or when the run finished with a gap a retry can
 * repair (a listing refused for access the customer may have granted since, throttled, or failed; never a partial listing,
 * whose rows are kept). It is the verified person's request, bound to the registration and run they see
 * (backend POST /api/admin/accounts/{id}/discovery-retry); the account connector checks the run's current authority before
 * it re-sends. Nothing is shown for an account without a run (an older registration keeps the published inventory).
 *
 * The request is asynchronous (202): the row then follows it, refreshing every `followMs` up to `followMax` times, until the
 * run is moving again with its start message sent (normal polling takes over), the run is COMPLETE (a fast retry can finish
 * between two refreshes), the request is refused (named, and Retry offered again), or the bound is reached (said plainly,
 * and Retry offered again). The request's own DISCOVERY_RETRY_SENT proves only that the start message was queued -- the old
 * gaps stay on screen until the worker re-opens them -- so it never ends the follow by itself. A retry re-reads only listings that committed nothing; a listing that
 * stopped part-way keeps its rows and stays a named gap.
 */
import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { useDiscoveryStatus } from "@/components/accounts/basic-inventory-view"
import {
  LIVE_COVERAGE,
  type CoverageState,
  discoveryRetryPath,
  discoveryRetryable,
  type DiscoveryFetcher,
  fetchDiscovery,
} from "@/lib/account-resources"

type RetryState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "following" }
  | { kind: "stalled" }
  | { kind: "failed"; message: string }

export const FOLLOW_MS = 3000
export const FOLLOW_MAX = 20

export type RetrySender = (url: string, body: Record<string, string>) => Promise<{ ok: boolean; status: number; code: string | null }>

const sendRetry: RetrySender = async (url, body) => {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  let code: string | null = null
  try {
    const answer = await response.json()
    code = typeof answer?.detail?.code === "string" ? answer.detail.code : typeof answer?.error === "string" ? answer.error : null
  } catch {
    code = null
  }
  return { ok: response.ok, status: response.status, code }
}

export function DiscoveryRowStatus({
  accountId, customerId, fetchStatus = fetchDiscovery, send = sendRetry, followMs = FOLLOW_MS, followMax = FOLLOW_MAX, onCoverage,
}: {
  accountId: string
  customerId: string
  fetchStatus?: DiscoveryFetcher
  send?: RetrySender
  followMs?: number
  followMax?: number
  /** Told the run's coverage state as it is read (null: no run read), so the row can compose the deep pipeline's lines. */
  onCoverage?: (state: CoverageState | null) => void
}) {
  const { status, refresh } = useDiscoveryStatus(accountId, fetchStatus)
  const [retry, setRetry] = useState<RetryState>({ kind: "idle" })
  const polls = useRef(0)
  const answeredBefore = useRef<unknown>(null)        // the status on screen when the request was accepted
  const following = retry.kind === "following"
  const coverage = status.kind === "status" ? status.coverageState : null
  useEffect(() => { onCoverage?.(coverage) }, [coverage, onCoverage])
  // Follow the accepted request: bounded refreshes, whatever the coverage state (the hook only polls a live run).
  useEffect(() => {
    if (!following) return
    polls.current = 0
    const timer = setInterval(() => {
      polls.current += 1
      if (polls.current > followMax) {
        setRetry({ kind: "stalled" })
        return
      }
      void refresh()
    }, followMs)
    return () => clearInterval(timer)
  }, [following, followMs, followMax, refresh])
  // ...until the run moves again or the request is answered with a refusal -- judged only on an answer loaded after the
  // request was accepted (the one on screen may still carry an earlier request's refusal).
  useEffect(() => {
    if (!following || status.kind !== "status" || status === answeredBefore.current) return
    const moving = LIVE_COVERAGE.has(status.coverageState) && (!status.dispatch || status.dispatch.state === "SENT")
    if (moving || status.coverageState === "COMPLETE") {
      setRetry({ kind: "idle" })
    } else if (status.retry?.status === "failed") {
      const why = [status.retry.outcome, status.retry.detail].filter(Boolean).join(": ")
      setRetry({ kind: "failed", message: why ? `Retry not accepted (${why}).` : "Retry not accepted." })
    }
  }, [following, status])
  if (status.kind !== "status" || status.coverageState === "NOT_REQUESTED") return null
  if (status.coverageState === "HELD") {
    return (
      <p data-testid={`discovery-row-${accountId}`} className="text-[11px] text-slate-500">
        Resources: held{status.heldBy ? ` (${status.heldBy})` : ""}
      </p>
    )
  }
  const live = LIVE_COVERAGE.has(status.coverageState)
  const n = status.observedTotal
  const found = `${n} ${n === 1 ? "resource" : "resources"} ${status.observedTotalLabel === "found" ? "found" : "found so far"}`
  const gaps = status.gaps.filter((gap) => gap.status !== "UNSUPPORTED").length
  const line = live ? `Resources: discovering · ${found}`
    : status.coverageState === "COMPLETE" ? `Resources: ${found} · complete for the supported types`
      : `Resources: ${found} · finished with ${gaps} ${gaps === 1 ? "gap" : "gaps"}`
  const retryable = discoveryRetryable(status) && status.registrationId && status.runId

  const request = async () => {
    if (!status.registrationId || !status.runId) return
    setRetry({ kind: "sending" })
    try {
      const answer = await send(discoveryRetryPath(accountId, customerId),
        { registration_id: status.registrationId, run_id: status.runId })
      if (answer.ok) {
        answeredBefore.current = status
        setRetry({ kind: "following" })
        void refresh()
      } else {
        setRetry({ kind: "failed", message: answer.code ? `Retry not accepted (${answer.code}).` : `Retry not accepted (${answer.status}).` })
      }
    } catch {
      setRetry({ kind: "failed", message: "Retry could not be sent (the request did not complete)." })
    }
  }

  return (
    <div data-testid={`discovery-row-${accountId}`} className="space-y-0.5 text-[11px] text-slate-600">
      <p className="inline-flex items-center gap-1">
        {live ? <Loader2 className="h-3 w-3 animate-spin text-teal-700" aria-hidden /> : null}
        {line}
      </p>
      {status.dispatch && status.dispatch.state !== "SENT" && status.dispatch.blocker ? (
        <p className="text-amber-800">Discovery has not started: {status.dispatch.blocker}</p>
      ) : null}
      {retryable && !following ? (
        <button type="button" disabled={retry.kind === "sending"} onClick={() => void request()}
          aria-label={`Retry resource discovery for ${accountId}`}
          className="font-semibold text-teal-700 underline disabled:opacity-50">
          {retry.kind === "sending" ? "Retrying…" : "Retry"}
        </button>
      ) : null}
      {following ? <p className="text-teal-800">Retry requested · waiting for discovery to resume</p> : null}
      {retry.kind === "stalled" ? (
        <p className="text-amber-800" role="status">Retry sent; the discovery status has not changed yet.</p>
      ) : null}
      {retry.kind === "failed" ? <p className="text-amber-800" role="alert">{retry.message}</p> : null}
    </div>
  )
}
