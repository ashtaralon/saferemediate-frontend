"use client"

/**
 * The way into the resumable System setup (onboarding G2), on an account's inventory: this person's setups that are not
 * finished or cancelled -- to resume -- and "Set up a system" to start one. Only what the backend lists is shown, and it lists
 * only setups the person may see NOW (a setup that ever named an account outside their current scope is not listed). A setup
 * is the person's own (owner) to continue; others' are not offered here.
 *
 * The wizard (setup-wizard.tsx) gets this account's CloudFormation stacks as the census serves them, or the census's own
 * reason they are not available -- never an empty list standing for "none".
 */
import { useCallback, useEffect, useState } from "react"
import { SetupWizard, type SetupClient } from "@/components/system-boundary/setup-wizard"
import { Button } from "@/components/ui/button"
import type { DeclarationsView } from "@/lib/system-boundary-authoring"
import type { PickedRoot } from "@/lib/system-boundary-declaration"
import {
  createSetup as createSetupDefault,
  freshRequestId,
  listSetups as listSetupsDefault,
  type SetupRead,
  type SetupSummary,
  type SetupWrite,
} from "@/lib/system-boundary-setup"
import { fetchStacks, parseStacksResponse, stacksOutcomeSentence } from "@/lib/system-boundary-stacks"

type Stacks = { state: "served"; stacks: { stack_id: string; label: string }[] } | { state: "unavailable"; reason: string }

export interface GuidedSetupsProps {
  accountId: string
  view: DeclarationsView
  picks: PickedRoot[]
  /** The verified person's subject (/authoring-grants/self); null: not known, so no setup is offered as "yours". */
  actor: string | null
  /** Open the start/resume panel on load (Systems > Add System). */
  open?: boolean
  listSetups?: () => Promise<SetupRead<{ setups: SetupSummary[]; next_cursor: string | null }>>
  createSetup?: (requestId: string) => Promise<SetupWrite>
  readStacks?: (accountId: string) => Promise<{ status: number; body: unknown }>
  client?: Partial<SetupClient>
}

export function GuidedSetups({ accountId, view, picks, actor, open = false, listSetups = listSetupsDefault,
                               createSetup = createSetupDefault, readStacks = fetchStacks, client }: GuidedSetupsProps) {
  const [mine, setMine] = useState<SetupSummary[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [stacks, setStacks] = useState<Stacks | undefined>(undefined)
  const [starting, setStarting] = useState(false)
  const [startRequest, setStartRequest] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const answer = await listSetups()
    if (answer.kind !== "OK") {
      setProblem(`Your setups could not be listed (${answer.code}).`)
      return
    }
    // This slice edits a NEW system's setup; a successor (correction mode) has no steps here yet and is not offered.
    setMine(answer.value.setups.filter((s) => actor !== null && s.owner === actor && s.mode === "create"
                                         && (s.status === "DRAFT" || s.status === "FINISHING")))
  }, [actor, listSetups])
  // Nothing is read until the person asks: the list when they choose "Your setups", the stacks when a setup opens.
  useEffect(() => {
    if (!openId) return
    let live = true
    void readStacks(accountId).then(({ status, body }) => {
      if (!live) return
      const parsed = parseStacksResponse(status, body, accountId)
      setStacks(parsed.kind === "data"
        ? { state: "served", stacks: parsed.stacks.filter((stack) => stack.settled)
                                     .map((stack) => ({ stack_id: stack.stackId, label: `${stack.stackName} (${stack.region})` })) }
        : { state: "unavailable", reason: stacksOutcomeSentence(parsed) })
    })
    return () => {
      live = false
    }
  }, [accountId, openId, readStacks])

  const start = useCallback(async () => {
    // One request id per start until its outcome is known: a retry after an unknown outcome resends the same request.
    const requestId = startRequest ?? freshRequestId()
    setStartRequest(requestId)
    setStarting(true)
    const answer = await createSetup(requestId)
    setStarting(false)
    if (answer.kind === "SAVED") {
      setStartRequest(null)
      setProblem(null)
      setOpenId(answer.view.setup_id)
      return
    }
    if (answer.kind === "REFUSED") setStartRequest(null)
    setProblem(answer.kind === "REFUSED" ? `A setup cannot be started (${answer.code}).`
      : `Not confirmed yet (${answer.code}). Try again: the same request is resent.`)
  }, [createSetup, refresh, startRequest])

  if (openId) {
    return (
      <SetupWizard setupId={openId} accountId={accountId} view={view} picks={picks} stacks={stacks} client={client}
        onClose={() => {
          setOpenId(null)
          if (mine !== null) void refresh()
        }} />
    )
  }
  return (
    <div className="space-y-1 text-sm" data-testid="guided-setups">
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={starting} onClick={() => void start()} data-testid="setup-start">
          Set up a system
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void refresh()} data-testid="setup-mine">
          Your setups
        </Button>
        {open ? <span className="text-xs text-slate-600">A guided setup in eight steps; you can stop and resume it.</span> : null}
      </div>
      {problem ? <p role="alert" className="text-xs text-amber-800">{problem}</p> : null}
      {mine && !mine.length ? <p className="text-xs text-slate-500">You have no setup in progress.</p> : null}
      {mine && mine.length ? (
        <ul className="text-xs" data-testid="setup-resume-list">
          {mine.map((s) => (
            <li key={s.setup_id}>
              <button type="button" className="underline" onClick={() => setOpenId(s.setup_id)}>
                Resume setup from {new Date(s.updated_at).toLocaleString()} ({s.status.toLowerCase()})
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
