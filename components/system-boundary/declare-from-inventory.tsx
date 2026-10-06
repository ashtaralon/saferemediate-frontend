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
 */
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { DeclarationForm } from "@/components/system-boundary/declaration-form"
import { Button } from "@/components/ui/button"
import { rowKey, type InventoryRow, type PublicationIdentity } from "@/lib/account-inventory"
import {
  readView,
  rootFromInventory,
  type CreateEnvelope,
  type DeclarationsView,
  type ReadResult,
  type SaveResult,
} from "@/lib/system-boundary-authoring"
import { samePublication, type InventorySelection, type PickedRoot } from "@/lib/system-boundary-declaration"

export interface DeclareFromInventoryProps {
  accountId: string
  customerId: string | null
  /** The account inventory view, given the selection hook (undefined: browse only, exactly as without this component). */
  renderInventory: (selection: InventorySelection | undefined) => ReactNode
  /** Injectable for tests; default: the authoring proxy. */
  readDeclarations?: () => Promise<ReadResult<DeclarationsView>>
  save?: (envelope: CreateEnvelope) => Promise<SaveResult>
  onEnvelope?: (envelope: CreateEnvelope) => void
}

type ViewState = { kind: "loading" } | ReadResult<DeclarationsView>

export function DeclareFromInventory(props: DeclareFromInventoryProps) {
  return <Declarer key={JSON.stringify([props.customerId, props.accountId])} {...props} />
}

function Declarer({ accountId, renderInventory, readDeclarations = readView, save, onEnvelope }: DeclareFromInventoryProps) {
  const [view, setView] = useState<ViewState>({ kind: "loading" })
  const [picks, setPicks] = useState<ReadonlyMap<string, PickedRoot>>(() => new Map())
  const [shown, setShown] = useState<PublicationIdentity | null>(null)
  const [declaring, setDeclaring] = useState(false)
  const [savedRevision, setSavedRevision] = useState<number | null>(null)

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

  const onToggle = useCallback((row: InventoryRow, publication: PublicationIdentity) => {
    setSavedRevision(null)
    setPicks((current) => {
      const next = new Map(current)
      const key = rowKey(row)
      if (next.has(key)) next.delete(key)
      else next.set(key, { root: rootFromInventory(accountId, row, publication), label: row.name ?? row.native_id,
                           publication: structuredClone(publication) })
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
          </div>
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
              onEnvelope={onEnvelope}
              onCancel={() => setDeclaring(false)}
              onSaved={(revision) => {
                setSavedRevision(revision)
                setPicks(new Map())
                load()
              }}
            />
          ) : null}
        </div>
      ) : null}
      {renderInventory(selection)}
    </div>
  )
}
