"use client"

// PR 2 of the IR cutover chain (task #34). This component no longer
// touches raw IdentityAttackPath — it consumes PathListRow only. The
// parent compiles once via compilePathListRow and passes the rows in.

import type { PathListRow } from "./attack-path-report-types"
import { ImpactSummary } from "./impact-summary"

interface PathComparisonTableProps {
  rows: PathListRow[]
  selectedPathId: string | null
  onSelectPath: (pathId: string) => void
}

export function PathComparisonTable({
  rows,
  selectedPathId,
  onSelectPath,
}: PathComparisonTableProps) {
  if (rows.length < 2) return null

  return (
    <div className="px-4 py-3 border-b border-border bg-card" data-testid="path-comparison-table">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Same crown jewel · different paths · different damage · different fixes
      </p>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-left text-[11px] min-w-[520px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="py-1.5 pr-2 font-medium">Path</th>
              <th className="py-1.5 pr-2 font-medium">Source</th>
              <th className="py-1.5 pr-2 font-medium">Identity</th>
              <th className="py-1.5 pr-2 font-medium">Damage</th>
              <th className="py-1.5 font-medium">Recommended fix</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const selected = row.id === selectedPathId
              return (
                <tr
                  key={row.id}
                  className={`border-b border-border cursor-pointer transition-colors ${
                    selected ? "bg-primary/10" : "hover:bg-accent/50"
                  }`}
                  onClick={() => onSelectPath(row.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onSelectPath(row.id)
                    }
                  }}
                >
                  <td className="py-2 pr-2 text-muted-foreground tabular-nums">#{idx + 1}</td>
                  <td className="py-2 pr-2 font-mono text-foreground truncate max-w-[100px]" title={row.source_label}>
                    {row.source_label}
                  </td>
                  <td className="py-2 pr-2 font-mono text-muted-foreground truncate max-w-[100px]" title={row.identity_label}>
                    {row.identity_label}
                  </td>
                  <td className="py-2 pr-2 text-foreground">
                    <ImpactSummary row={row} compact />
                  </td>
                  <td className="py-2 text-emerald-700 dark:text-emerald-300 truncate max-w-[140px]" title={row.top_fix_label}>
                    {row.top_fix_label}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
