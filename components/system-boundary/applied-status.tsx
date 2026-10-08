"use client"

/**
 * "Applied" for one save (A7 rev 4 C-C): per account the save wrote, whether the SERVED membership was built from a
 * revision at or after the save's. Read on open and on "Check again" -- never polled in the background -- through
 * lib/system-boundary-applied.ts. A save is Saved first; it is Applied only by these numbers, never by elapsed time.
 */
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  appliedSentence,
  fetchApplied,
  isApplied,
  parseAppliedResponse,
  type ParsedApplied,
} from "@/lib/system-boundary-applied"

export interface AppliedStatusProps {
  revision: number
  accountIds: string[]
  /** Injectable for tests; default: the authoring proxy. */
  fetcher?: (accountId: string) => Promise<{ status: number; body: unknown }>
}

export function AppliedStatus({ revision, accountIds, fetcher = fetchApplied }: AppliedStatusProps) {
  const [answers, setAnswers] = useState<Record<string, ParsedApplied | "loading">>({})

  const check = useCallback(() => {
    let live = true
    setAnswers(Object.fromEntries(accountIds.map((id) => [id, "loading" as const])))
    for (const accountId of accountIds) {
      void fetcher(accountId).then(({ status, body }) => {
        if (live) setAnswers((current) => ({ ...current, [accountId]: parseAppliedResponse(status, body) }))
      })
    }
    return () => {
      live = false
    }
  }, [accountIds, fetcher])
  useEffect(check, [check])

  const all = accountIds.length > 0 && accountIds.every((id) => {
    const answer = answers[id]
    return answer !== undefined && answer !== "loading" && isApplied(answer, revision)
  })
  return (
    <section aria-label="Applied" className="space-y-2 rounded-md border border-slate-200 bg-white p-4" data-testid="applied-status">
      <h3 className="text-sm font-semibold text-slate-800">
        {all ? `Revision ${revision} is applied` : `Revision ${revision} is saved`}
      </h3>
      <ul className="space-y-1 text-sm">
        {accountIds.map((id) => {
          const answer = answers[id]
          return (
            <li key={id}>
              <span className="font-mono text-xs">{id}</span>:{" "}
              {answer === undefined || answer === "loading" ? "checking…" : appliedSentence(answer, revision)}
            </li>
          )
        })}
      </ul>
      {all ? (
        <p className="text-xs text-slate-600">The system&apos;s members are shown on its Systems page.</p>
      ) : (
        <Button type="button" size="sm" variant="ghost" onClick={check}>Check again</Button>
      )}
    </section>
  )
}
