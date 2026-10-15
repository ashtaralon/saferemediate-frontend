"use client"

/**
 * One account's inventory with system declaration (Phase 2 T17). The inventory view is not this component's: the caller
 * renders it through ``renderInventory``, passing on the ``selection`` hook given here (undefined: browse only). When this
 * person can read the authored declarations and saving is active on this installation, rows the inventory marks
 * selectable can be picked as roots and declared as a System (declaration-form.tsx); otherwise nothing is added.
 *
 * Picks belong to THIS account (a new account mounts a fresh picker), are keyed by the producer's row identity, and keep
 * the publication of the page each was read from. A pick from an earlier publication than the one on screen is shown
 * as such, never silently kept as current: the backend's resolver judges every root again when it is saved.
 *
 * T18: each envelope is kept in the browser (lib/system-boundary-pending.ts) just before its first send, under the
 * verified person (the subject /authoring-grants/self names) and this account, until its outcome is definite; the
 * person's unresolved saves are reconciled by request id when this account's page opens (pending-saves.tsx). Without
 * a verified subject nothing is kept: the save still works, only its resume is unavailable.
 *
 * A7 rev 4: where the capability read says the stack wizard may write here (lib/system-boundary-capability.ts), the toolbar
 * also offers "Bind CloudFormation stacks" (stack-binding-wizard.tsx); otherwise it says why, and nothing else changes.
 *
 * D2/D4/D17: Systems' "Add System" opens this page with the declare flow asked for (lib/system-boundary-entry.ts,
 * ``?declare=1`` -> ``openDeclareFlow``). Only where this component's own checks pass is anything offered: where saving is
 * active, the flag leads to the guided eight-step setup ("Set up a system", guided-setups.tsx), which takes the focus, and
 * the toolbar says that binding stacks and declaring from picks remain there as explicit actions. (SW-96) The flag opens
 * no wizard by itself: it used to open the stack wizard on load, so Add System landed on the legacy "Bind CloudFormation
 * stacks" instead of the guided setup. Starting a setup is a write, so it waits for the person's click. Otherwise the same
 * reason as without the flag is said -- and where the declarations could not be read at all (browse only, otherwise
 * silent), the flag gets that reason in words.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { DeclarationForm } from "@/components/system-boundary/declaration-form"
import { DeclaredSystems } from "@/components/system-boundary/declared-systems"
import { GuidedSetups, type GuidedSetupsProps } from "@/components/system-boundary/guided-setups"
import { PendingSaves } from "@/components/system-boundary/pending-saves"
import { StackBindingWizard } from "@/components/system-boundary/stack-binding-wizard"
import { Button } from "@/components/ui/button"
import { rowKey, type InventoryRow, type InventorySelection, type PublicationIdentity } from "@/lib/account-inventory"
import { BASIC_SOURCE_IDENTITY } from "@/lib/account-resources"
import {
  readOwnGrant,
  readView,
  rootFromBasic,
  rootFromInventory,
  type CorrectionEnvelope,
  type CreateEnvelope,
  type DeclarationsView,
  type OwnGrant,
  type ReadResult,
  type SaveResult,
} from "@/lib/system-boundary-authoring"
import {
  capabilitySentence,
  fetchCapability,
  parseCapabilityResponse,
  pluralCreateOffered,
  type ParsedCapability,
} from "@/lib/system-boundary-capability"
import { pendingStore, type PendingStore } from "@/lib/system-boundary-pending"
import { samePublication, type PickedRoot } from "@/lib/system-boundary-declaration"

export interface DeclareFromInventoryProps {
  accountId: string
  customerId: string | null
  /** The account inventory view, given the selection hook (undefined: browse only, exactly as without this component). */
  renderInventory: (selection: InventorySelection | undefined) => ReactNode
  /** Injectable for tests; default: the authoring proxy. */
  readDeclarations?: () => Promise<ReadResult<DeclarationsView>>
  readGrant?: () => Promise<ReadResult<OwnGrant>>
  save?: (envelope: CreateEnvelope) => Promise<SaveResult>
  onEnvelope?: (envelope: CreateEnvelope) => void
  /** Injectable for tests; default: this browser's localStorage. Created once per picker. */
  store?: PendingStore
  /** Injectable for tests; default: the authoring proxy's capability read (A7 rev 4). */
  readCapability?: () => Promise<{ status: number; body: unknown }>
  /** The page was opened to declare a system (Systems > Add System): open the declare flow where its checks pass. */
  openDeclareFlow?: boolean
  /** (Onboarding G2) Injectable for tests; default: the authoring proxy's setup routes and the census stack read. */
  guided?: Pick<GuidedSetupsProps, "listSetups" | "createSetup" | "readStacks" | "client">
}

type ViewState = { kind: "loading" } | ReadResult<DeclarationsView>

export function DeclareFromInventory(props: DeclareFromInventoryProps) {
  return <Declarer key={JSON.stringify([props.customerId, props.accountId])} {...props} />
}

function Declarer({ accountId, renderInventory, readDeclarations = readView, readGrant = readOwnGrant, save, onEnvelope,
                    store: injected, readCapability = fetchCapability, openDeclareFlow = false, guided }: DeclareFromInventoryProps) {
  const [view, setView] = useState<ViewState>({ kind: "loading" })
  const [store] = useState<PendingStore>(() => injected ?? pendingStore())
  const [actor, setActor] = useState<string | null>(null)
  const [picks, setPicks] = useState<ReadonlyMap<string, PickedRoot>>(() => new Map())
  const [shown, setShown] = useState<PublicationIdentity | null>(null)
  const [declaring, setDeclaring] = useState(false)
  const [savedRevision, setSavedRevision] = useState<number | null>(null)
  const [capability, setCapability] = useState<ParsedCapability | null>(null)
  const [binding, setBinding] = useState(false)

  const load = useCallback(() => {
    let live = true
    void readDeclarations().then((result) => {
      if (live) setView(result)
    })
    return () => {
      live = false
    }
  }, [readDeclarations])
  useEffect(load, [load])
  useEffect(() => {
    let live = true
    void readGrant().then((result) => {
      if (live && result.kind === "OK") setActor(result.value.subject)
    })
    return () => {
      live = false
    }
  }, [readGrant])
  useEffect(() => {
    let live = true
    void readCapability().then(({ status, body }) => {
      if (live) setCapability(parseCapabilityResponse(status, body))
    })
    return () => {
      live = false
    }
  }, [readCapability])

  const keep = useCallback((envelope: CreateEnvelope) => {
    if (actor) store.put({ version: 1, actor, accountId, kind: "CREATE", envelope, startedAt: new Date().toISOString() })
    onEnvelope?.(envelope)
  }, [actor, accountId, store, onEnvelope])
  const keepCorrection = useCallback((envelope: CorrectionEnvelope) => {
    if (actor) store.put({ version: 1, actor, accountId, kind: "CORRECT", envelope, startedAt: new Date().toISOString() })
  }, [actor, accountId, store])
  const settled = useCallback((envelope: CreateEnvelope | CorrectionEnvelope, outcome: { kind: string }) => {
    if (outcome.kind !== "resend") store.remove(envelope.request_id)        // definite: saved, or nothing saved
  }, [store])

  const onToggle = useCallback((row: InventoryRow, publication: PublicationIdentity) => {
    setSavedRevision(null)
    setPicks((current) => {
      const next = new Map(current)
      const key = rowKey(row)
      if (next.has(key)) next.delete(key)
      // (Wizard on discovery) a basic row's pick carries the canonical root the backend named and the run it was listed in.
      else next.set(key, { root: row.basic_root && publication.source_identity === BASIC_SOURCE_IDENTITY
                             ? rootFromBasic(accountId, row.basic_root, publication)
                             : rootFromInventory(accountId, row, publication),
                           label: row.name ?? row.native_id, publication: structuredClone(publication) })
      return next
    })
  }, [accountId])

  const active = view.kind === "OK" && view.value.protocol_phase === "ACTIVE" && view.value.completed_revision !== null
  const earlier = shown === null ? [] : [...picks.keys()].filter((key) => !samePublication(picks.get(key)!.publication, shown))
  const selection: InventorySelection | undefined = active
    ? { selected: new Map([...picks].map(([key, pick]) => [key, pick.publication])), onToggle, onPublication: setShown }
    : undefined

  return (
    <div>
      {openDeclareFlow && (view.kind === "REFUSED" || view.kind === "UNAVAILABLE") ? (
        <p className="px-6 pt-4 text-xs text-slate-500" data-testid="declare-flow-unavailable">
          {declarationsUnreadable(view)}
        </p>
      ) : null}
      {view.kind === "OK" && !active ? (
        <p className="px-6 pt-4 text-xs text-slate-500" role="status">
          Declaring systems from this inventory is not enabled on this installation yet.
        </p>
      ) : null}
      {active ? (
        <div className="space-y-2 px-6 pt-4" data-testid="declare-toolbar">
          <div className="flex items-center gap-3 text-sm">
            <span>{picks.size} picked as roots</span>
            <Button type="button" size="sm" disabled={picks.size === 0 || declaring} onClick={() => setDeclaring(true)}>
              Declare a system
            </Button>
            {picks.size ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setPicks(new Map())}>Clear picks</Button>
            ) : null}
            {capability?.kind === "enabled" ? (
              <Button type="button" size="sm" variant="outline" disabled={binding} onClick={() => setBinding(true)}>
                Bind CloudFormation stacks
              </Button>
            ) : null}
          </div>
          {view.kind === "OK" ? (
            <GuidedSetups accountId={accountId} view={view.value} picks={[...picks.values()]} actor={actor}
              open={openDeclareFlow} pluralOffered={capability !== null && pluralCreateOffered(capability)} {...guided} />
          ) : null}
          {openDeclareFlow ? (
            <p className="text-xs text-slate-600" data-testid="declare-flow-guide">
              {capability?.kind === "enabled"
                ? "To add a system, choose Set up a system above. You can also bind its CloudFormation stacks, or pick its root resources in the inventory below and choose Declare a system."
                : "To add a system, choose Set up a system above. You can also pick its root resources in the inventory below, then choose Declare a system."}
            </p>
          ) : null}
          {capability !== null && capability.kind !== "enabled" && capabilitySentence(capability) ? (
            <p className="text-xs text-slate-500" data-testid="wizard-capability">{capabilitySentence(capability)}</p>
          ) : null}
          {binding && view.kind === "OK" ? (
            <StackBindingWizard accountId={accountId} view={view.value} onClose={() => setBinding(false)}
              onEnvelope={keep} onOutcome={settled} save={save}
              onSaved={(revision) => {
                setSavedRevision(revision)
                load()
              }} />
          ) : null}
          {earlier.length ? (
            <p className="text-xs text-amber-800" role="status">
              {earlier.length} {earlier.length === 1 ? "pick was" : "picks were"} made in an earlier publication of this inventory;
              {earlier.length === 1 ? " it" : " they"} will be checked again when you save.{" "}
              <button type="button" className="underline" onClick={() => setPicks((current) => {
                const next = new Map(current)
                for (const key of earlier) next.delete(key)
                return next
              })}>Clear earlier picks</button>
            </p>
          ) : null}
          {actor ? <PendingSaves accountId={accountId} actor={actor} store={store} /> : null}
          {savedRevision !== null ? (
            <p className="text-sm text-teal-800" role="status">
              Saved as revision {savedRevision}. Cyntro is preparing this system&apos;s membership; nothing is applied yet.
            </p>
          ) : null}
          {declaring && view.kind === "OK" ? (
            <DeclarationForm
              view={view.value}
              roots={[...picks.values()]}
              save={save}
              onEnvelope={keep}
              onOutcome={settled}
              onCancel={() => setDeclaring(false)}
              onSaved={(revision) => {
                setSavedRevision(revision)
                setPicks(new Map())
                load()
              }}
            />
          ) : null}
          {view.kind === "OK" ? (
            <DeclaredSystems view={view.value} accountId={accountId} picks={[...picks.values()]} onEnvelope={keepCorrection}
              onOutcome={settled} onSaved={(revision, usedPicks) => {
                setSavedRevision(revision)
                if (usedPicks) setPicks(new Map())
                load()
              }} />
          ) : null}
        </div>
      ) : null}
      {renderInventory(selection)}
    </div>
  )
}

/** Why a system cannot be declared here when the authored declarations could not be read (said only when asked to declare). */
function declarationsUnreadable(view: Exclude<ReadResult<DeclarationsView>, { kind: "OK" }>): string {
  if (view.kind === "REFUSED" && view.status === 401) return "Sign in again to declare a system from this account."
  if (view.kind === "REFUSED" && view.status === 403) {
    return `You are not authorized to declare systems on this installation (${view.code}).`
  }
  return `Systems cannot be declared here right now: the system declarations could not be read (${view.code}).`
}
