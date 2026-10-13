"use client"

/**
 * (S1a R7) A finished setup's applied result, per account of its ``result_scope`` (the Deployment at the version the receipt
 * pinned -- never today's scope): the Applied answer and the result answer, read TOGETHER on open and on "Check again" (never
 * polled), then paired by lib/system-boundary-finish-result.ts. A result is called this Finish's applied result only when the
 * pairing says so; otherwise it is "updating, as of generation G" and its lists are shown under that label.
 *
 * Each read takes the next generation: answers are shown only while they answer the LATEST read (an earlier read answering
 * last changes nothing). The caller keys this component to the verified person, account, setup and receipt
 * (S1A-R7-PAIR-03): any change remounts it, so an answer read under an earlier context never installs.
 *
 * (S1A-R7-PAIR-01/02) "includes this save" is said about the membership SHOWN only when the pairing proves it; a result naming
 * another account or System is refused by name and none of it is shown -- a same-System older generation stays, as updating.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { ResultLists } from "@/components/system-boundary/system-result"
import { Button } from "@/components/ui/button"
import { fetchApplied, parseAppliedResponse, type ParsedApplied } from "@/lib/system-boundary-applied"
import { appliedLine, pairing, pairingSentence, resultIsOurs } from "@/lib/system-boundary-finish-result"
import { fetchResult, parseResultResponse, resultSentence, type ParsedResult } from "@/lib/system-boundary-result"

export interface FinishResultProps {
  systemKey: string
  completedRevision: number
  accountIds: string[]
  readApplied?: (accountId: string) => Promise<{ status: number; body: unknown }>
  readResult?: (accountId: string, systemKey: string) => Promise<{ status: number; body: unknown }>
}

type Pair = { applied: ParsedApplied; result: ParsedResult }

export function FinishResult({ systemKey, completedRevision, accountIds, readApplied = fetchApplied,
                               readResult = fetchResult }: FinishResultProps) {
  const [answers, setAnswers] = useState<Record<string, Pair | "loading">>({})
  const generation = useRef(0)
  const check = useCallback(() => {
    const read = ++generation.current
    setAnswers(Object.fromEntries(accountIds.map((id) => [id, "loading" as const])))
    for (const accountId of accountIds) {
      void Promise.all([readApplied(accountId), readResult(accountId, systemKey)]).then(([a, r]) => {
        if (read !== generation.current) return
        setAnswers((current) => ({ ...current, [accountId]: {
          applied: parseAppliedResponse(a.status, a.body), result: parseResultResponse(r.status, r.body, accountId) } }))
      })
    }
  }, [accountIds, readApplied, readResult, systemKey])
  useEffect(check, [check])

  return (
    <section aria-label="Applied result" className="space-y-3 rounded-md border border-slate-200 bg-white p-4"
      data-testid="finish-result">
      <h3 className="text-sm font-semibold text-slate-800">Applied now</h3>
      {accountIds.map((id) => {
        const answer = answers[id]
        if (answer === undefined || answer === "loading") {
          return <p key={id} className="text-sm"><span className="font-mono text-xs">{id}</span>: reading…</p>
        }
        const paired = pairing(answer.applied, answer.result, { accountId: id, systemKey, completedRevision })
        const ours = resultIsOurs(answer.result, id, systemKey)
        return (
          <div key={id} className="space-y-1 text-sm" data-testid={`finish-result-${id}`}>
            <p data-testid={`finish-result-applied-${id}`}>
              <span className="font-mono text-xs">{id}</span>: {appliedLine(answer.applied, completedRevision, paired)}
            </p>
            <p className={paired.kind === "applied_result" ? "text-emerald-800" : "text-amber-800"}
              data-testid={`finish-result-pairing-${id}`}>{pairingSentence(paired)}</p>
            {ours ? <p className="text-xs text-slate-600">{resultSentence(answer.result)}</p> : (
              <p className="text-xs text-amber-800" data-testid={`finish-result-foreign-${id}`}>
                The result answered another account or system (RESULT_IDENTITY_MISMATCH); nothing of it is shown here.
              </p>
            )}
            {ours && answer.result.kind === "served" ? <ResultLists answer={answer.result} /> : null}
          </div>
        )
      })}
      <Button type="button" size="sm" variant="ghost" onClick={check}>Check again</Button>
    </section>
  )
}
