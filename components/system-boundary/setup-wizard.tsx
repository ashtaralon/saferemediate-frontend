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
  associatedSystemId,
  derivedSentence,
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

/** Words for a write that did not save: what to do next, never a guess at what the backend did. */
function explain(answer: Exclude<SetupWrite, { kind: "SAVED" }>): string {
  if (answer.kind === "RESEND_SAME") return `Not confirmed yet (${answer.code}). Try again: the same request is resent.`
  if (answer.code === "VERSION_CONFLICT") return "This setup changed elsewhere. It was reloaded; your typing is kept, save again."
  if (answer.code === "SETUP_INCOMPLETE") {
    const at = typeof answer.detail.step === "string" ? STEP_TITLES[answer.detail.step as SetupStep] ?? answer.detail.step : "a step"
    return `${at} is not complete (${String(answer.detail.reason ?? answer.code)}${answer.detail.field ? `: ${String(answer.detail.field)}` : ""}).`
  }
  return `Not saved: ${answer.code}.`
}

export function SetupWizard({ setupId, accountId, view, picks, onClose, client: injected, stacks, readApplied, readResult }: SetupWizardProps) {
  const client = useMemo(() => ({ ...DEFAULT_CLIENT, ...injected }), [injected])
  const [setup, setSetup] = useState<SetupView | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [local, setLocal] = useState<Local | null>(null)
  const [step, setStep] = useState<SetupStep>("system_details")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<SetupStatus | null>(null)
  // A write whose outcome is unknown keeps its request id and body: the person's next attempt resends exactly it.
  const pending = useRef<{ key: string; requestId: string } | null>(null)

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
  useEffect(() => {
    if (step !== "progress_and_results" || !setup || setup.status !== "FINISHED") return
    let live = true
    void client.readSetupStatus(setup.setup_id).then((answer) => {
      if (live && answer.kind === "OK") setStatus(answer.value)
    })
    return () => {
      live = false
    }
  }, [client, setup, step])

  const intentFor = useCallback((nextStep: SetupStep): SetupIntent => ({
    declaration: draftDeclaration(local!), dispositions: Object.values(local!.dispositions), resume_step: nextStep,
  }), [local])

  const requestIdFor = useCallback((key: string): string => {
    if (pending.current?.key !== key) pending.current = { key, requestId: freshRequestId() }
    return pending.current.requestId
  }, [])

  const save = useCallback(async (nextStep: SetupStep) => {
    if (!setup || !local) return
    const steps = intentFor(nextStep)
    const key = JSON.stringify(["update", setup.state_version, steps])
    setBusy(true)
    const answer = await client.updateSetup(setup.setup_id, requestIdFor(key), setup.state_version, steps)
    setBusy(false)
    if (answer.kind === "SAVED") {
      pending.current = null
      setProblem(null)
      setSetup(answer.view)
      setStep(nextStep)
      return
    }
    if (answer.kind === "REFUSED") pending.current = null
    setProblem(explain(answer))
    if (answer.kind === "REFUSED" && answer.code === "VERSION_CONFLICT") await load(true)
  }, [client, intentFor, load, local, requestIdFor, setup])

  const finish = useCallback(async () => {
    if (!setup) return
    const key = JSON.stringify(["finish", setup.setup_id, setup.state_version])
    setBusy(true)
    const answer = await client.finishSetup(setup.setup_id, requestIdFor(key), setup.state_version)
    setBusy(false)
    if (answer.kind === "SAVED") {
      pending.current = null
      setProblem(null)
      setSetup(answer.view)
      setStep("progress_and_results")
      return
    }
    if (answer.kind === "REFUSED") {
      pending.current = null
      await load(true)
    }
    setProblem(explain(answer))
  }, [client, load, requestIdFor, setup])

  if (problem && !setup) return <Panel onClose={onClose}><p role="alert" className="text-sm text-red-700">{problem}</p></Panel>
  if (!setup || !local) return <Panel onClose={onClose}><p className="text-sm text-slate-500">Opening the setup…</p></Panel>

  const index = SETUP_STEPS.indexOf(step)
  const next = SETUP_STEPS[Math.min(index + 1, SETUP_STEPS.length - 1)]
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
        {step === "review_and_start" ? <Review local={local} view={view} setup={setup} /> : null}
        {step === "progress_and_results" ? <Progress setup={setup} status={status} accountId={accountId}
                                                     readApplied={readApplied} readResult={readResult} /> : null}
      </section>

      <div className="flex items-center gap-2">
        {editable && step !== "review_and_start" && step !== "progress_and_results" ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => void save(next)}>Save and continue</Button>
        ) : null}
        {editable && step === "review_and_start" ? (
          <>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void save("review_and_start")}>Save</Button>
            <Button type="button" size="sm" disabled={busy} onClick={() => void finish()} data-testid="setup-finish">Finish setup</Button>
          </>
        ) : null}
        {setup.status === "FINISHING" ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => void finish()}>Check the save again</Button>
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

function Review({ local, view, setup }: { local: Local; view: DeclarationsView; setup: SetupView }) {
  // The server is the judge at Finish; this only names what the served limits already rule out, before anything is sent.
  const built = buildDeclaration({
    roots: local.roots,
    system: { mode: "new", displayName: local.displayName, criticality: local.criticality || null },
    deployment: { mode: "new", deploymentKey: local.deploymentKey, environment: local.environment, environmentRaw: local.environmentRaw },
  }, view)
  return (
    <div className="space-y-2 text-sm" data-testid="setup-review">
      <p>{local.displayName || "(no name)"} · {local.criticality || "(no criticality)"} · {local.deploymentKey || "(no deployment)"}
        {" "}· {local.environment || "(no environment)"} · {local.roots.length} root(s)</p>
      {!built.ok ? <ul className="text-xs text-amber-800">{built.problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
      <ul className="text-xs text-slate-600">
        {setup.dispositions_derived.map((d) => <li key={d.subject}>{SUBJECTS[d.subject]?.label ?? d.subject}: {derivedSentence(d)}</li>)}
      </ul>
      <p className="text-xs text-slate-500">
        Finishing saves the system and records these choices. No source is connected and no history is imported by this setup.
      </p>
    </div>
  )
}

function Progress({ setup, status, accountId, readApplied, readResult }: {
  setup: SetupView
  status: SetupStatus | null
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
        {setup.dispositions_derived.map((d) => <li key={d.subject}>{SUBJECTS[d.subject]?.label ?? d.subject}: {derivedSentence(d)}</li>)}
      </ul>
    </div>
  )
}
