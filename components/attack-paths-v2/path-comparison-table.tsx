"use client"

import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { ActivePathList } from "@/lib/active-filters"
import {
  pathDamageSummary,
  pathIdentityLabel,
  pathSourceLabel,
  pathTopFixLabel,
} from "./path-damage-summary"

interface PathComparisonTableProps {
  paths: ActivePathList<IdentityAttackPath>
  selectedPathId: string | null
  onSelectPath: (pathId: string) => void
}

export function PathComparisonTable({
  paths,
  selectedPathId,
  onSelectPath,
}: PathComparisonTableProps) {
  if (paths.length < 2) return null

  return (
    <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30" data-testid="path-comparison-table">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
        Same crown jewel · different paths · different damage · different fixes
      </p>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-left text-[11px] min-w-[520px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-800/60">
              <th className="py-1.5 pr-2 font-medium">Path</th>
              <th className="py-1.5 pr-2 font-medium">Source</th>
              <th className="py-1.5 pr-2 font-medium">Identity</th>
              <th className="py-1.5 pr-2 font-medium">Damage</th>
              <th className="py-1.5 font-medium">Recommended fix</th>
            </tr>
          </thead>
          <tbody>
            {paths.map((p, idx) => {
              const selected = p.id === selectedPathId
              const damage = pathDamageSummary(p)
              const fix = pathTopFixLabel(p)
              return (
                <tr
                  key={p.id}
                  className={`border-b border-slate-800/40 cursor-pointer transition-colors ${
                    selected ? "bg-blue-500/10" : "hover:bg-slate-900/50"
                  }`}
                  onClick={() => onSelectPath(p.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onSelectPath(p.id)
                    }
                  }}
                >
                  <td className="py-2 pr-2 text-slate-400 tabular-nums">#{idx + 1}</td>
                  <td className="py-2 pr-2 font-mono text-slate-300 truncate max-w-[100px]" title={pathSourceLabel(p)}>
                    {pathSourceLabel(p)}
                  </td>
                  <td className="py-2 pr-2 font-mono text-slate-400 truncate max-w-[100px]" title={pathIdentityLabel(p)}>
                    {pathIdentityLabel(p)}
                  </td>
                  <td className="py-2 pr-2 text-slate-200">{damage}</td>
                  <td className="py-2 text-emerald-300/90 truncate max-w-[140px]" title={fix}>
                    {fix}
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
