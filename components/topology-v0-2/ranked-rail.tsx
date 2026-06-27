"use client"

import type { RankedEntry } from "./headline-narrative"

interface Props {
  entries: RankedEntry[]
  selectedId: string | null
  onSelectWorkload: (nodeId: string) => void
  onSelectRole: (roleName: string) => void
  filtersSlot?: React.ReactNode
}

const LAYER_STYLE: Record<RankedEntry["layer"], { bg: string; fg: string }> = {
  Network: { bg: "rgba(46, 115, 184, 0.12)", fg: "#2E73B8" },
  IAM: { bg: "rgba(221, 52, 76, 0.12)", fg: "#DD344C" },
  Stale: { bg: "rgba(245, 166, 35, 0.15)", fg: "#92400E" },
}

export function RankedRail({
  entries,
  selectedId,
  onSelectWorkload,
  onSelectRole,
  filtersSlot,
}: Props) {
  return (
    <aside
      className="rounded-lg flex flex-col min-h-0"
      style={{ background: "white", border: "1px solid #DDE3E8", color: "#1A2330" }}
    >
      <div className="px-4 pt-4 pb-2 border-b shrink-0" style={{ borderColor: "#E2E8F0" }}>
        <h2
          className="text-[11px] uppercase tracking-[0.16em] font-bold"
          style={{ color: "#1A2330" }}
        >
          Next worst
        </h2>
        {filtersSlot ? <div className="mt-3">{filtersSlot}</div> : null}
      </div>
      <ol className="flex-1 overflow-y-auto m-0 p-0 list-none">
        {entries.length === 0 ? (
          <li className="px-4 py-6 text-[12px] italic" style={{ color: "#5A6B7A" }}>
            No ranked workloads or IAM gaps in scope.
          </li>
        ) : (
          entries.map(entry => {
            const selected = selectedId === entry.id
            const layer = LAYER_STYLE[entry.layer]
            return (
              <li key={entry.id} className="border-b" style={{ borderColor: "#EEF2F6" }}>
                <button
                  type="button"
                  onClick={() =>
                    entry.kind === "iam_role"
                      ? onSelectRole(entry.name)
                      : onSelectWorkload(entry.id)
                  }
                  className="w-full text-left px-4 py-3 transition-colors hover:bg-[#F9FAFB]"
                  style={{
                    background: selected ? "#F0FDFA" : undefined,
                    borderLeft: selected ? "3px solid #00C2A8" : "3px solid transparent",
                  }}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="text-[10px] font-bold shrink-0 mt-0.5"
                      style={{ color: "#5A6B7A", width: "1.25rem" }}
                    >
                      {entry.rank < 900 ? `#${entry.rank}` : "·"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-semibold truncate" style={{ color: "#1A2330" }}>
                          {entry.name}
                        </span>
                        <span
                          className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: layer.bg, color: layer.fg }}
                        >
                          {entry.layer}
                        </span>
                      </div>
                      <div className="text-[11px] mt-1 leading-snug" style={{ color: "#5A6B7A" }}>
                        {entry.reason}
                      </div>
                      <div className="text-[10px] mt-1 font-mono" style={{ color: "#94A3B8" }}>
                        {entry.meta}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            )
          })
        )}
      </ol>
    </aside>
  )
}
