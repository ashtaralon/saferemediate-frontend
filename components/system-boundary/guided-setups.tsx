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
import { useCallback, useEffect, useMemo, useState } from "react"
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
import { freezeOp, pendingCreate, setupPendingStore, type SetupPendingStore } from "@/lib/system-boundary-setup-pending"
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
  /** Injectable for tests; default: this browser's storage (guarded) and this page's memory. */
  pendingStore?: SetupPendingStore
}

export function GuidedSetups({ accountId, view, picks, actor, open = false, listSetups = listSetupsDefault,
                               createSetup = createSetupDefault, readStacks = fetchStacks, client,
                               pendingStore }: GuidedSetupsProps) {
  const store = useMemo(() => pendingStore ?? setupPendingStore(), [pendingStore])
  const [mine, setMine] = useState<SetupSummary[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [stacks, setStacks] = useState<Stacks | undefined>(undefined)
  const [starting, setStarting] = useState(false)
  // (G2-F16) An unconfirmed start of THIS person from THIS account, frozen before it was sent and kept until it is answered:
  // a retry resends its request id, after Close and (for a verified person) after a reload too.
  const [unconfirmed, setUnconfirmed] = useState(() => pendingCreate(store.read(), actor, accountId))

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
    const op = unconfirmed ?? freezeOp({ version: 1, kind: "create", actor, accountId, requestId: freshRequestId(),
                                         startedAt: new Date().toISOString() })
    store.put(op)
    setUnconfirmed(op)
    setStarting(true)
    const answer = await createSetup(op.requestId)
    setStarting(false)
    if (answer.kind === "RESEND_SAME") {
      setProblem(`Not confirmed yet (${answer.code}). Try again: the same request is resent.`)
      return
    }
    store.remove(op.requestId)
    setUnconfirmed(null)
    if (answer.kind === "SAVED") {
      setProblem(null)
      setOpenId(answer.view.setup_id)
      return
    }
    setProblem(`A setup cannot be started (${answer.code}).`)
  }, [accountId, actor, createSetup, store, unconfirmed])

  if (openId) {
    return (
      <SetupWizard setupId={openId} accountId={accountId} view={view} picks={picks} stacks={stacks} client={client}
        actor={actor} pendingStore={store}
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
          {unconfirmed ? "Retry the unconfirmed start" : "Set up a system"}
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
