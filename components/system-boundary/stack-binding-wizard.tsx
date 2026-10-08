"use client"

/**
 * The stack wizard (A7 rev 4, spec claude-a7-tagging-rev4-engine-spec-2026-10-07.txt C-A..C-C): bind CloudFormation stacks of
 * one account to a System, optionally decide per resource, save, then see whether it is applied.
 *
 * 1. Stacks (C-A): the account's stacks from its census publication (lib/system-boundary-stacks.ts). A stack bound to a
 *    system already, or one the census no longer lists, cannot be picked; an unsettled or incompletely read stack can be
 *    bound and says that nothing is added from it until it settles.
 * 2. Per-resource decisions: for a stack bound "shared by several systems", each of its collected resources may be
 *    included in this system or excluded; for any other stack, a resource may be excluded. "Include" is accepted by the
 *    backend only for a resource a stack bound to THIS system names (S2) -- the save says so by name if not.
 * 3. Save (C-B): the declaration form (system, deployment, review) with these stacks and decisions; ONE envelope.
 * 4. Applied (C-C): applied-status.tsx for the account.
 * 5. Result (C-D): system-result.tsx -- what the served membership says about the system this save wrote (its key is the
 *    one SYSTEM record the save's receipt names; a receipt naming none or several shows no result rather than a guess).
 *
 * Shown only where the capability read says the wizard may write here (lib/system-boundary-capability.ts) and the protocol
 * is ACTIVE; the caller decides. Nothing here fetches in the background or retries by itself.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { AppliedStatus } from "@/components/system-boundary/applied-status"
import { SystemResult } from "@/components/system-boundary/system-result"
import { DeclarationForm } from "@/components/system-boundary/declaration-form"
import { Button } from "@/components/ui/button"
import {
  DEPTH_COLLECTED,
  fetchCensusPage,
  parseCensusResponse,
  rowName,
  type CensusFetcher,
  type CensusRow,
} from "@/lib/account-census"
import type { CreateEnvelope, DeclarationsView, ResourceDecision, SaveResult } from "@/lib/system-boundary-authoring"
import { saveDeclaration } from "@/lib/system-boundary-authoring"
import { savedSystemKey as systemKeyOfSave } from "@/lib/system-boundary-result"
import type { PickedDecision, PickedStack, SaveOutcome } from "@/lib/system-boundary-declaration"
import {
  BINDING_KINDS,
  boundSentence,
  fetchStacks,
  kindLabel,
  parseStacksResponse,
  stackCaveat,
  stacksOutcomeSentence,
  type BindingKind,
  type ParsedStacks,
  type Stack,
  type StacksData,
} from "@/lib/system-boundary-stacks"

/** At most this many census pages are read to list one stack's resources; past it, the list says it is cut. */
const MAX_RESOURCE_PAGES = 50

export interface StackBindingWizardProps {
  accountId: string
  view: DeclarationsView
  onClose: () => void
  onSaved: (revision: number) => void
  /** Injectable for tests; defaults: the account read proxy and the authoring proxy. */
  readStacks?: (accountId: string) => Promise<{ status: number; body: unknown }>
  readCensus?: CensusFetcher
  save?: (envelope: CreateEnvelope) => Promise<SaveResult>
  readApplied?: (accountId: string) => Promise<{ status: number; body: unknown }>
  readResult?: (accountId: string, systemKey: string) => Promise<{ status: number; body: unknown }>
  onEnvelope?: (envelope: CreateEnvelope) => void
  onOutcome?: (envelope: CreateEnvelope, outcome: SaveOutcome) => void
}

type Step = "stacks" | "decisions" | "save" | "applied"
type Resources = { kind: "loading" } | { kind: "rows"; rows: CensusRow[]; cut: boolean } | { kind: "failed"; reason: string }

/** One stack's present, collected resources, read page by page from the census (the stack list carries counts only). */
async function stackResources(readCensus: CensusFetcher, accountId: string, stackId: string): Promise<Resources> {
  const rows: CensusRow[] = []
  let cursor: string | null = null
  for (let page = 0; page < MAX_RESOURCE_PAGES; page++) {
    const { status, body } = await readCensus(accountId, { depth: DEPTH_COLLECTED, cursor })
    const parsed = parseCensusResponse(status, body, accountId, DEPTH_COLLECTED)
    if (parsed.kind !== "data") return { kind: "failed", reason: parsed.reasonCode ?? parsed.state }
    rows.push(...parsed.rows.filter((row) => row.cfn?.stack_id === stackId && !row.deleted))
    if (parsed.nextCursor === null) return { kind: "rows", rows, cut: false }
    cursor = parsed.nextCursor
  }
  return { kind: "rows", rows, cut: true }
}

export function StackBindingWizard({ accountId, view, onClose, onSaved, readStacks = fetchStacks,
  readCensus = fetchCensusPage, save, readApplied, readResult, onEnvelope, onOutcome }: StackBindingWizardProps) {
  const [parsed, setParsed] = useState<ParsedStacks | null>(null)
  const [picks, setPicks] = useState<ReadonlyMap<string, BindingKind>>(() => new Map())
  const [resources, setResources] = useState<Record<string, Resources>>({})
  const [verdicts, setVerdicts] = useState<ReadonlyMap<string, { verdict: ResourceDecision["verdict"]; row: CensusRow }>>(
    () => new Map())
  const [step, setStep] = useState<Step>("stacks")
  const [savedRevision, setSavedRevision] = useState<number | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  // The save, remembering which System its receipt wrote: that key is what the result screen reads.
  const saveRemembering = useCallback(async (envelope: CreateEnvelope): Promise<SaveResult> => {
    const result = await (save ?? saveDeclaration)(envelope)
    if (result.kind === "SAVED") setSavedKey(systemKeyOfSave(result.saved))
    return result
  }, [save])

  useEffect(() => {
    let live = true
    void readStacks(accountId).then(({ status, body }) => {
      if (live) setParsed(parseStacksResponse(status, body, accountId))
    })
    return () => {
      live = false
    }
  }, [accountId, readStacks])

  const data: StacksData | null = parsed?.kind === "data" ? parsed : null
  const byId = useMemo(() => new Map((data?.stacks ?? []).map((stack) => [stack.stackId, stack])), [data])

  const toggle = (stack: Stack) => {
    setPicks((current) => {
      const next = new Map(current)
      if (next.has(stack.stackId)) next.delete(stack.stackId)
      else next.set(stack.stackId, "exclusive")
      return next
    })
  }

  const loadResources = useCallback((stackId: string) => {
    setResources((current) => ({ ...current, [stackId]: { kind: "loading" } }))
    void stackResources(readCensus, accountId, stackId).then((result) => {
      setResources((current) => ({ ...current, [stackId]: result }))
    })
  }, [accountId, readCensus])

  const pickedStacks: PickedStack[] = data === null ? [] : [...picks].map(([stackId, kind]) => {
    const stack = byId.get(stackId)!
    return {
      label: stack.stackName,
      binding: {
        account_id: accountId, region: stack.region, stack_id: stack.stackId, kind,
        selection: { census: { generation: data.publication.generation, source_identity: data.publication.sourceIdentity },
                     stack_status: stack.stackStatus },
      },
    }
  })
  const pickedDecisions: PickedDecision[] = data === null ? [] : [...verdicts].map(([rowKey, { verdict, row }]) => ({
    label: rowName(row),
    decision: {
      account_id: accountId, region: row.region, resource_uid: rowKey, verdict,
      selection: { row_key: rowKey, stack_id: row.cfn?.stack_id ?? null, census: { generation: data.publication.generation } },
    },
  }))
  const accountIds = useMemo(() => [accountId], [accountId])

  const setVerdict = (row: CensusRow, verdict: ResourceDecision["verdict"] | null) => {
    setVerdicts((current) => {
      const next = new Map(current)
      if (verdict === null) next.delete(row.row_key)
      else next.set(row.row_key, { verdict, row })
      return next
    })
  }

  return (
    <section aria-label="Bind CloudFormation stacks" className="space-y-4 rounded-md border border-slate-200 bg-white p-4"
      data-testid="stack-binding-wizard">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Bind CloudFormation stacks</h2>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </header>

      {parsed === null ? <p className="text-sm text-slate-600">Reading the account&apos;s stacks…</p> : null}
      {parsed !== null && parsed.kind !== "data" ? (
        <p className="text-sm text-slate-700" role="status">{stacksOutcomeSentence(parsed)}</p>
      ) : null}

      {data !== null && step === "stacks" ? (
        <div className="space-y-3">
          {data.stacks.length === 0 ? <p className="text-sm text-slate-600">The census lists no stack in this account.</p> : null}
          <ul className="space-y-2">
            {data.stacks.map((stack) => {
              const caveat = stackCaveat(stack)
              const picked = picks.get(stack.stackId)
              const bindable = stack.bound === null && data.bindingsState === "read"
              return (
                <li key={stack.stackId} className="rounded border border-slate-100 p-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" aria-label={`Bind ${stack.stackName}`} checked={picked !== undefined}
                      disabled={!bindable} onChange={() => toggle(stack)} />
                    <span className="font-medium">{stack.stackName}</span>
                    <span className="text-xs text-slate-500">{stack.region} · {stack.stackStatus ?? "status unknown"}</span>
                  </label>
                  <p className="pl-6 text-xs text-slate-600">
                    {stack.resources.total} {stack.resources.total === 1 ? "resource" : "resources"} ({stack.resources.collected}{" "}
                    collected in depth, {stack.resources.listedOnly} listed only)
                    {stack.parentStackId ? " · nested in another stack" : ""}
                    {stack.taggedForSystems.length
                      ? ` · tagged for ${stack.taggedForSystems.map((t) => `${t.systemName} (${t.count})`).join(", ")}` : ""}
                  </p>
                  <p className="pl-6 text-xs text-slate-500">{boundSentence(stack, data.bindingsState)}</p>
                  {caveat ? <p className="pl-6 text-xs text-amber-800">{caveat}</p> : null}
                  {picked !== undefined ? (
                    <label className="block pl-6 text-xs">
                      Binding
                      <select aria-label={`Binding of ${stack.stackName}`} className="ml-2 rounded border px-1 py-0.5" value={picked}
                        onChange={(e) => setPicks((current) => new Map(current).set(stack.stackId, e.target.value as BindingKind))}>
                        {BINDING_KINDS.map((kind) => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}
                      </select>
                    </label>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={picks.size === 0} onClick={() => setStep("decisions")}>Next</Button>
          </div>
        </div>
      ) : null}

      {data !== null && step === "decisions" ? (
        <div className="space-y-3" data-testid="wizard-decisions">
          <p className="text-xs text-slate-600">
            Optional, except for stacks shared by several systems: decide per resource. &quot;Include&quot; is accepted only for a
            resource of a stack bound to this system.
          </p>
          {pickedStacks.map(({ binding }) => {
            const stack = byId.get(binding.stack_id)!
            const listed = resources[stack.stackId]
            return (
              <div key={stack.stackId} className="rounded border border-slate-100 p-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{stack.stackName}</span>
                  <span className="text-xs text-slate-500">{kindLabel(binding.kind)}</span>
                  {listed === undefined ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => loadResources(stack.stackId)}>Show resources</Button>
                  ) : null}
                </div>
                {listed?.kind === "loading" ? <p className="text-xs text-slate-500">Reading the stack&apos;s resources…</p> : null}
                {listed?.kind === "failed" ? (
                  <p className="text-xs text-red-700">The stack&apos;s resources could not be read ({listed.reason}).</p>
                ) : null}
                {listed?.kind === "rows" ? (
                  <ul className="mt-1 space-y-1">
                    {listed.rows.map((row) => {
                      const current = verdicts.get(row.row_key)?.verdict ?? null
                      return (
                        <li key={row.row_key} className="flex items-center gap-2 text-xs">
                          <span className="font-mono">{rowName(row)}</span>
                          <span className="text-slate-500">{row.resource_type}</span>
                          <select aria-label={`Decision for ${rowName(row)}`} className="rounded border px-1 py-0.5" value={current ?? ""}
                            onChange={(e) => setVerdict(row, (e.target.value || null) as ResourceDecision["verdict"] | null)}>
                            <option value="">{binding.kind === "several_systems" ? "Not decided (a candidate)" : "As the stack says"}</option>
                            <option value="include">Include in this system</option>
                            <option value="exclude">Exclude from this system</option>
                          </select>
                        </li>
                      )
                    })}
                    {listed.rows.length === 0 ? <li className="text-xs text-slate-500">No resource of this stack is collected in depth.</li> : null}
                    {listed.cut ? <li className="text-xs text-amber-800">The list is cut: the census is larger than this page reads.</li> : null}
                  </ul>
                ) : null}
              </div>
            )
          })}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => setStep("save")}>Next</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setStep("stacks")}>Back</Button>
          </div>
        </div>
      ) : null}

      {data !== null && step === "save" ? (
        <DeclarationForm view={view} roots={[]} stacks={pickedStacks} decisions={pickedDecisions} save={saveRemembering}
          onEnvelope={onEnvelope} onOutcome={onOutcome} onCancel={() => setStep("decisions")}
          onSaved={(revision) => {
            setSavedRevision(revision)
            setStep("applied")
            onSaved(revision)
          }} />
      ) : null}

      {step === "applied" && savedRevision !== null ? (
        <AppliedStatus revision={savedRevision} accountIds={accountIds} fetcher={readApplied} />
      ) : null}

      {step === "applied" && savedRevision !== null ? (
        savedKey !== null
          ? <SystemResult systemKey={savedKey} accountIds={accountIds} fetcher={readResult} />
          : <p className="text-xs text-slate-600">The save does not name one system, so no result is shown here.</p>
      ) : null}
    </section>
  )
}
