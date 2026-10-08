"use client"

/**
 * The wizard's RESULT (A7 rev 4 C-D, screen 6): per account, what the SERVED membership says about the system just saved --
 * members with the proof a person reads, dependencies, held and not-a-member rows -- through lib/system-boundary-result.ts.
 * Read on open and on "Check again", never polled. No percentage: the backend's exact counts, and a list the backend
 * capped says how many rows it left out. A hold (not served on this install yet, nothing published, the system not named)
 * is said as itself, never as an empty system.
 */
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  fetchResult,
  parseResultResponse,
  proofSentence,
  resultSentence,
  type ParsedResult,
  type ResultList,
  type ResultRow,
} from "@/lib/system-boundary-result"

const LIST_TITLES: Record<ResultList, string> = {
  members: "Members",
  dependencies: "Dependencies (used by the system, not part of it)",
  held: "Held -- waiting on a person or on a source",
  not_members: "Not a member",
}

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
  return String(row.reason ?? row.state)
}

export function SystemResult({ systemKey, accountIds, fetcher = fetchResult }: SystemResultProps) {
  const [answers, setAnswers] = useState<Record<string, ParsedResult | "loading">>({})

  const check = useCallback(() => {
    let live = true
    setAnswers(Object.fromEntries(accountIds.map((id) => [id, "loading" as const])))
    for (const accountId of accountIds) {
      void fetcher(accountId, systemKey).then(({ status, body }) => {
        if (live) setAnswers((current) => ({ ...current, [accountId]: parseResultResponse(status, body, accountId) }))
      })
    }
    return () => {
      live = false
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
            {answer !== undefined && answer !== "loading" && answer.kind === "served"
              ? (["members", "dependencies", "held", "not_members"] as const).map((list) => (
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
                ))
              : null}
          </div>
        )
      })}
      <Button type="button" size="sm" variant="ghost" onClick={check}>Check again</Button>
    </section>
  )
}
