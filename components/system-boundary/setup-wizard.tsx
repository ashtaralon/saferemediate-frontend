"use client"

/**
 * The resumable System setup (onboarding G2): the eight Rev 7 steps over ONE saved setup (lib/system-boundary-setup.ts).
 *
 * Every "Save and continue" writes the WHOLE intent as a new revision at the state version read (a conflict reloads; the
 * person's typing is kept on screen). A write keeps its request id until its outcome is known: RESEND_SAME resends the same
 * request, never a new one. Reopening the setup resumes at the step it was saved at. Finish commits through the existing
 * guarded save, in one transaction with the setup's receipt; nothing is dispatched to any source.
 *
 * Nothing here decides truth. The browser sends choices and references; what the server found for each (held, assessed,
 * unavailable in this release) is shown from ``dispositions_derived``, in its words. GitHub, Terraform state and history
 * archives have no resolver yet: choosing them records the request and the step says it is not available in this release.
 * The roots come from the account inventory below (the person's picks), each with the selection it was picked under; the
 * backend admits every root again when the setup finishes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppliedStatus } from "@/components/system-boundary/applied-status"
import { SystemResult } from "@/components/system-boundary/system-result"
import { Button } from "@/components/ui/button"
import type { DeclarationsView, DeclaredRoot } from "@/lib/system-boundary-authoring"
import { buildDeclaration, cellsOf, type PickedRoot } from "@/lib/system-boundary-declaration"
import {
  freezeOp,
  othersForSetup,
  pendingForSetup,
  setupPendingStore,
  type PendingSetupOp,
  type SetupPendingStore,
} from "@/lib/system-boundary-setup-pending"
import {
  associatedSystemId,
  derivedSentence,
  evidenceRows,
  observationSentence,
  requestSentence,
  requiredFactsSentence,
  finishSetup as finishSetupDefault,
  freshRequestId,
  readSetup as readSetupDefault,
  readSetupStatus as readSetupStatusDefault,
  SETUP_STEPS,
  STEP_TITLES,
  updateSetup as updateSetupDefault,
  type AuthoredDisposition,
  type Choice,
  type DerivedDisposition,
  type OwnerRequest,
  type SetupIntent,
  type SetupRead,
  type SetupStatus,
  type SetupStep,
  type SetupView,
  type SetupWrite,
} from "@/lib/system-boundary-setup"

export interface SetupClient {
  readSetup: (setupId: string) => Promise<SetupRead<SetupView>>
  readSetupStatus: (setupId: string) => Promise<SetupRead<SetupStatus>>
  updateSetup: (setupId: string, requestId: string, base: number, steps: SetupIntent) => Promise<SetupWrite>
  finishSetup: (setupId: string, requestId: string, base: number) => Promise<SetupWrite>
}

const DEFAULT_CLIENT: SetupClient = {
  readSetup: readSetupDefault, readSetupStatus: readSetupStatusDefault, updateSetup: updateSetupDefault, finishSetup: finishSetupDefault,
}

export interface SetupWizardProps {
  setupId: string
  accountId: string
  /** The declarations view (the served limits, criticalities, environments). */
  view: DeclarationsView
  /** The person's current picks in the inventory below (roots offered to the Resource boundaries step). */
  picks: PickedRoot[]
  onClose: () => void
  client?: Partial<SetupClient>
  /** Injectable for tests; default: the stack census read (lib/system-boundary-stacks.ts). */
  stacks?: { state: "served"; stacks: { stack_id: string; label: string }[] } | { state: "unavailable"; reason: string }
  readApplied?: (accountId: string) => Promise<{ status: number; body: unknown }>
  readResult?: (accountId: string, systemKey: string) => Promise<{ status: number; body: unknown }>
  /** The verified person (the subject /authoring-grants/self names); null: not known -- an unresolved write is then kept in
   *  this page's memory only, never across a reload. */
  actor?: string | null
  /** Injectable for tests; default: this browser's storage (guarded) and this page's memory. */
  pendingStore?: SetupPendingStore
}

type Local = {
  displayName: string
  criticality: string
  deploymentKey: string
  environment: string
  environmentRaw: string
  roots: PickedRoot[]
  dispositions: Record<string, AuthoredDisposition>
}

/** The subjects each step records a choice for, with the choices offered and what each reference names. */
type SubjectMeta = { step: SetupStep; label: string; choices: Choice[]; refKind?: "stack_binding" | "account_source"; region?: boolean }

const SUBJECTS: Record<string, SubjectMeta> = {
  code: { step: "code_and_infrastructure", label: "Application code (GitHub)", choices: ["requested", "connect_later", "not_used"] },
  iac: { step: "code_and_infrastructure", label: "Infrastructure as code", choices: ["use_existing", "requested", "connect_later", "not_used"],
         refKind: "stack_binding", region: true },
  "live_source:observed_traffic": { step: "required_data", label: "Observed network traffic",
                                    choices: ["use_existing", "connect_later", "not_used"], refKind: "account_source" },
  "live_source:iam_usage": { step: "required_data", label: "IAM usage", choices: ["use_existing", "connect_later", "not_used"],
                             refKind: "account_source" },
  "history:cloudtrail": { step: "historical_data", label: "CloudTrail history", choices: ["no_history", "connect_later", "requested"] },
  "history:vpc_flow": { step: "historical_data", label: "VPC Flow Log history", choices: ["no_history", "connect_later", "requested"] },
}

const CHOICE_WORDS: Record<Choice, string> = {
  use_existing: "Use what this account already has",
  requested: "Request it (not available in this release)",
  deferred: "Decide later",
  not_used: "Not used for this system",
  no_history: "No history to import",
  connect_later: "Connect later",
}

/** The ref key an account-source subject names: the feature the account's coverage reports. */
const SOURCE_FEATURE: Record<string, string> = {
  "live_source:observed_traffic": "observed_traffic",
  "live_source:iam_usage": "iam_usage",
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function fromIntent(intent: SetupIntent): Local {
  const declaration = record(intent.declaration)
  const system = record(declaration.system)
  const deployment = record(declaration.deployment)
  const roots = Array.isArray(declaration.roots) ? (declaration.roots as DeclaredRoot[]) : []
  return {
    displayName: typeof system.display_name === "string" ? system.display_name : "",
    criticality: typeof system.criticality === "string" ? system.criticality : "",
    deploymentKey: typeof deployment.deployment_key === "string" ? deployment.deployment_key : "",
    environment: typeof deployment.environment === "string" ? deployment.environment : "",
    environmentRaw: typeof deployment.environment_raw === "string" ? deployment.environment_raw : "",
    // A resumed root keeps the selection it was picked under; its label is its identity (the row is not re-read here).
    roots: roots.map((root) => ({ root, label: root.resource_uid,
                                  publication: { attempt: "", generation: 0, source_identity: "", authority_digest: "", registration_id: "" } })),
    dispositions: Object.fromEntries((intent.dispositions ?? []).map((d) => [d.subject, d])),
  }
}

/** The DRAFT declaration: only what the person has given (the server names what is missing at Finish, by step). */
function draftDeclaration(local: Local): Record<string, unknown> {
  const roots = local.roots.map((picked) => picked.root)
  const system: Record<string, unknown> = { mode: "new" }
  if (local.displayName.trim()) system.display_name = local.displayName.trim()
  if (local.criticality) system.criticality = local.criticality
  const deployment: Record<string, unknown> = { mode: "new", scopes: cellsOf(roots) }
  if (local.deploymentKey.trim()) deployment.deployment_key = local.deploymentKey.trim()
  if (local.environment) deployment.environment = local.environment
  if (local.environmentRaw.trim()) deployment.environment_raw = local.environmentRaw.trim()
  return { system, deployment, roots }
}

/** A stable rendering for comparing intents: object keys sorted, dispositions by subject; never sent anywhere. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function intentKey(intent: Pick<SetupIntent, "declaration" | "dispositions">): string {
  const dispositions = [...(intent.dispositions ?? [])].sort((a, b) => a.subject.localeCompare(b.subject))
  return canonical({ declaration: intent.declaration ?? {}, dispositions })
}

/** Words for a write that did not save: what to do next, never a guess at what the backend did. */
function explain(answer: Exclude<SetupWrite, { kind: "SAVED" }>): string {
  if (answer.kind === "RESEND_SAME") return `Not confirmed yet (${answer.code}). Try again: the same request is resent, unchanged.`
  if (answer.code === "VERSION_CONFLICT") return "This setup changed elsewhere. It was reloaded; your typing is kept, save again."
  if (answer.code === "SETUP_INCOMPLETE") {
    const at = typeof answer.detail.step === "string" ? STEP_TITLES[answer.detail.step as SetupStep] ?? answer.detail.step : "a step"
    return `${at} is not complete (${String(answer.detail.reason ?? answer.code)}${answer.detail.field ? `: ${String(answer.detail.field)}` : ""}).`
  }
  return `Not saved: ${answer.code}.`
}

export function SetupWizard({ setupId, accountId, view, picks, onClose, client: injected, stacks, readApplied, readResult,
                             actor = null, pendingStore }: SetupWizardProps) {
  const client = useMemo(() => ({ ...DEFAULT_CLIENT, ...injected }), [injected])
  const store = useMemo(() => pendingStore ?? setupPendingStore(), [pendingStore])
  const [setup, setSetup] = useState<SetupView | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [local, setLocal] = useState<Local | null>(null)
  const [step, setStep] = useState<SetupStep>("system_details")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<SetupStatus | null>(null)
  // (G2-F16) The unresolved write of THIS person on THIS setup, frozen before it was first sent and kept (storage, or this
  // page's memory) until a definite answer: every Save / Finish resends exactly it until then. Typing stays in ``local``.
  const [pending, setPending] = useState<PendingSetupOp | null>(() => pendingForSetup(store.read(), actor, accountId, setupId))
  // (G2-F18) The context every send and every answer is judged against: the CURRENT verified person, account and setup.
  // A change (the person verified late, another person, another setup) re-resolves the pending write from the store; a
  // request started under an earlier context, answered later, updates the store only -- never the current person's screen.
  const context = `${actor ?? ""}|${accountId}|${setupId}`
  const currentContext = useRef(context)
  currentContext.current = context
  useEffect(() => {
    setPending(pendingForSetup(store.read(), actor, accountId, setupId))
  }, [actor, accountId, setupId, store])

  const load = useCallback(async (keepTyping: boolean) => {
    const answer = await client.readSetup(setupId)
    if (answer.kind !== "OK") {
      setProblem(answer.kind === "REFUSED" ? `This setup cannot be opened (${answer.code}).` : `This setup could not be read (${answer.code}).`)
      return
    }
    setSetup(answer.value)
    if (!keepTyping) {
      setLocal(fromIntent(answer.value.intent))
      setStep(answer.value.status === "FINISHED" ? "progress_and_results" : answer.value.intent.resume_step)
    }
  }, [client, setupId])
  useEffect(() => {
    void load(false)
  }, [load])
  // The status vector: on Review, what finishing the SAVED intent will request; on Progress, each request as it is NOW.
  const [statusProblem, setStatusProblem] = useState<string | null>(null)
  useEffect(() => {
    const progress = step === "progress_and_results" && setup?.status === "FINISHED"
    if (!setup || (!progress && step !== "review_and_start")) return
    let live = true
    setStatus(null)
    setStatusProblem(null)
    void client.readSetupStatus(setup.setup_id).then((answer) => {
      if (!live) return
      if (answer.kind === "OK") setStatus(answer.value)
      else setStatusProblem(`The requests could not be read (${answer.code}).`)
    })
    return () => {
      live = false
    }
  }, [client, setup, step])

  const intentFor = useCallback((nextStep: SetupStep): SetupIntent => ({
    declaration: draftDeclaration(local!), dispositions: Object.values(local!.dispositions), resume_step: nextStep,
  }), [local])

  /** Send ONE frozen operation of THIS person, on THIS account and setup; keep it while its outcome is unknown, drop it on a
   *  definite answer. An operation of anyone else is never sent here. */
  const send = useCallback(async (op: PendingSetupOp) => {
    if (op.kind === "create" || op.actor !== actor || op.accountId !== accountId || op.setupId !== setupId) {
      setProblem("That unconfirmed request belongs to another identity or setup; it is not sent from here.")
      return
    }
    const sentIn = context
    setBusy(true)
    const answer = op.kind === "update" ? await client.updateSetup(op.setupId, op.requestId, op.base, op.steps)
      : await client.finishSetup(op.setupId, op.requestId, op.base)
    if (answer.kind !== "RESEND_SAME") store.remove(op.requestId)       // a definite answer resolves it, whoever is here now
    setBusy(false)
    if (currentContext.current !== sentIn) return                        // a later context: its screen is not this answer's
    if (answer.kind === "RESEND_SAME") {
      setProblem(explain(answer))
      return
    }
    setPending(null)
    if (answer.kind === "SAVED") {
      setProblem(null)
      setSetup(answer.view)
      setStep(op.kind === "finish" ? "progress_and_results" : (op.kind === "update" ? op.steps.resume_step : step))
      return
    }
    setProblem(explain(answer))
    await load(true)
  }, [accountId, actor, client, context, load, setupId, step, store])

  /** Freeze a NEW operation and send it -- or, while one of THIS person on THIS setup is unresolved (read from the store NOW,
   *  never from a stale render), resend exactly that one instead. */
  const dispatch = useCallback(async (make: () => PendingSetupOp) => {
    const unresolved = pendingForSetup(store.read(), actor, accountId, setupId)
    if (unresolved) {
      setPending(unresolved)
      return send(unresolved)
    }
    const op = freezeOp(make())
    store.put(op)
    setPending(op)
    return send(op)
  }, [accountId, actor, send, setupId, store])

  const save = useCallback((nextStep: SetupStep) => {
    if (!setup || !local) return
    return dispatch(() => ({ version: 1, kind: "update", actor, accountId, setupId: setup.setup_id, requestId: freshRequestId(),
                             base: setup.state_version, steps: intentFor(nextStep), startedAt: new Date().toISOString() }))
  }, [accountId, actor, dispatch, intentFor, local, setup])

  const finish = useCallback(() => {
    if (!setup) return
    return dispatch(() => ({ version: 1, kind: "finish", actor, accountId, setupId: setup.setup_id, requestId: freshRequestId(),
                             base: setup.state_version, startedAt: new Date().toISOString() }))
  }, [accountId, actor, dispatch, setup])

  /** FINISHING: resend THIS browser's own Finish if it holds it; otherwise only read again (never a new Finish request). */
  const checkAgain = useCallback(async () => {
    const unresolved = pendingForSetup(store.read(), actor, accountId, setupId)
    if (unresolved?.kind === "finish") return send(unresolved)
    await load(true)
  }, [accountId, actor, load, send, setupId, store])

  if (problem && !setup) return <Panel onClose={onClose}><p role="alert" className="text-sm text-red-700">{problem}</p></Panel>
  if (!setup || !local) return <Panel onClose={onClose}><p className="text-sm text-slate-500">Opening the setup…</p></Panel>

  const index = SETUP_STEPS.indexOf(step)
  const next = SETUP_STEPS[Math.min(index + 1, SETUP_STEPS.length - 1)]
  // (G2-F17) What is on screen differs from the SAVED revision: Finish would commit the saved one, so it waits for a Save.
  const dirty = intentKey(intentFor(step)) !== intentKey(setup.intent)
  // (G2-F19) Where the unresolved write is ACTUALLY kept now -- its own read-back, not a guess about storage.
  const kept = pending ? store.where(pending.requestId) : null
  const others = othersForSetup(store.read(), actor, accountId, setupId)
  const derived = new Map(setup.dispositions_derived.map((d) => [d.subject, d]))
  const editable = setup.status === "DRAFT"
  const set = (patch: Partial<Local>) => setLocal((current) => (current ? { ...current, ...patch } : current))
  const choose = (subject: string, choice: Choice | "") => setLocal((current) => {
    if (!current) return current
    const dispositions = { ...current.dispositions }
    if (!choice) delete dispositions[subject]
    else {
      const meta = SUBJECTS[subject]
      const scope = meta.region && current.roots[0] ? { account_id: accountId, region: current.roots[0].root.region } : { account_id: accountId }
      const previous = current.dispositions[subject]
      const ref = choice === "use_existing" && meta.refKind
        ? { kind: meta.refKind, key: meta.refKind === "account_source" ? SOURCE_FEATURE[subject] : previous?.ref?.key ?? "" }
        : undefined
      dispositions[subject] = { subject, scope, choice, reason_code: choice.toUpperCase(), ...(ref ? { ref } : {}) }
    }
    return { ...current, dispositions }
  })

  return (
    <Panel onClose={onClose}>
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Setup steps" data-testid="setup-steps">
        {SETUP_STEPS.map((name, i) => (
          <li key={name}>
            <button type="button" aria-current={name === step ? "step" : undefined}
              className={`rounded px-2 py-1 ${name === step ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-700"}`}
              disabled={busy || (name === "progress_and_results" && setup.status !== "FINISHED")}
              onClick={() => setStep(name)}>
              {i + 1}. {STEP_TITLES[name]}
            </button>
          </li>
        ))}
      </ol>
      <p className="text-xs text-slate-500" data-testid="setup-state">
        Setup {setup.status.toLowerCase()} · revision {setup.intent_revision}
        {setup.reconciliation ? ` · ${setup.reconciliation.state.toLowerCase().replace(/_/g, " ")}` : ""}
      </p>
      {problem ? <p role="alert" className="text-sm text-amber-800">{problem}</p> : null}
      {pending ? (
        <p className="text-xs text-amber-800" data-testid="setup-pending">
          {pending.kind === "finish" ? "A Finish" : "A save"} of this setup is not confirmed yet. The next
          {pending.kind === "finish" ? " Finish or Check" : " Save"} resends exactly that request, unchanged, before anything
          else{pending.kind === "update" ? "; later changes stay on screen and are saved after it is answered" : ""}.
          {kept === "storage" ? "" : " This browser keeps it only until this page is reloaded."}
        </p>
      ) : null}
      {others.length ? (
        <p className="text-xs text-slate-600" data-testid="setup-pending-others">
          {others.length} unconfirmed request(s) on this setup were started
          {actor === null ? " by a verified identity" : " by another identity, or before you were verified"}; they are kept for
          whoever started them and are never resent from here.
        </p>
      ) : null}

      <section aria-label={STEP_TITLES[step]} className="space-y-3" data-testid={`setup-step-${step}`}>
        <h3 className="text-sm font-semibold">{STEP_TITLES[step]}</h3>
        {step === "system_details" ? (
          <>
            <label className="block text-sm">System name
              <input className="mt-1 block w-full rounded border px-2 py-1" value={local.displayName} disabled={!editable}
                maxLength={view.limits.max_display_name} onChange={(e) => set({ displayName: e.target.value })} />
            </label>
            <label className="block text-sm">Criticality
              <select className="mt-1 block rounded border px-2 py-1" value={local.criticality} disabled={!editable}
                onChange={(e) => set({ criticality: e.target.value })}>
                <option value="">Choose…</option>
                {view.limits.criticalities.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
              </select>
            </label>
          </>
        ) : null}
        {step === "deployments" ? (
          <>
            <label className="block text-sm">Deployment key
              <input className="mt-1 block w-full rounded border px-2 py-1" value={local.deploymentKey} disabled={!editable}
                onChange={(e) => set({ deploymentKey: e.target.value })} />
            </label>
            <label className="block text-sm">Environment
              <select className="mt-1 block rounded border px-2 py-1" value={local.environment} disabled={!editable}
                onChange={(e) => set({ environment: e.target.value })}>
                <option value="">Choose…</option>
                {view.limits.environments.map((env) => <option key={env} value={env}>{env}</option>)}
              </select>
            </label>
            <label className="block text-sm">Your own word for it (optional)
              <input className="mt-1 block w-full rounded border px-2 py-1" value={local.environmentRaw} disabled={!editable}
                maxLength={view.limits.max_environment_raw} onChange={(e) => set({ environmentRaw: e.target.value })} />
            </label>
            <p className="text-xs text-slate-500">
              This deployment covers the accounts and Regions of the roots you pick in Resource boundaries
              ({cellsOf(local.roots.map((p) => p.root)).map((c) => `${c.account_id} ${c.region}`).join(", ") || "none yet"}).
            </p>
          </>
        ) : null}
        {step === "code_and_infrastructure" || step === "required_data" || step === "historical_data" ? (
          <>
            {step === "code_and_infrastructure" && stacks?.state === "unavailable" ? (
              <p className="text-xs text-slate-500" data-testid="setup-stacks-unavailable">CloudFormation stacks: {stacks.reason}</p>
            ) : null}
            {Object.entries(SUBJECTS).filter(([, meta]) => meta.step === step).map(([subject, meta]) => (
              <Subject key={subject} subject={subject} label={meta.label} choices={meta.choices} editable={editable}
                authored={local.dispositions[subject]} derived={derived.get(subject)} onChoose={(choice) => choose(subject, choice)}
                stackOptions={meta.refKind === "stack_binding" && stacks?.state === "served" ? stacks.stacks : null}
                onStack={(key) => setLocal((current) => {
                  if (!current || !current.dispositions[subject]) return current
                  const d = current.dispositions[subject]
                  return { ...current, dispositions: { ...current.dispositions, [subject]: { ...d, ref: { kind: "stack_binding", key } } } }
                })} />
            ))}
          </>
        ) : null}
        {step === "resource_boundaries" ? (
          <>
            <p className="text-sm">{local.roots.length} root resource(s) in this setup.</p>
            <ul className="text-xs text-slate-600" data-testid="setup-roots">
              {local.roots.map((picked) => <li key={picked.root.resource_uid}>{picked.label}</li>)}
            </ul>
            <Button type="button" size="sm" variant="outline" disabled={!editable || picks.length === 0}
              onClick={() => set({ roots: picks })}>
              Use my {picks.length} pick(s) from the inventory below
            </Button>
            <p className="text-xs text-slate-500">Which resources belong to the system is computed after the setup is finished.</p>
          </>
        ) : null}
        {step === "review_and_start" ? <Review local={local} view={view} setup={setup} dirty={dirty} status={status}
          statusProblem={statusProblem} /> : null}
        {step === "progress_and_results" ? <Progress setup={setup} status={status} statusProblem={statusProblem} accountId={accountId}
                                                     readApplied={readApplied} readResult={readResult} /> : null}
      </section>

      <div className="flex items-center gap-2">
        {editable && step !== "review_and_start" && step !== "progress_and_results" ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => void save(next)}>Save and continue</Button>
        ) : null}
        {editable && step === "review_and_start" ? (
          <>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void save("review_and_start")}>
              Save
            </Button>
            <Button type="button" size="sm" data-testid="setup-finish" onClick={() => void finish()}
              disabled={busy || dirty || (pending !== null && pending.kind !== "finish")}
              title={dirty ? "Save your changes first: Finish commits the saved revision." : undefined}>
              Finish setup
            </Button>
          </>
        ) : null}
        {setup.status === "FINISHING" ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => void checkAgain()}>Check the save again</Button>
        ) : null}
      </div>
    </Panel>
  )
}

function Panel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="space-y-3 rounded-lg border p-4" data-testid="setup-wizard">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Set up a system</h2>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      {children}
    </div>
  )
}

function Subject({ subject, label, choices, editable, authored, derived, onChoose, stackOptions, onStack }: {
  subject: string
  label: string
  choices: Choice[]
  editable: boolean
  authored: AuthoredDisposition | undefined
  derived: DerivedDisposition | undefined
  onChoose: (choice: Choice | "") => void
  stackOptions: { stack_id: string; label: string }[] | null
  onStack: (key: string) => void
}) {
  return (
    <div className="rounded border p-2 text-sm" data-testid={`setup-subject-${subject}`}>
      <label className="block">{label}
        <select className="ml-2 rounded border px-2 py-1" value={authored?.choice ?? ""} disabled={!editable}
          onChange={(e) => onChoose(e.target.value as Choice | "")}>
          <option value="">Choose…</option>
          {choices.map((choice) => (
            <option key={choice} value={choice} disabled={choice === "use_existing" && subject === "iac" && !stackOptions}>
              {CHOICE_WORDS[choice]}
            </option>
          ))}
        </select>
      </label>
      {authored?.choice === "use_existing" && subject === "iac" && stackOptions ? (
        <select className="mt-1 block rounded border px-2 py-1" value={authored.ref?.key ?? ""} disabled={!editable}
          onChange={(e) => onStack(e.target.value)} aria-label="CloudFormation stack">
          <option value="">Choose a stack…</option>
          {stackOptions.map((stack) => <option key={stack.stack_id} value={stack.stack_id}>{stack.label}</option>)}
        </select>
      ) : null}
      {derived ? <p className="mt-1 text-xs text-slate-600" data-testid={`setup-derived-${subject}`}>{derivedSentence(derived)}</p> : (
        <p className="mt-1 text-xs text-slate-400">What Cyntro finds is shown once this step is saved.</p>
      )}
    </div>
  )
}

/** (G3-A) The setup's owner requests, each in the backend's own words for its current state. */
function Requests({ requests, testId, title }: { requests: OwnerRequest[]; testId: string; title: string }) {
  if (!requests.length) return null
  return (
    <div className="text-xs" data-testid={testId}>
      <p className="text-slate-700">{title}</p>
      <ul className="text-slate-600">
        {requests.map((r) => {
          const evidence = observationSentence(r)
          const details = evidenceRows(r)
          return (
            <li key={r.op_id}>
              {SUBJECTS[r.subject]?.label ?? r.subject} · {r.scope.account_id}{r.scope.region ? ` / ${r.scope.region}` : ""}: {requestSentence(r)}
              {evidence ? <div className="text-slate-500" data-testid="setup-request-observation">{evidence}</div> : null}
              {details.length ? (
                <details className="text-slate-500" data-testid="setup-request-evidence">
                  <summary>Evidence details ({details.length})</summary>
                  <ul>{details.map((row) => <li key={row}>{row}</li>)}</ul>
                </details>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Review({ local, view, setup, dirty, status, statusProblem }: { local: Local; view: DeclarationsView; setup: SetupView;
                                                                       dirty: boolean; status: SetupStatus | null;
                                                                       statusProblem: string | null }) {
  // Finish commits the SAVED revision. What is staged on screen is shown apart, and Finish waits until it is saved.
  const saved = fromIntent(setup.intent)
  const built = buildDeclaration({
    roots: saved.roots,
    system: { mode: "new", displayName: saved.displayName, criticality: saved.criticality || null },
    deployment: { mode: "new", deploymentKey: saved.deploymentKey, environment: saved.environment, environmentRaw: saved.environmentRaw },
  }, view)
  const line = (l: Local) => `${l.displayName || "(no name)"} · ${l.criticality || "(no criticality)"} · ${l.deploymentKey || "(no deployment)"}`
    + ` · ${l.environment || "(no environment)"} · ${l.roots.length} root(s) · ${Object.keys(l.dispositions).length} choice(s)`
  return (
    <div className="space-y-2 text-sm" data-testid="setup-review">
      <p>Saved revision {setup.intent_revision}: {line(saved)}</p>
      {dirty ? (
        <p className="text-amber-800" data-testid="setup-review-unsaved">
          Unsaved changes on screen: {line(local)}. Save them before finishing -- Finish commits the saved revision above.
        </p>
      ) : null}
      {!built.ok ? <ul className="text-xs text-amber-800">{built.problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
      <ul className="text-xs text-slate-600">
        {setup.dispositions_derived.map((d) => (
          <li key={d.subject}>{SUBJECTS[d.subject]?.label ?? d.subject}: {derivedSentence(d)}
            <div className="text-slate-500" data-testid="setup-required-facts">{requiredFactsSentence(d, setup.requirement_profile)}</div>
          </li>
        ))}
      </ul>
      <Requests requests={(status?.operations ?? []).filter((r) => r.state === "PLANNED")} testId="setup-review-requests"
        title="Finishing the saved revision will ask an account administrator for:" />
      {statusProblem ? <p className="text-xs text-amber-800">{statusProblem}</p> : null}
      <p className="text-xs text-slate-500">
        Finishing saves the system and records these choices. No source is connected and no history is imported by this setup;
        a requested source is asked of an account administrator, and nothing is sent to AWS.
      </p>
    </div>
  )
}

function Progress({ setup, status, statusProblem, accountId, readApplied, readResult }: {
  setup: SetupView
  status: SetupStatus | null
  statusProblem: string | null
  accountId: string
  readApplied?: (accountId: string) => Promise<{ status: number; body: unknown }>
  readResult?: (accountId: string, systemKey: string) => Promise<{ status: number; body: unknown }>
}) {
  if (setup.status !== "FINISHED" || !setup.receipt) return <p className="text-sm text-slate-500">Not finished yet.</p>
  const association = setup.receipt.association
  const systemId = associatedSystemId(association)
  return (
    <div className="space-y-2 text-sm" data-testid="setup-progress">
      <p>Setup finished · saved as revision {association.completed_revision}
        {status?.association ? ` · association ${status.association.state.toLowerCase()}` : ""}</p>
      <AppliedStatus revision={association.completed_revision} accountIds={[accountId]}
        {...(readApplied ? { fetcher: readApplied } : {})} />
      {systemId ? <SystemResult systemKey={systemId} accountIds={[accountId]} {...(readResult ? { fetcher: readResult } : {})} /> : null}
      <ul className="text-xs text-slate-600">
        {setup.dispositions_derived.map((d) => (
          <li key={d.subject}>{SUBJECTS[d.subject]?.label ?? d.subject}: {derivedSentence(d)}
            <div className="text-slate-500" data-testid="setup-required-facts">{requiredFactsSentence(d, setup.requirement_profile)}</div>
          </li>
        ))}
      </ul>
      <Requests requests={status?.operations ?? []} testId="setup-progress-requests" title="Requested from an account administrator:" />
      {statusProblem ? <p className="text-xs text-amber-800">{statusProblem}</p> : null}
    </div>
  )
}
