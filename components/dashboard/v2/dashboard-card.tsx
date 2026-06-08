import * as React from "react"
import { cn } from "@/lib/utils"
import { StatusChip } from "./status-chip"

interface DashboardCardProps {
  title: string
  description?: string
  freshness?: string | null
  action?: React.ReactNode
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  className?: string
  contentClassName?: string
  children?: React.ReactNode
}

export function DashboardCard({
  title,
  description,
  freshness,
  action,
  loading,
  error,
  onRetry,
  className,
  contentClassName,
  children,
}: DashboardCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-[14px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {title}
          </div>
          {description ? (
            <div className="mt-1 text-sm text-slate-700">{description}</div>
          ) : null}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {freshness ? <StatusChip tone="neutral">{freshness}</StatusChip> : null}
          {action}
        </div>
      </div>

      <div className={cn("px-5 py-4", contentClassName)}>
        {loading ? (
          <DashboardCardLoading />
        ) : error ? (
          <DashboardCardError message={error} onRetry={onRetry} />
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function DashboardCardLoading() {
  return (
    <div className="flex flex-col gap-3" aria-label="Loading">
      <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
      <div className="h-8 w-1/2 animate-pulse rounded bg-slate-100" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
    </div>
  )
}

function DashboardCardError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <StatusChip tone="red">Evidence unavailable</StatusChip>
      </div>
      <div className="text-sm text-slate-600">{message}</div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 self-start text-sm font-medium text-blue-700 hover:underline"
        >
          Retry
        </button>
      ) : null}
    </div>
  )
}

export function DashboardEmptyState({
  title,
  hint,
}: {
  title: string
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm font-medium text-slate-700">{title}</div>
      {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
}
