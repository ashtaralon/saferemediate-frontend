"use client"

import { useMemo, useState } from "react"
import type { CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
import {
  CHOKE_TILE_THRESHOLD,
  compileChokePointTiles,
  pathIdsForChokeSelection,
  shouldCollapseToChokeTiles,
  type ChokeTile,
  type ChokeTileKind,
} from "./choke-point-tiles"

const KIND_ORDER: ChokeTileKind[] = [
  "public_entries",
  "identity_chokes",
  "network_chokes",
  "data_plane_gates",
  "crown_jewel",
]

export function ChokePointTilesBar({
  data,
  threshold = CHOKE_TILE_THRESHOLD,
  onFilterPathIds,
}: {
  data: CrownJewelConvergence
  threshold?: number
  /** null = clear filter (all paths). */
  onFilterPathIds?: (pathIds: string[] | null) => void
}) {
  const tiles = useMemo(() => compileChokePointTiles(data), [data])
  const collapsed = shouldCollapseToChokeTiles(data.paths_total || data.paths.length, threshold)
  const [expanded, setExpanded] = useState<ChokeTileKind | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)

  if (!collapsed) return null

  const activeTile: ChokeTile | null = expanded
    ? tiles.find((t) => t.kind === expanded) ?? null
    : null

  const selectTile = (kind: ChokeTileKind) => {
    if (expanded === kind) {
      setExpanded(null)
      setMemberId(null)
      onFilterPathIds?.(null)
      return
    }
    setExpanded(kind)
    setMemberId(null)
    const tile = tiles.find((t) => t.kind === kind) ?? null
    onFilterPathIds?.(pathIdsForChokeSelection(tile, null))
  }

  const selectMember = (id: string) => {
    if (!activeTile) return
    const next = memberId === id ? null : id
    setMemberId(next)
    onFilterPathIds?.(pathIdsForChokeSelection(activeTile, next))
  }

  return (
    <div className="space-y-2" data-testid="choke-point-tiles">
      <p className="px-1 text-[11px] text-muted-foreground">
        {data.paths_total} paths — collapsed to choke-point tiles (threshold {threshold}).
        Expand one group at a time.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {KIND_ORDER.map((kind) => {
          const tile = tiles.find((t) => t.kind === kind)!
          const active = expanded === kind
          return (
            <button
              key={kind}
              type="button"
              data-testid={`choke-tile-${kind}`}
              onClick={() => selectTile(kind)}
              className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                active
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-card hover:bg-accent/40"
              }`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {tile.title}
              </div>
              <div className="text-xl font-semibold tabular-nums text-foreground mt-0.5">
                {tile.count}
              </div>
              <div className="text-[10px] text-muted-foreground truncate mt-0.5" title={tile.subtitle}>
                {tile.subtitle}
              </div>
            </button>
          )
        })}
      </div>

      {activeTile && activeTile.members.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1 pt-1" data-testid="choke-tile-members">
          {activeTile.members.slice(0, 24).map((m) => {
            const on = memberId === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => selectMember(m.id)}
                className={`max-w-[200px] truncate rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                  on
                    ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title={`${m.label} · ${m.count} path${m.count === 1 ? "" : "s"}`}
              >
                {m.label}
                <span className="ml-1 opacity-60">×{m.count}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
