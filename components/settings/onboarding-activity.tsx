"use client"

import { useCallback, useEffect, useState } from "react"
import { Activity, Loader2, RefreshCw } from "lucide-react"
import { listBindings, listOperations, type Binding, type Operation } from "@/lib/account-onboarding"
import { OperationCard, StatusPill, operationLabel } from "@/components/settings/onboarding-operation-card"
import { errorText, useTrackedOperation } from "@/components/settings/use-tracked-operation"

/** Recent onboarding operations and access bindings for the verified operator's customer. */
export function OnboardingActivity({ customerId, canRead, canSubmit, refreshKey }: { customerId: string; canRead: boolean; canSubmit: boolean; refreshKey: number }) {
  const [operations, setOperations] = useState<Operation[]>([])
  const [bindings, setBindings] = useState<Binding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const tracked = useTrackedOperation()

  const load = useCallback(async () => {
    if (!canRead) return
    setLoading(true)
    setError(null)
    try {
      const [ops, found] = await Promise.all([listOperations(customerId), listBindings(customerId)])
      setOperations(ops.filter((op) => !op.parent_operation_id))
      setBindings(found)
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setLoading(false)
    }
  }, [customerId, canRead])

  useEffect(() => {
    void load()
  }, [load, refreshKey, tracked.operation?.status])

  if (!canRead) return null
  const current = tracked.operation && tracked.operation.operation_id === selected ? tracked.operation : null

  return (
    <div data-testid="onboarding-activity" className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-teal-700" />
          <h2 className="text-sm font-semibold">Onboarding activity</h2>
          <span className="text-xs text-slate-500">{bindings.length} access binding{bindings.length === 1 ? "" : "s"}</span>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Refresh onboarding activity">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {error ? <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {loading && !operations.length ? (
        <div className="flex h-24 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading onboarding activity</div>
      ) : operations.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">No onboarding operations yet.</p>
      ) : (
        <ul>
          {operations.slice(0, 20).map((operation) => (
            <li key={operation.operation_id} data-activity-operation={operation.operation_id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{operationLabel(operation)}</span>
                <span className="font-mono text-xs text-slate-500">{operation.account_id}</span>
                <StatusPill operation={operation} />
                <span className="ml-auto text-xs text-slate-400">{new Date(operation.updated_at).toLocaleString()}</span>
                <button type="button" onClick={() => { setSelected(operation.operation_id); void tracked.follow(operation) }} className="text-xs font-semibold text-teal-700">Details</button>
              </div>
              {operation.failure ? <p className="mt-1 text-xs text-slate-600">{operation.failure.message}</p> : null}
              {selected === operation.operation_id && current ? (
                <div className="mt-3">
                  <OperationCard operation={current} events={tracked.events} canSubmit={canSubmit} busy={tracked.busy} onCancel={(op) => void tracked.cancel(op)} onRetry={(op) => { setSelected(null); void tracked.retry(op).then(() => void load()) }} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {tracked.error ? <p role="alert" className="px-4 py-3 text-sm text-red-700">{tracked.error}</p> : null}
    </div>
  )
}
