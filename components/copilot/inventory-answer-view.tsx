"use client"

import { AlertCircle } from "lucide-react"
import type { InventoryAnswer } from "./inventory-answer"

const NOT_ANSWERED_TEXT = {
  refused: "Cyntro refused this inventory question for the current scope, so no count or list is shown.",
  abstained: "This inventory question is outside Cyntro's certified operations, so no count or list is shown.",
  unavailable: "Cyntro cannot return a trustworthy count or list right now.",
  not_ready: "Cyntro did not return an answer for this inventory question, so no count or list is shown.",
} as const

const GRAPH_UNAVAILABLE_TEXT =
  "Graph data is unavailable, so Cyntro cannot return a trustworthy count or list yet. Please retry after graph connectivity is restored."

export function InventoryAnswerView({ answer }: { answer: InventoryAnswer }) {
  if (answer.kind === "not_answered") {
    const text =
      answer.status === "unavailable" && answer.reasonCode === "GRAPH_UNAVAILABLE"
        ? GRAPH_UNAVAILABLE_TEXT
        : NOT_ANSWERED_TEXT[answer.status]
    return (
      <div
        className="flex items-start gap-2 text-sm text-amber-700"
        data-copilot-inventory-not-answered
        data-status={answer.status}
        data-reason-code={answer.reasonCode ?? ""}
      >
        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div>
          <div>{text}</div>
          <div className="mt-1 font-mono text-xs">{answer.reasonCode ?? "No reason code was returned."}</div>
          {answer.failingAxes.length > 0 && (
            <div className="mt-1 text-xs text-[var(--muted-foreground,#6b7280)]">
              Failing: {answer.failingAxes.join(", ")}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (answer.kind === "unrecognized") {
    return (
      <div className="flex items-start gap-2 text-sm text-amber-700" data-copilot-inventory-unrecognized>
        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div>The inventory service returned an answer this view does not recognize, so no count or list is shown.</div>
      </div>
    )
  }

  if (answer.kind === "count") {
    return (
      <div className="flex items-center gap-4" data-copilot-inventory-count>
        <div className="text-4xl font-bold">{answer.count}</div>
        <div>
          {answer.displayName && <div className="text-sm font-medium">{answer.displayName}</div>}
          {answer.system && (
            <div className="text-xs text-[var(--muted-foreground,#6b7280)]">
              in system <strong>{answer.system}</strong>
            </div>
          )}
        </div>
      </div>
    )
  }

  const filterEntries = Object.entries(answer.filtersApplied)
  return (
    <div data-copilot-inventory-list>
      {filterEntries.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground,#6b7280)]">filters</span>
          {filterEntries.map(([key, value]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#2D51DA]/10 text-[#2D51DA] border border-[#2D51DA]/20"
            >
              <code className="font-mono">{key}</code>=<code className="font-mono">{value}</code>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mb-2 text-xs text-[var(--muted-foreground,#6b7280)]">
        <span>
          {answer.total !== null && answer.total > answer.items.length
            ? `${answer.items.length} of ${answer.total}`
            : answer.items.length}
          {answer.displayName ? ` ${answer.displayName}` : " resources"}
          {answer.system ? ` in ${answer.system}` : ""}
          {answer.hasMore ? " (more available)" : ""}
        </span>
        {answer.sort && <span>sorted by {answer.sort}</span>}
      </div>
      <div className="overflow-auto border rounded-lg" style={{ borderColor: "var(--border-subtle, #e5e7eb)" }}>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-[var(--muted-foreground,#6b7280)]">
            <tr>
              {answer.columns.map((column) => (
                <th key={column} className="text-left px-3 py-2 font-semibold">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {answer.items.slice(0, 25).map((item, index) => (
              <tr key={String(item._element_id ?? index)} className="border-t" style={{ borderColor: "var(--border-subtle, #e5e7eb)" }}>
                {answer.columns.map((column) => (
                  <td key={column} className="px-3 py-2 font-mono text-xs truncate max-w-xs">
                    {item[column] === undefined || item[column] === null ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      String(item[column])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
