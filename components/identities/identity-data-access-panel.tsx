"use client"

import type { ReactNode } from "react"
import { Database, HardDrive, RefreshCw } from "lucide-react"
import {
  INFERRED_FLOW_LOG_CORRELATION,
  readPart,
  type DataStoreAccess,
  type IdentityDataAccessBody,
  type PartStatus,
  type TableAccess,
} from "@/lib/identity-data-access"

// One rendering of an identity's data access, shared by the NHI profile's Data Plane and the
// Identities tab. Every state the answer can be in is shown as itself; see lib/identity-data-access.ts.
//
// No action is offered here. This answer observes access and authorizes nothing: allowed operations are
// deliberately not computed, and the S3 remediation flow neither scopes its own analysis to the account
// nor preflights its apply, so offering it from here would imply an authorization nobody gave.

interface Props {
  loading: boolean
  body: IdentityDataAccessBody | null
}

const MUTED = { color: "var(--text-muted, #94a3b8)" }
const PRIMARY = { color: "var(--text-primary, #334155)" }
const TABLE_OP_COLORS: Record<string, string> = {
  SELECT: "#22c55e", INSERT: "#3b82f6", UPDATE: "#f97316", DELETE: "#ef4444",
  CREATE: "#a855f7", DROP: "#ef4444", ALTER: "#f97316", TRUNCATE: "#ef4444",
}

function list(values: string[]): string {
  return values.join(", ")
}

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "unknown"
}

function Notice({ testId, title, detail }: { testId: string; title: string; detail?: string }) {
  return (
    <div className="text-center py-6" data-testid={testId}>
      <p className="text-sm" style={MUTED}>{title}</p>
      {detail && <p className="text-xs mt-1" style={MUTED}>{detail}</p>}
    </div>
  )
}

function PartNote({ testId, children }: { testId: string; children: ReactNode }) {
  return <p className="text-xs px-1" data-testid={testId} style={{ color: "#b45309" }}>{children}</p>
}

function missing(status: PartStatus): string {
  return status.missingProofs.length > 0 ? `missing ${list(status.missingProofs)} evidence` : "coverage incomplete"
}

function StoreCard({ store }: { store: DataStoreAccess }) {
  return (
    <div className="rounded-lg border overflow-hidden" data-testid="data-access-store" style={{ borderColor: "var(--border, #e2e8f0)" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: "var(--bg-secondary, #f8fafc)" }}>
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4" style={{ color: "#22c55e" }} />
          <span className="text-sm font-medium" style={PRIMARY}>{store.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-primary, #f1f5f9)", ...MUTED }}>{store.type}</span>
          {store.region && <span className="text-[10px]" style={MUTED}>{store.region}</span>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 p-4">
        <div>
          <span className="text-[10px] uppercase tracking-wide" style={MUTED}>Allowed operations</span>
          <div className="flex flex-wrap gap-1 mt-1">
            <span className="text-[10px]" data-testid="data-access-allowed-not-computed" style={MUTED}>
              Not computed ({store.allowedOperationsStatus.reasonCode})
            </span>
          </div>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide" style={MUTED}>Observed</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {store.observedOperations.length > 0 ? (
              store.observedOperations.map((op) => (
                <span key={op} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: "#22c55e15", color: "#16a34a" }}>{op}</span>
              ))
            ) : (
              <span className="text-[10px]" style={MUTED}>None observed</span>
            )}
          </div>
        </div>
      </div>
      {store.observedEvidence.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          {store.observedEvidence.map((e, i) => (
            <p key={i} className="text-[10px]" style={MUTED}>
              {e.actionType}: {list(e.actions)} · {e.hitCount.toLocaleString()} hits · last seen {day(e.lastSeen)}
              {` · from ${list(e.sourceTypes)} (generation ${e.s3AccessGeneration})`}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function TableRows({ rows }: { rows: TableAccess[] }) {
  return (
    <div className="divide-y" style={{ borderColor: "var(--border, #e2e8f0)" }}>
      {rows.map((t, idx) => (
        <div key={idx} className="flex items-center justify-between px-4 py-2.5" data-testid="data-access-table-row">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-medium" style={PRIMARY}>
              {t.schema && t.schema !== "public" ? `${t.schema}.` : ""}{t.tableName}
            </span>
            <span className="text-[10px]" style={MUTED}>({t.database ? `${t.database} on ` : ""}{t.rdsInstance})</span>
            {t.viaDbUser && <span className="text-[10px] px-1 py-0.5 rounded font-mono" style={{ background: "#3b82f610", color: "#3b82f6" }}>via: {t.viaDbUser}</span>}
            {t.linkBasis === INFERRED_FLOW_LOG_CORRELATION && (
              <span className="text-[10px] px-1 py-0.5 rounded" data-testid="data-access-table-inferred" style={{ background: "#f59e0b15", color: "#b45309" }}>
                inferred from flow-log correlation, not observed identity access
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {t.operations.map((op) => (
              <span key={op} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: `${TABLE_OP_COLORS[op] || "#6b7280"}15`, color: TABLE_OP_COLORS[op] || "#6b7280" }}>{op}</span>
            ))}
            {t.accessCount !== null && t.accessCount > 0 && <span className="text-[10px]" style={MUTED}>{t.accessCount.toLocaleString()} calls</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

export function IdentityDataAccessPanel({ loading, body }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="data-access-loading">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#22c55e" }} />
        <span className="ml-2 text-sm" style={{ color: "var(--text-secondary, #64748b)" }}>Loading data access...</span>
      </div>
    )
  }
  const status = body?.answer.status ?? "failed"
  const code = body?.answer.reasonCode ? ` (${body.answer.reasonCode})` : ""
  if (!body || status === "failed") {
    return <Notice testId="data-access-load-error" title={`Data access could not be loaded${code}.`}
      detail="This is not a finding: nothing is known about this identity's data access." />
  }
  if (status === "withheld") {
    return <Notice testId="data-access-withheld" title={`The answer was withheld${code}.`}
      detail="Its scope, identity or provenance could not be verified, so none of it is shown." />
  }
  if (status !== "ready") {
    return <Notice testId="data-access-not-answered" title={`Cyntro did not answer${code}.`}
      detail="This is not a finding: nothing is known about this identity's data access." />
  }

  const stores = readPart(body.dataStoresStatus, body.dataStores.length)
  const tables = readPart(body.tableAccessStatus, body.tableAccess.length)
  const storeServices = list(body.dataStoresStatus.servicesCovered) || "data stores"
  const tableServices = list(body.tableAccessStatus.servicesCovered) || "databases"
  const observed = body.dataStoresStatus.observationWindow

  return (
    <div className="space-y-4">
      {body.freshness && (
        <p className="text-[11px]" data-testid="data-access-provenance" style={MUTED}>
          From the {body.freshness.source}, generation {body.freshness.generation}, last sync {body.freshness.lastSync}
          {" · "}
          {body.freshness.status === "stale" ? (
            <span data-testid="data-access-stale" style={{ color: "#b45309" }}>stale: older than the serving freshness contract</span>
          ) : (
            <span>fresh</span>
          )}
        </p>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4" style={{ color: "#22c55e" }} />
          <span className="text-sm font-medium" style={PRIMARY}>Data stores</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" data-testid="data-access-stores-coverage" style={{ background: "var(--bg-secondary, #f8fafc)", ...MUTED }}>
            {storeServices} only
          </span>
        </div>
        {stores.kind === "rows" && (
          <>
            {stores.partial && (
              <PartNote testId="data-access-stores-partial">
                May be incomplete: {missing(body.dataStoresStatus)}
                {body.dataStoresStatus.truncated ? "; the list was truncated" : ""}.
              </PartNote>
            )}
            {body.dataStores.map((store) => (
              <StoreCard key={store.stableId} store={store} />
            ))}
          </>
        )}
        {stores.kind === "empty" && (
          <Notice testId="data-access-stores-empty" title={`No ${storeServices} data access observed for this identity.`}
            detail={observed ? `Observation window ${day(observed.start)} to ${day(observed.end)}.` : undefined} />
        )}
        {stores.kind === "not_established" && (
          <Notice testId="data-access-stores-not-established" title={`${storeServices} access is not established.`}
            detail={`None was found, but absence cannot be shown: ${missing(body.dataStoresStatus)}.`} />
        )}
        {stores.kind === "not_computed" && (
          <Notice testId="data-access-stores-not-computed"
            title={`${storeServices} access was not computed${body.dataStoresStatus.reasonCode ? ` (${body.dataStoresStatus.reasonCode})` : ""}.`} />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4" style={{ color: "#3b82f6" }} />
          <span className="text-sm font-medium" style={PRIMARY}>Table-level access</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-secondary, #f8fafc)", ...MUTED }}>{tableServices}</span>
        </div>
        {tables.kind === "rows" && (
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border, #e2e8f0)" }}>
            {tables.partial && (
              <div className="px-4 pt-3">
                <PartNote testId="data-access-tables-partial">
                  May be incomplete{body.tableAccessStatus.reasonCode ? ` (${body.tableAccessStatus.reasonCode})` : ""}.
                </PartNote>
              </div>
            )}
            <TableRows rows={body.tableAccess} />
          </div>
        )}
        {/* The table link is inferred, so its absence is never established: no empty table list is a finding. */}
        {(tables.kind === "not_established" || tables.kind === "empty") && (
          <Notice testId="data-access-tables-not-established" title="Table-level access is not established."
            detail={`None was found, but absence cannot be shown: ${missing(body.tableAccessStatus)}.`} />
        )}
        {tables.kind === "not_computed" && (
          <Notice testId="data-access-tables-not-computed"
            title={`Table-level access was not computed${body.tableAccessStatus.reasonCode ? ` (${body.tableAccessStatus.reasonCode})` : ""}.`}
            detail={body.tableAccessStatus.missingProofs.length > 0 ? `Missing ${list(body.tableAccessStatus.missingProofs)}.` : undefined} />
        )}
      </section>
    </div>
  )
}
