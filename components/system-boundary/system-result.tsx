"use client"

/**
 * The wizard's RESULT (A7 rev 4 C-D, screen 6): per account, what the SERVED membership says about the system just saved --
 * members with the proof a person reads, dependencies, held and not-a-member rows -- through lib/system-boundary-result.ts.
 * Read on open and on "Check again", never polled. No percentage: the backend's exact counts, and a list the backend
 * capped says how many rows it left out. A hold (not served on this install yet, nothing published, the system not named)
 * is said as itself, never as an empty system.
 *
 * (S0 NSW-01) Each read -- on open, on "Check again", and again when the system, accounts or reader change -- takes the next
 * generation: an answer, success or refusal, is shown only while it answers the LATEST read. An earlier read answering last
 * changes nothing.
 */
import { BOUNDARY_TITLES, boundarySummary, sharedSentence } from "@/lib/system-boundary-boundary-words"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  fetchResult,
  notMemberSentence,
  parseResultResponse,
  proofSentence,
  resultSentence,
  type ParsedResult,
  type ResultList,
  type ResultRow,
  type ResultServed,
} from "@/lib/system-boundary-result"

// (PC1 S0-F) The plan's words for the server's four lists; "shared" is the server's own count, said under them.
const LIST_TITLES: Record<ResultList, string> = BOUNDARY_TITLES

export interface SystemResultProps {
  systemKey: string
  accountIds: string[]
  /** Injectable for tests; default: the authoring proxy. */
  fetcher?: (accountId: string, systemKey: string) => Promise<{ status: number; body: unknown }>
}

function rowLine(list: ResultList, row: ResultRow): string {
  if (list === "members") {
    const stale = row.state === "STALE" ? ` -- last seen; ${String(row.stale_reason ?? "removal not proven")}` : ""
    return `${proofSentence(row)}${stale}`
  }
  if (list === "dependencies") return `owned by ${String(row.owner_system_key ?? "no system")}`
  if (list === "not_members") return notMemberSentence(row)
  return String(row.reason ?? row.state)
}

export function SystemResult({ systemKey, accountIds, fetcher = fetchResult }: SystemResultProps) {
  const [answers, setAnswers] = useState<Record<string, ParsedResult | "loading">>({})
  const generation = useRef(0)

  const check = useCallback(() => {
    const read = ++generation.current
    setAnswers(Object.fromEntries(accountIds.map((id) => [id, "loading" as const])))
    for (const accountId of accountIds) {
      void fetcher(accountId, systemKey).then(({ status, body }) => {
        if (read === generation.current) {
          setAnswers((current) => ({ ...current, [accountId]: parseResultResponse(status, body, accountId) }))
        }
      })
    }
  }, [accountIds, fetcher, systemKey])
  useEffect(check, [check])

  return (
    <section aria-label="Result" className="space-y-3 rounded-md border border-slate-200 bg-white p-4" data-testid="system-result">
      <h3 className="text-sm font-semibold text-slate-800">Result</h3>
      {accountIds.map((id) => {
        const answer = answers[id]
        return (
          <div key={id} className="space-y-2" data-testid={`system-result-${id}`}>
            <p className="text-sm">
              <span className="font-mono text-xs">{id}</span>:{" "}
              {answer === undefined || answer === "loading" ? "reading…" : resultSentence(answer)}
            </p>
            {answer !== undefined && answer !== "loading" && answer.kind === "served" ? <ResultLists answer={answer} /> : null}
          </div>
        )
      })}
      <Button type="button" size="sm" variant="ghost" onClick={check}>Check again</Button>
    </section>
  )
}

/** One served result's lists, each row with what a person reads (the Result screen's, and a finished setup's -- one rendering). */
export function ResultLists({ answer }: { answer: ResultServed }) {
  return (
    <>
      <p className="text-xs text-slate-700" data-testid="boundary-summary">{boundarySummary(answer.counts, answer.notMemberReasons)}.</p>
      <p className="text-xs text-slate-600" data-testid="boundary-shared">{sharedSentence(answer.notMemberReasons)}</p>
      {(["members", "dependencies", "held", "not_members"] as const).map((list) => (
        <details key={list} open={list === "members"}>
          <summary className="text-xs font-medium text-slate-700">
            {LIST_TITLES[list]} ({answer.counts[list]})
          </summary>
          <ul className="mt-1 space-y-0.5 text-xs">
            {answer.lists[list].map((row) => (
              <li key={`${row.resource_uid}|${String(row.kind ?? "")}`}>
                <span className="font-mono">{row.resource_uid}</span>
                {row.resource_type ? <span className="text-slate-500"> ({row.resource_type})</span> : null}
                {" -- "}{rowLine(list, row)}
              </li>
            ))}
            {answer.lists[list].length === 0 ? <li className="text-slate-500">None.</li> : null}
            {answer.omitted[list] ? (
              <li className="text-amber-800">{answer.omitted[list]} more not shown here (counted above).</li>
            ) : null}
          </ul>
        </details>
      ))}
    </>
  )
}
