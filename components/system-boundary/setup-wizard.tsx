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
 *
 * (S1a, setup contract level 4) The intent is read and written LOSSLESSLY (lib/system-boundary-setup-intent.ts): a stack the
 * person chooses for infrastructure as code is also the setup's stack BINDING (one per setup in this release), a per-resource
 * decision on that stack's resources is kept as the person made it, and the Deployment's saved scopes change only when the
 * roots, binding or decisions do. Review shows the PREVIEW of the saved revision -- what finishing it would make the system,
 * computed by the backend's own planner and written nowhere -- and a Finish of a setup that binds a stack names the preview
 * the person reviewed (a version-2 pending Finish), only while the screen is saved and the preview is of exactly that version.
 *
 * (S1b, setup level 5; contract D) A second Deployment is offered only where the capability says this build may send a plural
 * create (``pluralOffered``) AND the setup was read at level 5; otherwise every step is exactly the single one. In a plural
 * setup each Deployment carries its own key and environment, its roots, its one stack and that stack's decisions, and its
 * own code / infrastructure choices (never an owner request: N2); the account x Region sources are chosen once for the union.
 * Review shows the consolidated account assessment and each Deployment's members (A7, N3) -- the preview's OUTER state alone
 * allows Finish -- and the result explains per Deployment only what THIS Finish's receipt pins (N4).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DeploymentExplanationCards } from "@/components/system-boundary/deployment-explanation"
import { FinishResult } from "@/components/system-boundary/finish-result"
import { assess, assessmentWithheldSentence } from "@/lib/system-boundary-assessment"
import { stackResources, type Resources } from "@/components/system-boundary/stack-binding-wizard"
import { Button } from "@/components/ui/button"
import { TerraformBindingsPanel } from "@/components/system-boundary/terraform-bindings-panel"
import { TerraformStateUpload } from "@/components/system-boundary/terraform-state-upload"
import { fetchCensusPage, rowName, type CensusFetcher, type CensusRow } from "@/lib/account-census"
import type { DeclarationsView, ResourceDecision, StackBinding } from "@/lib/system-boundary-authoring"
import { buildDeclaration, type PickedRoot } from "@/lib/system-boundary-declaration"
import { notMemberSentence, proofSentence, type ResultList, type ResultRow } from "@/lib/system-boundary-result"
import {
  addDeployment,
  bindingOf,
  bindsStack,
  DEPLOYMENT_SCOPED_SUBJECTS,
  draftDeclaration,
  keyOf,
  loadIntent,
  MAX_DEPLOYMENTS,
  removeDeployment,
  renameDeployment,
  stackBinding,
  withBoundary,
  withDeployment,
  withRootsOf,
  type DeploymentChange,
  type IntentLocal,
} from "@/lib/system-boundary-setup-intent"
import {
  coverageLimits,
  heldSentence,
  previewRefusalSentence,
  previewSentence,
  readPreview as readPreviewDefault,
  type Preview,
  type PreviewFetcher,
  type PreviewRead,
  type TerraformPreviewBinding,
} from "@/lib/system-boundary-setup-preview"
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
  bindingReasonWords,
  requestSentence,
  requiredFactsSentence,
  finishSetup as finishSetupDefault,
  freshRequestId,
  intentDeploymentKeys,
  isPluralIntent,
  isUnrecordedRefusal,
  pinnedDeployments,
  readSetup as readSetupDefault,
  readSetupStatus as readSetupStatusDefault,
  SETUP_CONTRACT_LEVEL,
  SETUP_STEPS,
  setupLevelOf,
  STEP_TITLES,
  updateSetup as updateSetupDefault,
  type AuthoredDisposition,
  type Choice,
  type DerivedDisposition,
  type OwnerRequest,
  type RequirementProfile,
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
  /** ``previewDigest``: only for a version-2 Finish (the preview the person reviewed); a version-1 Finish sends none. */
  finishSetup: (setupId: string, requestId: string, base: number, previewDigest?: string) => Promise<SetupWrite>
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
  stacks?: { state: "served"; stacks: StackOption[] } | { state: "unavailable"; reason: string }
  readApplied?: (accountId: string) => Promise<{ status: number; body: unknown }>
  readResult?: (accountId: string, systemKey: string) => Promise<{ status: number; body: unknown }>
  /** The verified person (the subject /authoring-grants/self names); null: not known -- an unresolved write is then kept in
   *  this page's memory only, never across a reload. */
  actor?: string | null
  /** Injectable for tests; default: this browser's storage (guarded) and this page's memory. */
  pendingStore?: SetupPendingStore
  /** Injectable for tests; default: the draft preview read (lib/system-boundary-setup-preview.ts). */
  readPreview?: PreviewFetcher
  /** Injectable for tests; default: the census page read (a bound stack's resources, for per-resource decisions). */
  readCensus?: CensusFetcher
  /** (S1b) Whether the capability read says this build may send a plural create (lib/system-boundary-capability
   *  ``pluralCreateOffered``); a second Deployment is offered only then, and only on a setup read at level 5. */
  pluralOffered?: boolean
}

/** A CloudFormation stack the census serves for this account: the Region it is in, its status and the census publication it
 *  was listed under (what a binding records the person saw). */
export type StackOption = {
  stack_id: string
  label: string
  region: string
  stack_status: string | null
  census: { generation: number; source_identity: string }
}

type Local = IntentLocal

/** The subjects each step records a choice for, with the choices offered and what each reference names. Whether a subject's
 *  scope needs a Region is the SERVED requirement profile's to say (``needsRegion``), never this list's. */
type SubjectMeta = { step: SetupStep; label: string; choices: Choice[]; refKind?: "stack_binding" | "account_source" }

const SUBJECTS: Record<string, SubjectMeta> = {
  code: { step: "code_and_infrastructure", label: "Application code (GitHub)", choices: ["requested", "connect_later", "not_used"] },
  iac: { step: "code_and_infrastructure", label: "Infrastructure as code", choices: ["use_existing", "requested", "connect_later", "not_used"],
         refKind: "stack_binding" },
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

/** (S2 intake I2c) The iac row's "use an uploaded Terraform state": the disposition stays ``use_existing``; its reference is a
 *  ``terraform_state`` binding (the id the upload returned) instead of a CloudFormation stack. Offered for this screen's
 *  account only -- a binding is uploaded for exactly one account. */
const TERRAFORM = "use_existing:terraform_state"
const isTerraform = (d: AuthoredDisposition): boolean => d.choice === "use_existing" && d.ref?.kind === "terraform_state"

/** The ref key an account-source subject names: the feature the account's coverage reports. */
const SOURCE_FEATURE: Record<string, string> = {
  "live_source:observed_traffic": "observed_traffic",
  "live_source:iam_usage": "iam_usage",
}

/** (S0 NSW-04) The Region names a disposition scope may carry -- the backend's own rule (unified/system_boundary_setup._REGION). */
const REGION = /^[a-z0-9-]{1,32}$/

/** One disposition's identity: a setup holds at most one per (subject, account, Region) -- (S1b) and Deployment, for a code /
 *  iac choice of a plural setup; the backend refuses a duplicate. */
function rowKey(d: { subject: string; scope: { account_id: string; region?: string; deployment?: string } }): string {
  return `${d.subject}|${d.scope.account_id}|${d.scope.region ?? ""}${d.scope.deployment === undefined ? "" : `|${d.scope.deployment}`}`
}

/** (S0 NSW-04) Whether THE served requirement profile needs a Region in this subject's scope for it to be supported. */
function needsRegion(subject: string, profile: RequirementProfile | undefined): boolean {
  return profile?.document.subjects.find((s) => s.subject === subject)?.scope.includes("region") ?? false
}

/** A disposition of ``subject`` at ``scope`` with ``choice``: its reference is the one the choice needs (an account source's
 *  feature, or the stack ``previous`` named -- a reference of another kind, a Terraform state say, is never reused as a stack);
 *  the scope is exactly the one given -- never a Region taken from elsewhere. */
function authored(subject: string, scope: AuthoredDisposition["scope"], choice: Choice,
                  previous?: AuthoredDisposition): AuthoredDisposition {
  const meta = SUBJECTS[subject]
  const kept = previous?.ref?.kind === meta?.refKind ? previous?.ref?.key : undefined
  const ref = choice === "use_existing" && meta?.refKind
    ? { kind: meta.refKind, key: meta.refKind === "account_source" ? SOURCE_FEATURE[subject] : kept ?? "" }
    : undefined
  return { subject, scope: { ...scope }, choice, reason_code: choice.toUpperCase(), ...(ref ? { ref } : {}) }
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
  const dispositions = [...(intent.dispositions ?? [])].sort((a, b) => rowKey(a).localeCompare(rowKey(b)))
  return canonical({ declaration: intent.declaration ?? {}, dispositions })
}

/** (SW-96) A Finish refused because a Deployment covers no account or Region. The backend refuses a Deployment whose saved
 *  ``scopes`` are empty (FIELD_INVALID on ``deployment.scopes`` / ``deployments[i].scopes``, unified/system_boundary_plan
 *  ``_parse_new_deployment``), and a Deployment's scopes are the cells of ITS roots, bindings and decisions
 *  (lib/system-boundary-setup-intent.ts). Only where the saved revision this Finish was sent for shows exactly that -- the
 *  named Deployment's saved scopes are empty -- is it said as what to do, the same root guidance Review lists; the backend's
 *  step, reason and field stay as the reference. Anything else: null, and the step's own sentence is said. */
function emptyBoundarySentence(detail: Record<string, unknown>, saved: Local | null): string | null {
  if (!saved || detail.reason !== "FIELD_INVALID" || typeof detail.field !== "string") return null
  const reference = `(${STEP_TITLES.deployments}: FIELD_INVALID, ${detail.field})`
  if (detail.field === "deployment.scopes" && saved.deployments === null && saved.scopes.length === 0) {
    return "Finish was refused: this setup has no resources yet, so it covers no account or Region. Pick at least one resource "
      + `as a root on ${STEP_TITLES.resource_boundaries}, save, and finish again. ${reference}`
  }
  const plural = /^deployments\[(\d+)\]\.scopes$/.exec(detail.field)
  const entry = plural && saved.deployments ? saved.deployments[Number(plural[1])] : undefined
  if (entry && entry.scopes.length === 0) {
    return `Finish was refused: Deployment ${entry.deploymentKey || "(no key)"} has no resources yet, so it covers no account or `
      + `Region. Pick at least one resource as a root for it on ${STEP_TITLES.resource_boundaries}, save, and finish again. ${reference}`
  }
  return null
}

/** Words for a write that did not save: what to do next, never a guess at what the backend did. ``saved``: the saved revision
 *  a refused Finish was sent for (exactly that version), so an incomplete one can be said in that revision's terms. */
function explain(answer: Exclude<SetupWrite, { kind: "SAVED" }>, saved: Local | null = null): string {
  if (answer.kind === "RESEND_SAME" && isUnrecordedRefusal(answer.detail)) {
    // (S1A-UI-LIFECYCLE-01) refused, but the refusal was NOT recorded: the save is still open on the server, never "a draft again"
    const setup = answer.detail.setup as { status?: unknown; not_recorded_because?: unknown }
    const because = typeof setup.not_recorded_because === "string" ? ` (${setup.not_recorded_because})` : ""
    return `The save was refused (${answer.code}), but the refusal could not be recorded${because}: the setup stays `
      + `${typeof setup.status === "string" ? setup.status.toLowerCase() : "finishing"} until an author who may still save it `
      + "checks it. This request is kept unchanged; \"Check the save again\" resends exactly it."
  }
  if (answer.kind === "RESEND_SAME") return `Not confirmed yet (${answer.code}). Try again: the same request is resent, unchanged.`
  if (answer.code === "VERSION_CONFLICT") return "This setup changed elsewhere. It was reloaded; your typing is kept, save again."
  // (PC1 S0-D) The request's identifier is already recorded for ANOTHER person's request (CONFLICT) or for a different request
  // of this person (REUSED). Resending it can never succeed, so it is settled; what the person typed stays on screen.
  if (answer.code === "REQUEST_ID_CONFLICT" || answer.code === "REQUEST_ID_REUSED") {
    return `Not saved: this request's identifier was already used for ${answer.code === "REQUEST_ID_CONFLICT"
      ? "another person's request" : "a different request"} (${answer.code}). Your typing is kept; saving again sends it as a new request.`
  }
  const preview = previewRefusalSentence(answer.code)
  if (preview) {
    const held = Array.isArray(answer.detail.accounts)
      ? answer.detail.accounts.filter((a): a is { account_id: string; reason: string | null } => typeof a === "object" && a !== null)
        .map((a) => ` ${a.account_id}: ${heldSentence(a.reason ?? null)}.`).join("") : ""
    return `${preview}${held} (${answer.code})`
  }
  if (answer.code === "SETUP_INCOMPLETE") {
    const empty = emptyBoundarySentence(answer.detail, saved)
    if (empty) return empty
    const at = typeof answer.detail.step === "string" ? STEP_TITLES[answer.detail.step as SetupStep] ?? answer.detail.step : "a step"
    return `${at} is not complete (${String(answer.detail.reason ?? answer.code)}${answer.detail.field ? `: ${String(answer.detail.field)}` : ""}).`
  }
  return `Not saved: ${answer.code}.`
}

export function SetupWizard({ setupId, accountId, view, picks, onClose, client: injected, stacks, readApplied, readResult,
                             actor = null, pendingStore, readPreview = readPreviewDefault,
                             readCensus = fetchCensusPage, pluralOffered = false }: SetupWizardProps) {
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
  // (SW-96) The setup on screen when an answer arrives: a refused Finish is explained from the saved revision it was sent for,
  // and only while that is exactly the version on screen.
  const shownSetup = useRef<SetupView | null>(null)
  shownSetup.current = setup
  useEffect(() => {
    setPending(pendingForSetup(store.read(), actor, accountId, setupId))
  }, [actor, accountId, setupId, store])

  // (S0 NSW-02) Each read of the setup -- on open, on "Check the save again", after a refused write, and again for a new
  // person, account or setup -- takes the next generation, and a SAVED write moves it on too: an answer, success or refusal,
  // is shown only while it answers the LATEST read and no write has answered since. HTTP completion order says nothing about
  // which snapshot is newer, so an earlier read answering last (a FINISHING captured before the commit) changes nothing.
  // Reads never touch the pending store: an unresolved write keeps its request id whatever they answer.
  const readGeneration = useRef(0)
  // The setup whose typing is on screen: a re-read for it keeps that typing and step; another setup starts from its saved intent.
  const shownFor = useRef<string | null>(null)
  const load = useCallback(async (keepTyping: boolean) => {
    const read = ++readGeneration.current
    const answer = await client.readSetup(setupId)
    if (read !== readGeneration.current) return
    if (answer.kind !== "OK") {
      if (answer.kind === "REFUSED") {
        setSetup(null)                                                   // refused NOW: the earlier snapshot is not shown
        setProblem(`This setup cannot be opened (${answer.code}).`)
      } else setProblem(`This setup could not be read (${answer.code}).`)
      return
    }
    setSetup(answer.value)
    if (!keepTyping) {
      const loaded = loadIntent(answer.value.intent)
      setLocal(loaded.kind === "ok" ? loaded.local : null)          // an intent this release cannot carry back is never edited
      setStep(answer.value.status === "FINISHED" ? "progress_and_results" : answer.value.intent.resume_step)
      shownFor.current = setupId
    }
  }, [client, setupId])
  useEffect(() => {
    void load(shownFor.current === setupId)
  }, [context, load, setupId])
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

  // (S1a R6) The preview of the SAVED revision: read on Review for a DRAFT create setup, one per (context, setup, state
  // version) and "Preview again"; each read takes the next generation and only the LATEST, still in the context it was sent
  // in, is shown -- and only as the preview of the exact setup and version it names. Never a write; never kept past a reload.
  const [preview, setPreview] = useState<{ key: string; read: PreviewRead } | null>(null)
  const [previewNonce, setPreviewNonce] = useState(0)
  const previewGeneration = useRef(0)
  const shownSetupId = setup?.setup_id ?? null
  const shownVersion = setup?.state_version ?? null
  const previewable = setup !== null && setup.status === "DRAFT" && setup.mode === "create" && step === "review_and_start"
  useEffect(() => {
    if (!previewable || shownSetupId === null || shownVersion === null) return
    const generation = ++previewGeneration.current
    const key = `${context}|${shownSetupId}|${shownVersion}`
    setPreview(null)
    void readPreview(shownSetupId, shownVersion).then((read) => {
      if (generation !== previewGeneration.current || currentContext.current !== context) return
      const other = read.kind === "OK" && (read.value.setup.setupId !== shownSetupId || read.value.setup.stateVersion !== shownVersion)
      setPreview({ key, read: other ? { kind: "UNAVAILABLE", status: 200, code: "PREVIEW_OF_ANOTHER_VERSION" } : read })
    })
  }, [context, previewable, previewNonce, readPreview, shownSetupId, shownVersion])

  const intentFor = useCallback((nextStep: SetupStep): SetupIntent => ({
    declaration: draftDeclaration(local!), dispositions: local!.dispositions, resume_step: nextStep,
  }), [local])

  /** Send ONE frozen operation of THIS person, on THIS account and setup; keep it while its outcome is unknown, drop it on a
   *  definite answer. An operation of anyone else is never sent here. A version-2 Finish is sent with exactly its digest. */
  const send = useCallback(async (op: PendingSetupOp) => {
    if (op.kind === "create" || op.actor !== actor || op.accountId !== accountId || op.setupId !== setupId) {
      setProblem("That unconfirmed request belongs to another identity or setup; it is not sent from here.")
      return
    }
    const sentIn = context
    setBusy(true)
    const answer = op.kind === "update" ? await client.updateSetup(op.setupId, op.requestId, op.base, op.steps)
      : op.version === 2 ? await client.finishSetup(op.setupId, op.requestId, op.base, op.previewDigest)
        : await client.finishSetup(op.setupId, op.requestId, op.base)
    if (answer.kind !== "RESEND_SAME") store.remove(op)                 // a definite answer settles THIS tuple, whoever is here now
    setBusy(false)
    if (currentContext.current !== sentIn) return                        // a later context: its screen is not this answer's
    if (answer.kind === "RESEND_SAME") {
      setProblem(explain(answer))
      // An unrecorded refusal left the save open (FINISHING): read the setup again so it is shown read-only, as it is -- the
      // kept request stays the only thing resent from here.
      if (isUnrecordedRefusal(answer.detail)) await load(true)
      return
    }
    setPending(null)
    if (answer.kind === "SAVED") {
      readGeneration.current += 1                                        // a read sent before this answer is older than it
      setProblem(null)
      setSetup(answer.view)
      setStep(op.kind === "finish" ? "progress_and_results" : (op.kind === "update" ? op.steps.resume_step : step))
      return
    }
    const sentFor = shownSetup.current
    const loaded = op.kind === "finish" && sentFor !== null && sentFor.setup_id === op.setupId && sentFor.state_version === op.base
      ? loadIntent(sentFor.intent) : null
    setProblem(explain(answer, loaded?.kind === "ok" ? loaded.local : null))
    // What finishing would make the system moved (or could not be computed): the person reviews it again -- never finished on
    // a preview they did not see. A refusal that returned the setup to DRAFT moves its version, and so its preview, anyway.
    if (answer.code.startsWith("PREVIEW_")) setPreviewNonce((n) => n + 1)
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
    // (S2 intake I2c) a row that will use a Terraform state names its binding only once the upload returns one
    const unbound = local.dispositions.find((d) => isTerraform(d) && !d.ref?.key)
    if (unbound) {
      setProblem(`Upload the Terraform state for ${scopeWords(unbound.scope)} first, or choose another option for it.`)
      return
    }
    return dispatch(() => ({ version: 1, kind: "update", actor, accountId, setupId: setup.setup_id, requestId: freshRequestId(),
                             base: setup.state_version, steps: intentFor(nextStep), startedAt: new Date().toISOString() }))
  }, [accountId, actor, dispatch, intentFor, local, setup])

  /** A NEW Finish of the saved revision: version 2 naming ``previewDigest`` (the preview the person reviewed), or version 1
   *  exactly as before when the setup binds no stack. An unresolved Finish is resent as kept instead (``dispatch``). */
  const finish = useCallback((previewDigest: string | null) => {
    if (!setup) return
    const common = { actor, accountId, setupId: setup.setup_id, requestId: freshRequestId(), base: setup.state_version,
                     startedAt: new Date().toISOString() }
    return dispatch(() => (previewDigest === null ? { version: 1, kind: "finish", ...common }
      : { version: 2, kind: "finish", ...common, previewDigest }))
  }, [accountId, actor, dispatch, setup])

  /** FINISHING: resend THIS browser's own Finish if it holds it; otherwise only read again (never a new Finish request). */
  const checkAgain = useCallback(async () => {
    const unresolved = pendingForSetup(store.read(), actor, accountId, setupId)
    if (unresolved?.kind === "finish") return send(unresolved)
    await load(true)
  }, [accountId, actor, load, send, setupId, store])

  if (problem && !setup) return <Panel onClose={onClose}><p role="alert" className="text-sm text-red-700">{problem}</p></Panel>
  // (S1a D1) A saved intent with a key this release does not know is never edited, saved or finished from here -- and never
  // re-saved without that key.
  const savedIntent = setup ? loadIntent(setup.intent) : null
  if (setup && savedIntent?.kind === "unknown") {
    return (
      <Panel onClose={onClose}>
        <p role="alert" className="text-sm text-amber-800" data-testid="setup-contract-unknown">
          This setup was saved by a newer version of Cyntro ({savedIntent.code}: {savedIntent.at}). It is not changed, saved
          or finished from this screen.
        </p>
      </Panel>
    )
  }
  if (!setup || !local) return <Panel onClose={onClose}><p className="text-sm text-slate-500">Opening the setup…</p></Panel>

  const index = SETUP_STEPS.indexOf(step)
  const next = SETUP_STEPS[Math.min(index + 1, SETUP_STEPS.length - 1)]
  // (G2-F17) What is on screen differs from the SAVED revision: Finish would commit the saved one, so it waits for a Save.
  const dirty = intentKey(intentFor(step)) !== intentKey(setup.intent)
  // (G2-F19) Where the unresolved write is ACTUALLY kept now -- its own read-back, not a guess about storage.
  const kept = pending ? store.where(pending.requestId) : null
  const others = othersForSetup(store.read(), actor, accountId, setupId)
  const derived = new Map(setup.dispositions_derived.map((d) => [rowKey(d), d]))
  const editable = setup.status === "DRAFT"
  const set = (patch: Partial<Local>) => setLocal((current) => (current ? { ...current, ...patch } : current))
  // (S1b) The plural shape is the SAVED/typed intent's (A9); a second Deployment is offered only per the capability AND level 5.
  const plural = local.deployments !== null
  const canAddDeployment = editable && pluralOffered && setup.mode === "create" && setupLevelOf(setup) === SETUP_CONTRACT_LEVEL
    && (local.deployments?.length ?? 1) < MAX_DEPLOYMENTS
  /** (S1b) Apply a Deployment change, or say why not (nothing changes). */
  const change = (make: (current: Local) => DeploymentChange): string | null => {
    const answer = make(local)
    if (answer.kind === "refused") return answer.why
    setLocal(answer.local)
    return null
  }
  /** (S0 NSW-04) The row at ``index`` with ``choice`` -- its scope kept exactly as authored -- or, with no choice, removed. */
  /** The stacks a row may use: the census list of ITS account -- this screen lists only this account's, so a row of another
   *  account is offered none and keeps what it has until that account's own list is read. */
  const stacksFor = (d: AuthoredDisposition): StackOption[] | null =>
    d.scope.account_id === accountId && stacks?.state === "served" ? stacks.stacks : null
  /** (S0-R04/R05) Why ``proposed`` may not stand at ``index`` (-1: a new row), or null -- the row judged WHOLE, as it would be
   *  sent: a request without the Region the served profile needs, a (subject, account, Region) another row already has, or
   *  an existing stack with no list of its account here. */
  const refused = (index: number, proposed: AuthoredDisposition): string | null => {
    if (proposed.choice === "requested" && !proposed.scope.region && needsRegion(proposed.subject, setup.requirement_profile)) {
      return "A request needs a Region: the requirement profile asks for one."
    }
    if (plural && proposed.choice === "requested" && DEPLOYMENT_SCOPED_SUBJECTS.has(proposed.subject)) {
      return "An owner request is made per account and Region, not per Deployment (OWNER_REQUEST_NOT_DEPLOYMENT_SCOPED)."
    }
    const owner = plural && proposed.ref?.kind === "stack_binding"
      ? local.bindings.find((b) => b.stack_id === proposed.ref?.key && keyOf(b) !== proposed.scope.deployment) : undefined
    if (owner) return `That stack is Deployment ${keyOf(owner)}'s; a stack belongs to one Deployment here (DISPOSITION_REF_OTHER_DEPLOYMENT).`
    if (proposed.choice === "use_existing" && proposed.ref?.kind === "stack_binding" && !stacksFor(proposed)) {
      return `No CloudFormation stacks of account ${proposed.scope.account_id} are listed here, so none can be used for it.`
    }
    if (local.dispositions.some((d, i) => i !== index && rowKey(d) === rowKey(proposed))) {
      return proposed.scope.region ? `${proposed.scope.region} already has a choice here; change that one.`
        : "All of the account already has a choice here; change that one."
    }
    return null
  }
  /** (S1a) The stack an infrastructure-as-code row uses, or null. */
  const stackOf = (d: AuthoredDisposition | null | undefined): string | null =>
    d && d.subject === "iac" && d.choice === "use_existing" && d.ref?.kind === "stack_binding" && d.ref.key ? d.ref.key : null
  /** (S1a) The setup's bindings once the row at ``index`` (-1: a new row) becomes ``row`` (null: removed): the binding of the
   *  stack it stops using goes (unless another row still uses it), the stack it now uses is bound -- as this account's census
   *  lists it -- and a binding the person did not touch stays exactly as saved. One stack per setup in this release. */
  const bindingsWith = (index: number, row: AuthoredDisposition | null): StackBinding[] | string => {
    const before = stackOf(index >= 0 ? local.dispositions[index] : null)
    const after = stackOf(row)
    const others = new Set(local.dispositions.flatMap((d, i) => (i !== index && stackOf(d) ? [stackOf(d) as string] : [])))
    let bindings = local.bindings.filter((b) => !(b.stack_id === before && before !== after && !others.has(before)))
    if (after && !bindings.some((b) => b.stack_id === after)) {
      const option = row ? stacksFor(row)?.find((s) => s.stack_id === after) : undefined
      if (!option) return "That stack is not in this account's census list, so it cannot be bound here."
      bindings = [...bindings, bindingOf(stackBinding(row!.scope.account_id, option), plural ? row!.scope.deployment : undefined)]
    }
    // (S1b) one stack per Deployment in a plural setup; one per setup otherwise, exactly as before
    if (plural) {
      const keys = bindings.map((b) => keyOf(b) ?? "")
      if (new Set(keys).size !== keys.length) return "This release binds one stack per Deployment; change the stack it already uses instead."
    } else if (bindings.length > 1) return "This release binds one stack per setup; change the stack already chosen instead."
    return bindings
  }
  /** The row at ``index`` (-1: appended) as ``row`` (null: removed), with the bindings and scopes that follow -- or why not
   *  (nothing changes). */
  const placeRow = (index: number, row: AuthoredDisposition | null): string | null => {
    const bindings = bindingsWith(index, row)
    if (typeof bindings === "string") return bindings
    setLocal((current) => {
      if (!current) return current
      const dispositions = index < 0 ? [...current.dispositions, row!]
        : row === null ? current.dispositions.filter((_d, i) => i !== index)
          : current.dispositions.map((d, i) => (i === index ? row : d))
      const changed = JSON.stringify(bindings) !== JSON.stringify(current.bindings)
      return changed ? withBoundary({ ...current, dispositions }, { bindings }) : { ...current, dispositions }
    })
    return null
  }
  /** The row at ``index`` with ``choice`` -- its scope kept exactly as authored -- or, with no choice, removed; or why not (the
   *  row stays as it was). */
  const chooseAt = (index: number, choice: Choice | ""): string | null => {
    if (!choice) return placeRow(index, null)
    const d = local.dispositions[index]
    const proposed = authored(d.subject, d.scope, choice, d)
    return refused(index, proposed) ?? placeRow(index, proposed)
  }
  /** The stack the iac row at ``index`` uses: its reference, and the Region of THAT stack (the backend holds a reference whose
   *  Region is not its stack's) -- never the Region of some root; a Region another iac row already has is refused and the
   *  row stays as it was. (S1a) The stack is the setup's binding too. (S1b) The row keeps its Deployment. */
  const stackAt = (index: number, stackId: string): string | null => {
    const d = local.dispositions[index]
    const stack = stacksFor(d)?.find((s) => s.stack_id === stackId)        // only ever a stack of the row's own account
    const scope = stack ? { account_id: d.scope.account_id, region: stack.region,
                            ...(d.scope.deployment === undefined ? {} : { deployment: d.scope.deployment }) } : d.scope
    const proposed = { ...d, scope, ref: { kind: "stack_binding" as const, key: stackId } }
    return refused(index, proposed) ?? placeRow(index, proposed)
  }
  /** (S2 intake I2c) The iac row at ``index`` uses the uploaded Terraform state ``key`` (empty: not uploaded yet) -- its scope
   *  kept exactly as authored, any stack it used released. */
  const terraformAt = (index: number, key: string): string | null => {
    const d = local.dispositions[index]
    const proposed: AuthoredDisposition = { subject: d.subject, scope: { ...d.scope }, choice: "use_existing", reason_code: "USE_EXISTING",
                                            ref: { kind: "terraform_state", key } }
    return refused(index, proposed) ?? placeRow(index, proposed)
  }
  /** (SW114 R1) An upload's binding, applied when it RETURNS -- to the row of stable identity ``identity`` in THIS setup as it
   *  is NOW: the current state, never the render the upload began in. A row removed, moved to another choice, or of another
   *  setup by then is left as it is; nothing else changes (newer rows and stack bindings stand). */
  const bindTerraform = (identity: string, forSetup: string) => (bindingId: string) => setLocal((current) => {
    if (!current || shownSetup.current?.setup_id !== forSetup) return current
    const at = current.dispositions.findIndex((d) => rowKey(d) === identity)
    if (at < 0 || !isTerraform(current.dispositions[at])) return current
    const row: AuthoredDisposition = { ...current.dispositions[at], ref: { kind: "terraform_state", key: bindingId } }
    return { ...current, dispositions: current.dispositions.map((d, i) => (i === at ? row : d)) }
  })
  /** (S2 intake I2c) A NEW iac row for this account at ``region`` that will use an uploaded Terraform state. */
  const addTerraform = (subject: string, region: string, deployment?: string): string | null => {
    if (region && !REGION.test(region)) return `"${region}" is not a Region name.`
    const scope = { account_id: accountId, ...(region ? { region } : {}), ...(deployment === undefined ? {} : { deployment }) }
    const proposed: AuthoredDisposition = { subject, scope, choice: "use_existing", reason_code: "USE_EXISTING",
                                            ref: { kind: "terraform_state", key: "" } }
    return refused(-1, proposed) ?? placeRow(-1, proposed)
  }
  /** A NEW row of ``subject`` for this account at ``region`` (all of the account when none) -- (S1b) of Deployment
   *  ``deployment`` for a code / iac row of a plural setup -- or why not: a Region the backend would refuse, or anything
   *  ``refused`` names. */
  const addRow = (subject: string, region: string, choice: Choice, deployment?: string): string | null => {
    if (region && !REGION.test(region)) return `"${region}" is not a Region name.`
    const scope = { account_id: accountId, ...(region ? { region } : {}), ...(deployment === undefined ? {} : { deployment }) }
    const proposed = authored(subject, scope, choice)
    return refused(-1, proposed) ?? placeRow(-1, proposed)
  }
  /** (S1a) The person's verdict on one resource of the bound stack (null: as the stack says), exactly as the stack wizard
   *  records it; the scopes follow. */
  const decide = (row: CensusRow, binding: StackBinding, verdict: ResourceDecision["verdict"] | null) => setLocal((current) => {
    if (!current) return current
    const others = current.decisions.filter((d) => !(d.account_id === binding.account_id && d.resource_uid === row.row_key))
    // (S1b) a decision of a plural setup names the Deployment whose stack it decides
    const named = keyOf(binding)
    const decisions = verdict === null ? others : [...others, {
      account_id: binding.account_id, region: row.region, resource_uid: row.row_key, verdict,
      selection: { row_key: row.row_key, stack_id: row.cfn?.stack_id ?? null, census: { generation: binding.selection.census.generation } },
      ...(named === undefined ? {} : { deployment_key: named }),
    }]
    return withBoundary(current, { decisions })
  })
  const undecide = (decision: ResourceDecision) => setLocal((current) => (current ? withBoundary(current, {
    decisions: current.decisions.filter((d) => d !== decision) }) : current))
  // Regions this setup already names, offered (never chosen) for a Region a subject needs.
  const knownRegions = [...new Set([
    ...(local.deployments ? local.deployments.flatMap((d) => d.scopes) : local.scopes)
      .filter((c) => c.account_id === accountId).map((c) => c.region),
    ...(stacks?.state === "served" ? stacks.stacks.map((s) => s.region) : []),
  ])].sort()
  // (S1a) The one stack binding of this account the person may decide resources of.
  const bound = local.bindings.find((b) => b.account_id === accountId) ?? null
  // (S1a R5/R6) Finish of a setup that binds a stack rests on the preview of EXACTLY the saved version, computed.
  const needsPreview = setup.mode === "create" && bindsStack(setup.intent)
  const shownPreview = preview && preview.key === `${context}|${setup.setup_id}|${setup.state_version}` ? preview.read : null
  const reviewed = shownPreview?.kind === "OK" && shownPreview.value.state === "COMPUTED"
    && shownPreview.value.setup.stateVersion === setup.state_version ? shownPreview.value : null
  const finishBlocked = needsPreview && reviewed === null && pending?.kind !== "finish"

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
        {step === "deployments" && local.deployments ? (
          <Deployments deployments={local.deployments} view={view} editable={editable} canAdd={canAddDeployment}
            onRename={(i, key) => change((current) => renameDeployment(current, i, key))}
            onField={(i, patch) => setLocal((current) => (current ? withDeployment(current, i, patch) : current))}
            onAdd={(key) => change((current) => addDeployment(current, key))}
            onRemove={(key) => change((current) => removeDeployment(current, key))} />
        ) : null}
        {step === "deployments" && !local.deployments ? (
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
            <p className="text-xs text-slate-500" data-testid="setup-scopes">
              This deployment covers the accounts and Regions of the stack, roots and decisions you choose
              ({local.scopes.map((c) => `${c.account_id} ${c.region}`).join(", ") || "none yet"}).
            </p>
            {canAddDeployment ? <AddDeployment onAdd={(key) => change((current) => addDeployment(current, key))} /> : null}
          </>
        ) : null}
        {step === "code_and_infrastructure" || step === "required_data" || step === "historical_data" ? (
          <>
            {step === "code_and_infrastructure" && stacks?.state === "unavailable" ? (
              <p className="text-xs text-slate-500" data-testid="setup-stacks-unavailable">CloudFormation stacks: {stacks.reason}</p>
            ) : null}
            {/* (S1b, N1) in a plural setup each Deployment has its own code / iac choices; every other subject stays once */}
            {(plural && step === "code_and_infrastructure" ? local.deployments!.map((d) => d.deploymentKey) : [undefined]).map((key) => (
              <div key={key ?? "all"} className={key === undefined ? "space-y-3" : "space-y-2 rounded border border-violet-200 p-2"}
                data-testid={key === undefined ? undefined : `setup-deployment-subjects-${key}`}>
                {key === undefined ? null : <p className="text-sm font-medium">Deployment {key}</p>}
                {Object.entries(SUBJECTS).filter(([, meta]) => meta.step === step).map(([subject, meta]) => (
                  <Subject key={subject} subject={subject} label={meta.label} deployment={key} editable={editable}
                    choices={plural && DEPLOYMENT_SCOPED_SUBJECTS.has(subject) ? meta.choices.filter((c) => c !== "requested") : meta.choices}
                    rows={local.dispositions.flatMap((d, index) => (d.subject === subject && d.scope.deployment === key
                      ? [{ index, d, derived: derived.get(rowKey(d)), stacks: meta.refKind === "stack_binding" ? stacksFor(d) : null }] : []))}
                    regional={needsRegion(subject, setup.requirement_profile)} regions={knownRegions}
                    onChoose={chooseAt} onAdd={(region, choice) => addRow(subject, region, choice, key)}
                    stackOptions={meta.refKind === "stack_binding" && stacks?.state === "served" ? stacks.stacks : null}
                    onStack={stackAt}
                    terraform={subject === "iac" ? { accountId, onUse: terraformAt, onAdd: (region) => addTerraform(subject, region, key),
                                                     onBound: (identity) => bindTerraform(identity, setup.setup_id) } : undefined} />
                ))}
              </div>
            ))}
          </>
        ) : null}
        {step === "resource_boundaries" && local.deployments ? (
          <PluralBoundaries local={local} picks={picks} editable={editable} accountId={accountId} readCensus={readCensus}
            onPicks={(key) => change((current) => withRootsOf(current, key, picks))} onDecide={decide} onRemove={undecide} />
        ) : null}
        {step === "resource_boundaries" && !local.deployments ? (
          <>
            <p className="text-sm">{local.roots.length} root resource(s) in this setup.</p>
            <ul className="text-xs text-slate-600" data-testid="setup-roots">
              {local.roots.map((picked) => <li key={picked.root.resource_uid}>{picked.label}</li>)}
            </ul>
            <Button type="button" size="sm" variant="outline" disabled={!editable || picks.length === 0}
              onClick={() => setLocal((current) => (current ? withBoundary(current, { roots: picks }) : current))}>
              Use my {picks.length} pick(s) from the inventory below
            </Button>
            <Decisions bound={bound} decisions={local.decisions} editable={editable} accountId={accountId}
              readCensus={readCensus} onDecide={decide} onRemove={undecide} />
            <p className="text-xs text-slate-500">
              Which resources belong to the system is computed from the saved setup: Review shows it before you finish.
            </p>
          </>
        ) : null}
        {step === "review_and_start" ? <Review local={local} view={view} setup={setup} dirty={dirty} status={status}
          statusProblem={statusProblem} preview={shownPreview} needsPreview={needsPreview}
          onPreviewAgain={() => setPreviewNonce((n) => n + 1)} readPreview={readPreview} context={context} /> : null}
        {step === "progress_and_results" ? <Progress setup={setup} status={status} statusProblem={statusProblem} context={context}
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
            <Button type="button" size="sm" data-testid="setup-finish"
              onClick={() => void finish(needsPreview && reviewed ? reviewed.previewDigest : null)}
              disabled={busy || dirty || (pending !== null && pending.kind !== "finish") || finishBlocked}
              title={dirty ? "Save your changes first: Finish commits the saved revision."
                : finishBlocked ? "Finishing a setup that binds a stack rests on its computed preview; review it first." : undefined}>
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

/** Where one row applies: a Region of its account, or all of it. */
function scopeWords(scope: AuthoredDisposition["scope"]): string {
  return `${scope.account_id} / ${scope.region ?? "all Regions"}`
}

/** A derived row named so two Regions of one subject are told apart -- (S1b) and two Deployments' code / iac choices. */
function rowLabel(d: DerivedDisposition): string {
  return `${SUBJECTS[d.subject]?.label ?? d.subject}${d.scope.region ? ` (${d.scope.region})` : ""}`
    + (d.scope.deployment === undefined ? "" : ` · Deployment ${d.scope.deployment}`)
}

/** (S0 NSW-04) One subject's rows -- each its own (account, Region), never merged -- and, where THE served profile scopes the
 *  subject by Region, a way to add it for a Region the person names (rows of the setup's Regions are offered, never chosen). */
function Subject({ subject, label, deployment, choices, editable, rows, regional, regions, onChoose, onAdd, stackOptions, onStack,
                   terraform }: {
  subject: string
  label: string
  /** (S1b) The Deployment these rows are of (a plural setup's code / iac); undefined: the setup's or the union's. */
  deployment?: string
  choices: Choice[]
  editable: boolean
  rows: { index: number; d: AuthoredDisposition; derived: DerivedDisposition | undefined; stacks: StackOption[] | null }[]
  regional: boolean
  regions: string[]
  onChoose: (index: number, choice: Choice | "") => string | null
  onAdd: (region: string, choice: Choice) => string | null
  /** This account's stacks, for a NEW row; each existing row carries those of its own account. */
  stackOptions: StackOption[] | null
  onStack: (index: number, key: string) => string | null
  /** (S2 intake I2c) iac only: rows of THIS account may use an uploaded Terraform state. */
  terraform?: {
    accountId: string
    onUse: (index: number, key: string) => string | null
    onAdd: (region: string) => string | null
    /** The completion for the row of ``identity``: applied to that row as it is when the upload returns (SW114 R1). */
    onBound: (identity: string) => (bindingId: string) => void
  }
}) {
  const [region, setRegion] = useState("")
  const [problem, setProblem] = useState<string | null>(null)
  const scoped = deployment === undefined ? subject : `${subject}-${deployment}`
  const listId = `setup-regions-${scoped.replace(/[^A-Za-z0-9_-]/g, "-")}`          // an id a selector can name
  const options = (empty: string, offered: StackOption[] | null, terraformOffered: boolean) => (
    <>
      <option value="">{empty}</option>
      {choices.map((choice) => (
        <option key={choice} value={choice} disabled={choice === "use_existing" && subject === "iac" && !offered}>
          {CHOICE_WORDS[choice]}
        </option>
      ))}
      {terraformOffered ? <option value={TERRAFORM}>Use an uploaded Terraform state</option> : null}
    </>
  )
  const add = (choice: Choice | typeof TERRAFORM | "") => {
    if (!choice) return
    const refused = choice === TERRAFORM ? terraform!.onAdd(region.trim()) : onAdd(region.trim(), choice)
    setProblem(refused)
    if (!refused) setRegion("")
  }
  return (
    <div className="rounded border p-2 text-sm" data-testid={`setup-subject-${scoped}`}>
      <p>{label}</p>
      {rows.map(({ index, d, derived, stacks }) => (
        <div key={rowKey(d)} className="mt-1" data-testid={`setup-row-${scoped}-${d.scope.region ?? "all"}`}>
          <label className="block">
            <span className="text-xs text-slate-600">{scopeWords(d.scope)}</span>
            <select className="ml-2 rounded border px-2 py-1" value={isTerraform(d) ? TERRAFORM : d.choice} disabled={!editable}
              aria-label={`${label}, ${scopeWords(d.scope)}`} onChange={(e) => setProblem(e.target.value === TERRAFORM
                ? terraform!.onUse(index, isTerraform(d) ? d.ref!.key : "") : onChoose(index, e.target.value as Choice | ""))}>
              {options("Remove this choice", stacks, terraform !== undefined && (isTerraform(d) || d.scope.account_id === terraform.accountId))}
            </select>
          </label>
          {isTerraform(d) && terraform ? (
            <TerraformRow bindingId={d.ref!.key} accountId={d.scope.account_id}
              editable={editable && d.scope.account_id === terraform.accountId}
              onBound={terraform.onBound(rowKey(d))} />
          ) : null}
          {d.choice === "use_existing" && subject === "iac" && stacks && !isTerraform(d) ? (
            <select className="mt-1 block rounded border px-2 py-1" value={d.ref?.key ?? ""} disabled={!editable}
              onChange={(e) => setProblem(onStack(index, e.target.value))} aria-label="CloudFormation stack">
              <option value="">Choose a stack…</option>
              {stacks.map((stack) => <option key={stack.stack_id} value={stack.stack_id}>{stack.label}</option>)}
            </select>
          ) : null}
          {derived ? <p className="mt-1 text-xs text-slate-600" data-testid={`setup-derived-${subject}`}>{derivedSentence(derived)}</p> : (
            <p className="mt-1 text-xs text-slate-400">What Cyntro finds is shown once this step is saved.</p>
          )}
        </div>
      ))}
      {editable && (regional || rows.length === 0) ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {regional ? (
            <>
              <input className="rounded border px-2 py-1" value={region} list={listId} placeholder="all Regions"
                aria-label={`Region for ${label}`} onChange={(e) => setRegion(e.target.value)} />
              <datalist id={listId}>{regions.map((r) => <option key={r} value={r} />)}</datalist>
            </>
          ) : null}
          <select className="rounded border px-2 py-1" value="" aria-label={regional ? `${label} for this Region` : label}
            onChange={(e) => add(e.target.value as Choice | typeof TERRAFORM | "")}>
            {options("Choose…", stackOptions, terraform !== undefined)}
          </select>
        </div>
      ) : null}
      {problem ? <p role="alert" className="mt-1 text-xs text-amber-800">{problem}</p> : null}
    </div>
  )
}

/** (S2 intake I2c) An iac row that uses an uploaded Terraform state: the binding it names, or -- none yet, or on request -- the
 *  upload (disclosure, local reduction and count, explicit confirmation). What the server makes of the binding is the row's
 *  derived sentence, once saved. Only a row of THIS screen's account uploads (``editable``): a saved row of another account
 *  shows its binding and nothing to upload. */
function TerraformRow({ bindingId, accountId, editable, onBound }: {
  bindingId: string
  accountId: string
  editable: boolean
  onBound: (bindingId: string) => void
}) {
  const [replacing, setReplacing] = useState(false)
  const [listing, setListing] = useState(false)
  // (S2 lifecycle) every state this person uploaded for the account, to read or revoke -- an aborted upload may be stored
  const states = (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setListing((v) => !v)}>
        {listing ? "Hide your uploaded Terraform states" : "Your uploaded Terraform states"}
      </Button>
      {listing ? <TerraformBindingsPanel accountId={accountId} editable={editable} /> : null}
    </>
  )
  if (bindingId && !replacing) {
    return (
      <div className="mt-1 text-xs" data-testid="setup-terraform-bound">
        <p>Uses the uploaded Terraform state binding {bindingId}.</p>
        {editable ? <Button type="button" size="sm" variant="outline" onClick={() => setReplacing(true)}>Upload a different state</Button> : null}
        {states}
      </div>
    )
  }
  return (
    <>
      <TerraformStateUpload accountId={accountId} editable={editable} onBound={(created) => {
        setReplacing(false)
        onBound(created.binding_id)
      }} />
      {states}
    </>
  )
}

/** (S1b) A NEW Deployment's key, added on request -- offered only where the capability and the setup level allow it. */
function AddDeployment({ onAdd }: { onAdd: (key: string) => string | null }) {
  const [key, setKey] = useState("")
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <div className="space-y-1 rounded border border-dashed p-2 text-sm" data-testid="setup-add-deployment">
      <p className="text-xs text-slate-600">
        Another Deployment of this system in this account (for example staging beside prod): each gets its own stack, roots and
        code / infrastructure choices; the account&apos;s data sources are chosen once for all of them.
      </p>
      <div className="flex items-center gap-2">
        <input className="rounded border px-2 py-1" value={key} placeholder="Deployment key" aria-label="New Deployment key"
          maxLength={64} onChange={(e) => setKey(e.target.value)} />
        <Button type="button" size="sm" variant="outline" onClick={() => {
          const refused = onAdd(key)
          setProblem(refused)
          if (!refused) setKey("")
        }}>Add a Deployment</Button>
      </div>
      {problem ? <p role="alert" className="text-xs text-amber-800">{problem}</p> : null}
    </div>
  )
}

/** (S1b) A plural setup's Deployments: each one's key, environment and own word, and the cells its own entries make. A key
 *  change renames what names it; a Deployment is removed only while nothing names it. */
function Deployments({ deployments, view, editable, canAdd, onRename, onField, onAdd, onRemove }: {
  deployments: NonNullable<Local["deployments"]>
  view: DeclarationsView
  editable: boolean
  canAdd: boolean
  onRename: (index: number, key: string) => string | null
  onField: (index: number, patch: { environment?: string; environmentRaw?: string }) => void
  onAdd: (key: string) => string | null
  onRemove: (key: string) => string | null
}) {
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <div className="space-y-2" data-testid="setup-deployments">
      {deployments.map((d, i) => (
        <div key={i} className="space-y-1 rounded border p-2 text-sm" data-testid={`setup-deployment-${i}`}>
          <label className="block">Deployment key
            <input className="mt-1 block w-full rounded border px-2 py-1" value={d.deploymentKey} disabled={!editable} maxLength={64}
              onChange={(e) => setProblem(onRename(i, e.target.value))} />
          </label>
          <label className="block">Environment
            <select className="mt-1 block rounded border px-2 py-1" value={d.environment} disabled={!editable}
              onChange={(e) => onField(i, { environment: e.target.value })}>
              <option value="">Choose…</option>
              {view.limits.environments.map((env) => <option key={env} value={env}>{env}</option>)}
            </select>
          </label>
          <label className="block">Your own word for it (optional)
            <input className="mt-1 block w-full rounded border px-2 py-1" value={d.environmentRaw} disabled={!editable}
              maxLength={view.limits.max_environment_raw} onChange={(e) => onField(i, { environmentRaw: e.target.value })} />
          </label>
          <p className="text-xs text-slate-500" data-testid={`setup-scopes-${i}`}>
            Covers the accounts and Regions of its own stack, roots and decisions
            ({d.scopes.map((c) => `${c.account_id} ${c.region}`).join(", ") || "none yet"}).
          </p>
          {editable && deployments.length > 1 ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setProblem(onRemove(d.deploymentKey))}>
              Remove this Deployment
            </Button>
          ) : null}
        </div>
      ))}
      {problem ? <p role="alert" className="text-xs text-amber-800">{problem}</p> : null}
      {canAdd ? <AddDeployment onAdd={onAdd} /> : null}
    </div>
  )
}

/** (S1b) A plural setup's roots and decisions, per Deployment: the person's picks become ONE Deployment's roots, and each
 *  Deployment's bound stack offers its own resources to decide. */
function PluralBoundaries({ local, picks, editable, accountId, readCensus, onPicks, onDecide, onRemove }: {
  local: Local
  picks: PickedRoot[]
  editable: boolean
  accountId: string
  readCensus: CensusFetcher
  onPicks: (key: string) => string | null
  onDecide: (row: CensusRow, binding: StackBinding, verdict: ResourceDecision["verdict"] | null) => void
  onRemove: (decision: ResourceDecision) => void
}) {
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <div className="space-y-2">
      {local.deployments!.map(({ deploymentKey: key }) => {
        const roots = local.roots.filter((p) => keyOf(p.root) === key)
        const bound = local.bindings.find((b) => b.account_id === accountId && keyOf(b) === key) ?? null
        return (
          <div key={key} className="space-y-1 rounded border border-violet-200 p-2 text-sm" data-testid={`setup-boundaries-${key}`}>
            <p className="font-medium">Deployment {key}: {roots.length} root resource(s)</p>
            <ul className="text-xs text-slate-600">{roots.map((p) => <li key={p.root.resource_uid}>{p.label}</li>)}</ul>
            <Button type="button" size="sm" variant="outline" disabled={!editable || picks.length === 0}
              onClick={() => setProblem(onPicks(key))}>
              Use my {picks.length} pick(s) for {key}
            </Button>
            <Decisions bound={bound} decisions={local.decisions.filter((d) => keyOf(d) === key)} editable={editable}
              accountId={accountId} readCensus={readCensus} onDecide={onDecide} onRemove={onRemove} />
          </div>
        )
      })}
      {problem ? <p role="alert" className="text-xs text-amber-800">{problem}</p> : null}
      <p className="text-xs text-slate-500">
        Which resources belong to the system, and to which Deployment, is computed from the saved setup: Review shows it before
        you finish.
      </p>
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

/** (S1a) The person's per-resource decisions, as saved -- an exclusion included -- and, for the bound stack, its collected
 *  resources read from the census (the stack wizard's own reader), each decided "as the stack says", included or excluded. */
function Decisions({ bound, decisions, editable, accountId, readCensus, onDecide, onRemove }: {
  bound: StackBinding | null
  decisions: ResourceDecision[]
  editable: boolean
  accountId: string
  readCensus: CensusFetcher
  onDecide: (row: CensusRow, binding: StackBinding, verdict: ResourceDecision["verdict"] | null) => void
  onRemove: (decision: ResourceDecision) => void
}) {
  const [listed, setListed] = useState<{ stackId: string; resources: Resources } | null>(null)
  const show = (stackId: string) => {
    setListed({ stackId, resources: { kind: "loading" } })
    void stackResources(readCensus, accountId, stackId).then((resources) => {
      setListed((current) => (current?.stackId === stackId ? { stackId, resources } : current))
    })
  }
  const resources = listed && bound && listed.stackId === bound.stack_id ? listed.resources : null
  const verdictOf = (uid: string) => decisions.find((d) => d.account_id === accountId && d.resource_uid === uid)?.verdict ?? ""
  return (
    <div className="rounded border p-2 text-sm" data-testid="setup-decisions">
      <p>Per-resource decisions ({decisions.length})</p>
      <ul className="text-xs text-slate-600">
        {decisions.map((d) => (
          <li key={`${d.account_id}|${d.region}|${d.resource_uid}`} data-testid="setup-decision">
            {d.verdict === "exclude" ? "Excluded" : "Included"}: {d.resource_uid} ({d.account_id} / {d.region})
            {editable ? <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(d)}>Remove</Button> : null}
          </li>
        ))}
      </ul>
      {bound ? (
        <div className="mt-1 text-xs">
          <span>Bound stack: {bound.stack_id} ({bound.kind})</span>
          {editable && resources === null ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => show(bound.stack_id)}>Show its resources</Button>
          ) : null}
          {resources?.kind === "loading" ? <p className="text-slate-500">Reading the stack&apos;s resources…</p> : null}
          {resources?.kind === "failed" ? <p className="text-red-700">The stack&apos;s resources could not be read ({resources.reason}).</p> : null}
          {resources?.kind === "rows" ? (
            <ul className="mt-1 space-y-1">
              {resources.rows.map((row) => (
                <li key={row.row_key} className="flex items-center gap-2">
                  <span className="font-mono">{rowName(row)}</span>
                  <span className="text-slate-500">{row.resource_type}</span>
                  <select aria-label={`Decision for ${rowName(row)}`} className="rounded border px-1 py-0.5" disabled={!editable}
                    value={verdictOf(row.row_key)}
                    onChange={(e) => onDecide(row, bound, (e.target.value || null) as ResourceDecision["verdict"] | null)}>
                    <option value="">As the stack says</option>
                    <option value="include">Include in this system</option>
                    <option value="exclude">Exclude from this system</option>
                  </select>
                </li>
              ))}
              {resources.rows.length === 0 ? <li className="text-slate-500">No resource of this stack is collected in depth.</li> : null}
              {resources.cut ? <li className="text-amber-800">The list is cut: the census is larger than this page reads.</li> : null}
            </ul>
          ) : null}
        </div>
      ) : <p className="mt-1 text-xs text-slate-500">Choose a CloudFormation stack in Code and infrastructure to decide its resources.</p>}
    </div>
  )
}

/** One row of a preview list in words: a member's proof, a not-a-member's reason, a dependency's consumers, a hold. */
function previewRowSentence(list: ResultList, row: ResultRow): string {
  if (list === "members") return proofSentence(row)
  if (list === "not_members") return notMemberSentence(row)
  if (list === "dependencies") {
    const consumers = Array.isArray(row.consumers) ? row.consumers.length : 0
    return `a dependency${consumers ? ` of ${consumers} member${consumers === 1 ? "" : "s"}` : ""}${row.owner_system_key ? `, owned by ${String(row.owner_system_key)}` : ""}`
  }
  return `held (${String(row.reason ?? row.state)})`
}

/** (S2 C4a-2) What the preview's ``terraform`` section says of each Terraform row -- the server's join, never the browser's.
 *  Descriptive: it names no member, changes no count and is no Finish condition. A row the saved setup does not have is not
 *  shown as one of its own. */
function TerraformPreview({ bindings, rows }: { bindings: TerraformPreviewBinding[]; rows: AuthoredDisposition[] }) {
  const ours = (b: TerraformPreviewBinding) => rows.some((d) => d.ref?.key === b.bindingId && d.scope.account_id === b.row.accountId
    && (d.scope.region ?? null) === b.row.region && (d.scope.deployment ?? null) === b.row.deployment)
  const where = (b: TerraformPreviewBinding) => `${b.row.accountId} / ${b.row.region ?? "all Regions"}`
    + (b.row.deployment === null ? "" : ` · Deployment ${b.row.deployment}`)
  return (
    <div className="space-y-1 text-xs" data-testid="setup-preview-terraform">
      <p className="font-medium">Uploaded Terraform states</p>
      {bindings.map((b) => (
        <div key={`${where(b)}|${b.bindingId}`} data-testid={`setup-preview-terraform-${b.bindingId}`}>
          {!ours(b) ? (
            <p className="text-amber-800">The preview names a Terraform row this saved setup does not have ({where(b)}); it is not shown.</p>
          ) : b.state === "JOINED" && b.counts ? (
            <>
              <p>
                {where(b)}: {b.counts.matched} of {b.counts.identities} resource(s) of the uploaded state are in this account&apos;s
                Inventory (generation {b.inventoryGeneration}); {b.counts.notInInventory} not in it, {b.counts.ambiguous} ambiguous,
                {" "}{b.counts.notJoinable} not joinable.
              </p>
              <p className="text-slate-500">
                Assessed only, not connected: this uploaded snapshot is not acquired, and makes nothing a member.
              </p>
              <ul className="pl-4 text-slate-600">
                {b.rows.map((r) => <li key={`${r.address}|${r.outcome}`}>{r.address} -- {r.outcome.replaceAll("_", " ")}</li>)}
              </ul>
              {b.omitted ? <p className="text-slate-500">{b.omitted} more not shown.</p> : null}
            </>
          ) : (
            <p className="text-amber-800">
              {where(b)}: held ({b.reason}{b.reason && bindingReasonWords(b.reason) ? `: ${bindingReasonWords(b.reason)}` : ""}).
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

const LIST_TITLES: Record<ResultList, string> = {
  members: "Members", dependencies: "Dependencies", held: "Held", not_members: "Not members",
}

/** (S1a R3/R6) The preview of the saved revision: its state, each account's state, evidence time and lists with their
 *  explanations, and the rest of a list the summary cuts, page by page -- every page a view of THIS preview (a page of another
 *  preview is never added to it). Never applied membership. */
function PreviewPanel({ read, setupId, stateVersion, readPreview, onPreviewAgain, context, deploymentKeys, terraformRows }: {
  read: PreviewRead | null
  setupId: string
  stateVersion: number
  readPreview: PreviewFetcher
  onPreviewAgain: () => void
  context: string
  /** (S1b) The saved intent's Deployment keys, to name a v2 preview's Deployments (agreed A3 order). */
  deploymentKeys: string[]
  /** (S2 C4a-2) The saved intent's Terraform rows: a v3 section is shown only for rows the saved setup has. */
  terraformRows: AuthoredDisposition[]
}) {
  // (S1A-UI-PREVIEW-01/02) Each list's pages, read one request at a time: a page is accepted only as the answer to the
  // cursor that list is waiting for (each cursor once), and only when it names THIS preview, setup and version, account and
  // list -- anything else changes neither its rows nor its cursor. Rows are never de-duplicated: two rows of one resource are
  // two rows.
  type Paged = { entries: ResultRow[]; next: string | null; done: boolean; cursors: string[]; problem: string | null }
  const [pages, setPages] = useState<Record<string, Paged>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const inflight = useRef(new Set<string>())
  const shown = read?.kind === "OK" ? read.value : null
  const pageKey = (accountId: string, list: ResultList) => `${context}|${shown?.previewDigest}|${accountId}|${list}`
  const more = (accountId: string, list: ResultList) => {
    if (!shown) return
    const key = pageKey(accountId, list)
    const before = pages[key]
    if (inflight.current.has(key) || before?.done) return               // one request per list; a finished list asks no more
    const cursor = before?.cursors.length ? before.next : null
    const token = cursor ?? ""
    inflight.current.add(key)
    setLoading((current) => ({ ...current, [key]: true }))
    void readPreview(setupId, stateVersion, { accountId, bucket: list, cursor }).then((answer) => {
      inflight.current.delete(key)
      setLoading((current) => ({ ...current, [key]: false }))
      setPages((current) => {
        const now = current[key] ?? { entries: [], next: null, done: false, cursors: [], problem: null }
        const waiting = now.cursors.length ? (now.next ?? null) : ""
        if (now.done || now.cursors.includes(token) || waiting !== token) return current      // not the answer this list awaits
        const refuse = (code: string) => ({ ...current, [key]: { ...now,
          problem: `${previewRefusalSentence(code) ?? "That page could not be read."} (${code})` } })
        if (answer.kind !== "OK") return refuse(answer.code)
        const value = answer.value
        if (value.previewDigest !== shown.previewDigest) return refuse("PREVIEW_CHANGED")
        if (value.setup.setupId !== setupId || value.setup.stateVersion !== stateVersion) return refuse("PREVIEW_OF_ANOTHER_VERSION")
        if (!value.page || value.page.accountId !== accountId || value.page.bucket !== list) return refuse("PAGE_OF_ANOTHER_LIST")
        return { ...current, [key]: { entries: [...now.entries, ...value.page.entries], next: value.page.next,
                                      done: value.page.next === null, cursors: [...now.cursors, token], problem: null } }
      })
    })
  }
  const unlisted = shown?.counts.unlisted ?? 0
  return (
    <div className="space-y-2 rounded border p-2" data-testid="setup-preview">
      <div className="flex items-center gap-2">
        <p className="font-medium">Preview</p>
        <Button type="button" size="sm" variant="ghost" onClick={onPreviewAgain}>Preview again</Button>
      </div>
      {read === null ? <p className="text-xs text-slate-500">Computing the preview of the saved revision…</p> : (
        <p className="text-xs" data-testid="setup-preview-summary">{previewSentence(read)}</p>
      )}
      {shown ? (
        <>
          <p className="text-xs text-slate-500" data-testid="setup-preview-identity">
            Preview {shown.previewDigest.slice(0, 15)}… of saved revision {shown.setup.intentRevision} (state version{" "}
            {shown.setup.stateVersion}); rules {String(shown.rules.a7 ?? "?")}, projector {String(shown.rules.projector ?? "?")}.
          </p>
          {shown.deploymentId === null ? <Assessment preview={shown} deploymentKeys={deploymentKeys} /> : null}
          {unlisted > 0 ? (
            <p className="text-xs text-amber-800" data-testid="setup-preview-unlisted">
              {unlisted} row(s) of this system are in no list shown here (unlisted).
            </p>
          ) : null}
          {shown.terraform ? <TerraformPreview bindings={shown.terraform} rows={terraformRows} /> : null}
          {shown.accounts.map((account) => (
            <div key={account.accountId} className="text-xs" data-testid={`setup-preview-account-${account.accountId}`}>
              <p>
                Account {account.accountId}: {account.state === "COMPUTED" ? "computed" : `held -- ${heldSentence(account.reason)}`}
                {account.inventory.generation !== null ? ` · inventory generation ${account.inventory.generation}` : ""}
                {account.inventory.projectedThrough ? `, evidence as of ${account.inventory.projectedThrough}` : ""}
              </p>
              {account.state === "COMPUTED" && coverageLimits(account).length ? (
                <ul className="text-amber-800" data-testid={`setup-preview-limits-${account.accountId}`}>
                  {coverageLimits(account).map((limit) => <li key={limit}>{limit}</li>)}
                </ul>
              ) : null}
              {account.display ? PREVIEW_LISTS_SHOWN.map((list) => {
                const key = pageKey(account.accountId, list)
                const paged = pages[key]
                const count = account.counts?.[list] ?? 0
                const summary = account.display!.lists[list]
                const listed = paged && paged.entries.length ? paged.entries : summary
                // More is offered by the PAGE cursor (never by counting rows): before any page, while the summary is cut;
                // after, while the last accepted page names a next one.
                const offer = paged && paged.cursors.length ? !paged.done : summary.length < count
                return listed.length || count > 0 ? (
                  <details key={list} open={list === "members"} data-testid={`setup-preview-${list}`}>
                    <summary>{LIST_TITLES[list]} ({account.counts?.[list] ?? listed.length})</summary>
                    <ul className="text-slate-600">
                      {listed.map((row, i) => (
                        <li key={`${row.resource_uid}|${i}`}>
                          <span className="font-mono">{row.resource_uid}</span> -- {previewRowSentence(list, row)}
                        </li>
                      ))}
                    </ul>
                    {offer ? (
                      <Button type="button" size="sm" variant="ghost" onClick={() => more(account.accountId, list)}>
                        {loading[key] ? "Reading…" : paged?.cursors.length ? "Show more" : `Show all (${count - summary.length} more)`}
                      </Button>
                    ) : null}
                    {paged?.done && paged.entries.length !== count ? (
                      <p className="text-amber-800">The pages list {paged.entries.length} of the {count} counted; they disagree.</p>
                    ) : null}
                    {paged?.problem ? <p className="text-amber-800">{paged.problem}</p> : null}
                  </details>
                ) : null
              }) : null}
            </div>
          ))}
        </>
      ) : null}
      <p className="text-xs text-slate-500">
        A preview is computed from the saved setup and the account&apos;s current inventory and census; nothing is written. It is
        what finishing would propose, not what is applied -- the applied membership is shown after the setup is finished.
      </p>
    </div>
  )
}

const PREVIEW_LISTS_SHOWN: readonly ResultList[] = ["members", "dependencies", "held", "not_members"]

/** (S1b, A7 reading A / N3) The consolidated account assessment of a plural draft's preview: per account, the backend's unique
 *  counts and admitted inventory, each Deployment's members (said apart from the ones it shares), and the remainder that was
 *  not assessed -- never "complete" or "unused" from absence. A held preview's account says nothing per Deployment. */
function Assessment({ preview, deploymentKeys }: { preview: Preview; deploymentKeys: string[] }) {
  const assessment = assess(preview, deploymentKeys)
  return (
    <div className="space-y-2 rounded border border-violet-200 p-2 text-xs" data-testid="setup-assessment">
      <p className="font-medium">Account assessment, over every Deployment of this setup</p>
      {!assessment.finishable ? (
        <p className="text-amber-800" data-testid="setup-assessment-held">
          This preview is held, so it is not a whole answer and Finish waits for a computed one. Nothing below is said per
          Deployment for a held account, whatever it was computed with before it was held.
        </p>
      ) : null}
      {assessment.accounts.map((account) => (
        <div key={account.accountId} className="space-y-1" data-testid={`setup-assessment-${account.accountId}`}>
          <p>
            Account {account.accountId}: {account.assessed && account.counts
              ? `${account.counts.members} member(s), each counted once however many Deployments reach it`
              : `not assessed -- ${heldSentence(account.heldReason)}`}
            {account.inventory.generation !== null ? ` · on inventory generation ${account.inventory.generation}` : ""}
          </p>
          {account.limits.length ? (
            <ul className="text-amber-800" data-testid={`setup-assessment-limits-${account.accountId}`}>
              {account.limits.map((limit) => <li key={limit}>Not assessed: {limit}</li>)}
            </ul>
          ) : null}
          {account.explanation ? (
            <DeploymentExplanationCards explanation={account.explanation} testId={`setup-assessment-deployments-${account.accountId}`} />
          ) : (
            <p className="text-slate-600" data-testid={`setup-assessment-withheld-${account.accountId}`}>
              {assessmentWithheldSentence(account.withheld ?? "PREVIEW_WITHOUT_CONTEXT")}
            </p>
          )}
        </div>
      ))}
      {assessment.unlisted ? (
        <p className="text-amber-800">{assessment.unlisted} row(s) are in no list, so they are not assessed here.</p>
      ) : null}
      <p className="text-slate-500">
        A resource not listed here is not shown to be unused or outside the system: only what the preview computed is said.
      </p>
    </div>
  )
}

function Review({ local, view, setup, dirty, status, statusProblem, preview, needsPreview, onPreviewAgain, readPreview, context }: {
  local: Local
  view: DeclarationsView
  setup: SetupView
  dirty: boolean
  status: SetupStatus | null
  statusProblem: string | null
  preview: PreviewRead | null
  needsPreview: boolean
  onPreviewAgain: () => void
  readPreview: PreviewFetcher
  context: string
}) {
  // Finish commits the SAVED revision. What is staged on screen is shown apart, and Finish waits until it is saved.
  const loaded = loadIntent(setup.intent)
  if (loaded.kind !== "ok") return null
  const saved = loaded.local
  // (S1b) The single-shape builder's checks are the single shape's; a plural intent is checked by the backend at Finish, by step.
  const built = saved.deployments ? { ok: true as const } : buildDeclaration({
    roots: saved.roots,
    system: { mode: "new", displayName: saved.displayName, criticality: saved.criticality || null },
    deployment: { mode: "new", deploymentKey: saved.deploymentKey, environment: saved.environment, environmentRaw: saved.environmentRaw },
    ...(saved.bindings.length ? { stacks: saved.bindings.map((binding) => ({ binding, label: binding.stack_id })) } : {}),
    ...(saved.decisions.length ? { decisions: saved.decisions.map((decision) => ({ decision, label: decision.resource_uid })) } : {}),
  }, view)
  const deployments = (l: Local) => (l.deployments
    ? `${l.deployments.length} Deployments (${l.deployments.map((d) => `${d.deploymentKey || "(no key)"}: ${d.environment || "(no environment)"}`).join(", ")})`
    : `${l.deploymentKey || "(no deployment)"} · ${l.environment || "(no environment)"}`)
  const line = (l: Local) => `${l.displayName || "(no name)"} · ${l.criticality || "(no criticality)"} · ${deployments(l)}`
    + ` · ${l.bindings.length} stack(s) · ${l.roots.length} root(s)`
    + ` · ${l.decisions.length} decision(s) · ${Object.keys(l.dispositions).length} choice(s)`
  return (
    <div className="space-y-2 text-sm" data-testid="setup-review">
      <p>Saved revision {setup.intent_revision}: {line(saved)}</p>
      {setup.status === "DRAFT" && setup.mode === "create" ? (
        <PreviewPanel key={`${context}|${setup.setup_id}|${setup.state_version}`} read={preview} setupId={setup.setup_id}
          stateVersion={setup.state_version} readPreview={readPreview} onPreviewAgain={onPreviewAgain} context={context}
          deploymentKeys={intentDeploymentKeys(setup.intent)}
          terraformRows={(setup.intent.dispositions ?? []).filter(isTerraform)} />
      ) : null}
      {needsPreview ? (
        <p className="text-xs text-slate-600" data-testid="setup-review-preview-rule">
          This setup binds a stack: Finish names the computed preview above, and is refused by name if what it would make the
          system has changed since.
        </p>
      ) : null}
      {dirty ? (
        <p className="text-amber-800" data-testid="setup-review-unsaved">
          Unsaved changes on screen: {line(local)}. Save them before finishing -- Finish commits the saved revision above.
        </p>
      ) : null}
      {!built.ok ? <ul className="text-xs text-amber-800">{built.problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
      <ul className="text-xs text-slate-600">
        {setup.dispositions_derived.map((d) => (
          <li key={rowKey(d)}>{rowLabel(d)}: {derivedSentence(d)}
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

function Progress({ setup, status, statusProblem, context, readApplied, readResult }: {
  setup: SetupView
  status: SetupStatus | null
  statusProblem: string | null
  /** (S1A-R7-PAIR-03) The verified person, account and setup: the applied-result subtree is keyed to it. */
  context: string
  readApplied?: (accountId: string) => Promise<{ status: number; body: unknown }>
  readResult?: (accountId: string, systemKey: string) => Promise<{ status: number; body: unknown }>
}) {
  if (setup.status !== "FINISHED" || !setup.receipt) return <p className="text-sm text-slate-500">Not finished yet.</p>
  const association = setup.receipt.association
  const systemId = associatedSystemId(association)
  const pin = setup.receipt.preview
  return (
    <div className="space-y-2 text-sm" data-testid="setup-progress">
      <p>Setup finished · saved as revision {association.completed_revision}
        {status?.association ? ` · association ${status.association.state.toLowerCase()}` : ""}</p>
      {pin ? (
        <p className="text-xs text-slate-600" data-testid="setup-progress-proposed">
          Proposed at Finish (preview {pin.preview_digest.slice(0, 15)}…): {pin.counts.members} member(s), {pin.counts.dependencies}{" "}
          dependenc{pin.counts.dependencies === 1 ? "y" : "ies"}, {pin.counts.held} held, {pin.counts.not_members} not a member --
          what the reviewed preview proposed, not what is applied now.
        </p>
      ) : null}
      {/* (S1a R7) the accounts of THIS Finish's result: the Deployment as the receipt pinned it -- never this screen's account */}
      {setup.result_scope?.state === "SERVED" && systemId ? (
        <FinishResult key={`${context}|${setup.setup_id}|${setup.receipt.attempt}|${association.completed_revision}`}
          systemKey={systemId} completedRevision={association.completed_revision} accountIds={setup.result_scope.accounts}
          {...(isPluralIntent(setup.intent) ? { pinned: pinnedDeployments(setup) } : {})}
          {...(readApplied ? { readApplied } : {})} {...(readResult ? { readResult } : {})} />
      ) : (
        <p className="text-xs text-amber-800" data-testid="setup-progress-scope-unavailable">
          The accounts of this result cannot be named ({setup.result_scope?.state === "UNAVAILABLE" ? setup.result_scope.reason
            : systemId ? "NO_RESULT_SCOPE" : "NO_SYSTEM"}); nothing is shown as applied.
        </p>
      )}
      <ul className="text-xs text-slate-600">
        {setup.dispositions_derived.map((d) => (
          <li key={rowKey(d)}>{rowLabel(d)}: {derivedSentence(d)}
            <div className="text-slate-500" data-testid="setup-required-facts">{requiredFactsSentence(d, setup.requirement_profile)}</div>
          </li>
        ))}
      </ul>
      <Requests requests={status?.operations ?? []} testId="setup-progress-requests" title="Requested from an account administrator:" />
      {statusProblem ? <p className="text-xs text-amber-800">{statusProblem}</p> : null}
    </div>
  )
}
