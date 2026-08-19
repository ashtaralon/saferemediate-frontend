"use client"

/**
 * Attack-path route picker.
 *
 * This surface answers one question only: which service can reach which crown
 * jewel? Evidence, damage and remediation belong to the selected-path story.
 * Missing Initial Access evidence is intentionally not a route category.
 */

import { ArrowRight, Check, Crown, Route } from "lucide-react"
import { useMemo } from "react"
import type {
  CrownJewelSummary,
  IdentityAttackPath,
} from "@/components/identity-attack-paths/types"
import type { ActivePathList } from "@/lib/active-filters"
import { initialAccessCategoryFromBackend } from "@/lib/attack-paths/initial-access-from-backend"
import { getServiceMeta, ServiceTypeBadge } from "@/lib/service-type"
import type { PathListRow } from "./attack-path-report-types"
import { compilePathListRow } from "./compile-path-list-row"
import { MaterializedScopeBadge } from "./materialized-scope-badge"
import { compareReachableDamagePriority } from "./reachable-damage-priority"

interface PathListGroupedProps {
  paths: ActivePathList<IdentityAttackPath>
  jewel: CrownJewelSummary | null
  selectedPathId: string | null
  onSelectPath: (pathId: string) => void
}

function endpointLabel(row: PathListRow, side: "from" | "to"): string {
  if (side === "from") {
    return row.start_label || row.source_label || "Unknown service"
  }
  return row.target_label || "Crown jewel"
}

function Endpoint({
  side,
  name,
  type,
}: {
  side: "from" | "to"
  name: string
  type: string | null
}) {
  const meta = getServiceMeta(type || "Resource")
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <ServiceTypeBadge type={type || "Resource"} variant="tile" size={36} />
      <div className="min-w-0">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {side}
        </div>
        <div
          className="truncate text-[12px] font-semibold text-foreground"
          title={name}
        >
          {name}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {meta.label}
        </div>
      </div>
    </div>
  )
}

export function PathListGrouped({
  paths,
  jewel,
  selectedPathId,
  onSelectPath,
}: PathListGroupedProps) {
  const rows = useMemo<PathListRow[]>(() => {
    return paths
      .map((path) =>
        compilePathListRow(
          path,
          jewel,
          initialAccessCategoryFromBackend(path),
        ),
      )
      .sort(compareReachableDamagePriority)
  }, [paths, jewel])

  if (rows.length === 0) {
    if (jewel?.paths_not_computed) {
      return (
        <div className="px-4 py-6">
          <div className="text-xs text-muted-foreground">
            Paths to{" "}
            <span className="font-mono text-foreground">
              {jewel?.name ?? "this crown jewel"}
            </span>{" "}
            have not been computed yet.
          </div>
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            No materialized path evidence exists in Neptune. Nothing is shown
            until the path materializer produces verified routes.
          </div>
        </div>
      )
    }
    return (
      <div className="px-4 py-6 text-xs text-muted-foreground">
        No attack paths to{" "}
        <span className="font-mono text-foreground">
          {jewel?.name ?? "this crown jewel"}
        </span>{" "}
        today.
      </div>
    )
  }

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Route className="h-3.5 w-3.5 text-primary" />
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Paths
          </div>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {rows.length}
          </span>
        </div>
        <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          Select a route to see current access, potential damage and the safest
          way to reduce it.
        </div>
        <div className="mt-2">
          <MaterializedScopeBadge
            surfaced={rows.length}
            graphTotal={jewel?.materialized_path_count}
          />
        </div>
      </div>

      <div className="space-y-2 p-3" data-testid="zoom0-path-list">
        {rows.map((row, index) => {
          const selected = row.id === selectedPathId
          const targetType = row.target_type || jewel?.type || null
          const isDataJewel = ["s3bucket", "rdsinstance", "dynamodbtable"].includes(
            (targetType || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
          )
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelectPath(row.id)}
              className={`group w-full rounded-xl border px-3 py-3 text-left transition-all ${
                selected
                  ? "border-primary/60 bg-primary/[0.06] shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]"
                  : "border-border bg-background hover:border-primary/30 hover:bg-muted/30"
              }`}
              data-testid="zoom0-path-row"
              data-path-id={row.id}
              aria-pressed={selected}
            >
              <div className="mb-2.5 flex items-center gap-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  Path {index + 1}
                </span>
                {isDataJewel ? (
                  <span className="inline-flex items-center gap-1 text-[9px] text-amber-700 dark:text-amber-300">
                    <Crown className="h-3 w-3" /> Data crown jewel
                  </span>
                ) : null}
                {selected ? (
                  <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-primary">
                    <Check className="h-3 w-3" /> Selected
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <Endpoint
                  side="from"
                  name={endpointLabel(row, "from")}
                  type={row.start_type}
                />
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-muted/50 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
                <Endpoint
                  side="to"
                  name={endpointLabel(row, "to")}
                  type={targetType}
                />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
