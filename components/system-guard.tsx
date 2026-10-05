"use client"

import { useSystem } from "@/lib/system-context"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"
import type { ReactNode } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { BackToDashboard } from "@/components/back-to-dashboard"
import {
  catalogEntryHref,
  selectCatalogSystem,
  usePinnedSystemRequest,
  useScopedSystemCatalogEntries,
  type CatalogEntry,
  type CatalogSelection,
} from "@/lib/scoped-system-catalog"

interface SystemGuardProps {
  children: ReactNode
  /** Optional fallback UI when no system is selected. Defaults to an alert. */
  fallback?: ReactNode
}

function GuardMessage({ title, children, back = true }: { title: string; children: ReactNode; back?: boolean }) {
  return (
    <div className="p-6 space-y-4">
      {back ? <BackToDashboard /> : null}
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{children}</AlertDescription>
      </Alert>
    </div>
  )
}

/**
 * Guard component that only renders children for ONE system of the scoped catalogue.
 *
 * T10 S1: the URL is the carrier of the system's identity -- ``?system=<label>`` plus, for a catalogue row that has one, its
 * ``customer_id``, ``account_id`` and observed ``region``. The guard resolves exactly that tuple against a fresh read of the
 * current scope's catalogue: one row renders the page; a label served by several accounts shows a chooser (never the first
 * row); a row whose identity cannot be trusted, or no row at all, says so. Nothing renders while the catalogue is loading or
 * unavailable. The account and region compared are the ones the URL asked for, PINNED (usePinnedSystemRequest), so an
 * account that was removed -- and healed out of the URL -- is never silently replaced by another account that now carries
 * the label alone.
 */
export function SystemGuard({ children, fallback }: SystemGuardProps) {
  const { systemName, hasSystem } = useSystem()
  const requested = usePinnedSystemRequest()
  const searchParams = useSearchParams()
  const pathname = usePathname() || "/"
  const catalog = useScopedSystemCatalogEntries()

  if (!hasSystem) {
    return fallback ?? (
      <GuardMessage title="No system selected">
        Add <code className="bg-muted px-1 rounded">?system=your-system-name</code> to
        the URL to view data for a specific system, or go to{" "}
        <a href="/systems" className="underline font-medium">Systems</a> to select one.
      </GuardMessage>
    )
  }

  if (catalog.state === "loading") {
    return <div className="p-6 text-sm text-slate-500" role="status">Resolving system…</div>
  }
  if (catalog.state === "unavailable") {
    return (
      <GuardMessage title="Systems catalogue unavailable">
        The systems of this scope could not be read, so <strong>{systemName}</strong> cannot be resolved to one account.{" "}
        <button type="button" onClick={catalog.retry} className="underline font-medium">Retry</button>
      </GuardMessage>
    )
  }

  const selection = selectCatalogSystem(requested, catalog.entries)
  if (selection.kind === "SELECTED") return <>{children}</>
  return (
    <CatalogSelectionNotice
      selection={selection}
      systemName={systemName}
      pathname={pathname}
      keep={searchParams ? new URLSearchParams(searchParams.toString()) : null}
    />
  )
}

/**
 * What a page shows instead of a system when the selection is not ONE row (T10 S1): the chooser for a label several accounts
 * serve -- each IDENTIFIED row linked with its full tuple, a malformed one named but never linked -- or why nothing opened.
 * Shared by the guard and the pages that resolve their own system (dependency map, shared resources).
 */
export function CatalogSelectionNotice({
  selection,
  systemName,
  pathname,
  back = true,
  keep = null,
}: {
  selection: Exclude<CatalogSelection, { kind: "SELECTED" }>
  systemName: string | null
  pathname: string
  back?: boolean
  /** The current page's query: its other parameters (a tab, a mode) are kept on the chooser's links. */
  keep?: URLSearchParams | null
}) {
  if (selection.kind === "AMBIGUOUS") {
    return (
      <GuardMessage title="Choose an account" back={back}>
        <span>
          <strong>{systemName}</strong> is served by {selection.entries.length} accounts in this scope. Choose the one to open:
        </span>
        <ul className="mt-2 space-y-1" aria-label="Accounts serving this system">
          {selection.entries.map((entry, index) => {
            const href = catalogEntryHref(pathname, entry, "system", keep)
            const label = entry.identity
              ? `${entry.identity.account_id} · ${entry.identity.region}`
              : entry.name
            return (
              <li key={`${label}-${index}`}>
                {href && entry.status === "IDENTIFIED" ? (
                  <a href={href} className="underline font-medium">{label}</a>
                ) : (
                  <span title="This row's identity is unavailable, so it cannot be opened on its own">
                    {label} (identity unavailable)
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </GuardMessage>
    )
  }
  if (selection.kind === "IDENTITY_UNAVAILABLE") {
    return (
      <GuardMessage title="System identity unavailable" back={back}>
        <strong>{systemName}</strong> was found, but its account identity could not be verified, so it is not opened.
      </GuardMessage>
    )
  }
  if (selection.kind === "NONE") {
    return (
      <GuardMessage title="No system available" back={back}>
        No system of this scope can be opened on its own. Choose one from{" "}
        <a href="/systems" className="underline font-medium">Systems</a>.
      </GuardMessage>
    )
  }
  return (
    <GuardMessage title="System not found in this scope" back={back}>
      <strong>{systemName}</strong> is not a system of the selected organization, account and region. Go to{" "}
      <a href="/systems" className="underline font-medium">Systems</a> to select one.
    </GuardMessage>
  )
}

/**
 * Inline chooser for a label several accounts serve (T10 S1): one link per IDENTIFIED row, each carrying that row's full
 * tuple to ``path``; a row whose identity cannot be verified is named, never linked. Used where a single link would imply
 * one account -- the dashboard cards.
 */
export function AccountLinks({ name, entries, path, param = "system" }: {
  name: string
  entries: readonly CatalogEntry[]
  path: string
  param?: string
}) {
  return (
    <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500" aria-label={`Accounts serving ${name}`}>
      <span>in {entries.length} accounts:</span>
      {entries.map((entry, index) => {
        const href = entry.status === "IDENTIFIED" ? catalogEntryHref(path, entry, param) : null
        return href ? (
          <a key={index} href={href} className="underline hover:text-blue-700">
            {entry.identity!.account_id} · {entry.identity!.region}
          </a>
        ) : (
          <span key={index} title="This row's identity is unavailable, so it cannot be opened on its own">identity unavailable</span>
        )
      })}
    </span>
  )
}
