"use client"

import { useState } from "react"
import { Shield, Globe, ChevronLeft, ChevronRight } from "lucide-react"
import { MaterializedScopeBadge } from "@/components/attack-paths-v2/materialized-scope-badge"
import { SeverityBadge } from "./severity-badge"
import type { CrownJewelSummary } from "./types"

interface CrownJewelListPanelProps {
  jewels: CrownJewelSummary[]
  selectedJewelId: string | null
  onSelect: (id: string) => void
}

function getJewelTypeLabel(type: string | null | undefined): string {
  const t = (type ?? "").toLowerCase()
  if (t.includes("s3")) return "S3 Bucket"
  if (t.includes("rds")) return "RDS Database"
  if (t.includes("dynamo")) return "DynamoDB Table"
  if (t.includes("secret")) return "Secret"
  if (t.includes("kms")) return "KMS Key"
  if (t.includes("lambda")) return "Lambda"
  return type ?? "Resource"
}

export function CrownJewelListPanel({ jewels, selectedJewelId, onSelect }: CrownJewelListPanelProps) {
  // Collapsible per user feedback ("the page is cut off, 50% of the screen is menu").
  // Operators select a jewel once then drill into paths; the list doesn't need
  // to stay 280px wide while they read the surface card / attack graph.
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <div className="w-9 min-w-[36px] border-r border-border bg-card/95 flex flex-col items-center pt-3">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded hover:bg-accent transition-colors"
          title="Expand crown jewel list"
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
        <div className="mt-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground" style={{ writingMode: "vertical-rl" }}>
          {jewels?.length ?? 0} jewels
        </div>
      </div>
    )
  }

  return (
    <div className="w-[280px] min-w-[280px] border-r border-border bg-card/95 overflow-y-auto">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Crown Jewels
          </div>
          <div className="text-xs text-foreground mt-0.5">
            <span className="font-semibold tabular-nums">{jewels?.length ?? 0}</span> critical assets
          </div>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 rounded hover:bg-accent transition-colors"
          title="Collapse to give the attack graph more room"
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="p-2 space-y-1">
        {(jewels ?? []).map((jewel) => {
          const isSelected = jewel.id === selectedJewelId
          // Accuracy-audit F1 (2026-06-11): a jewel with ZERO materialized
          // :AttackPath nodes must not render a severity score or a path
          // count — that data would be synthesized, and the deep layer
          // (closure panel) would have nothing to back it.
          const notComputed = jewel.paths_not_computed === true
          const sev = jewel.severity ?? "LOW"
          const score = Math.round(jewel.highest_risk_score ?? 0)
          const sevColor = notComputed ? "#64748b" :
            sev === "CRITICAL" ? "#ef4444" :
            sev === "HIGH" ? "#f97316" :
            sev === "MEDIUM" ? "#eab308" : "#22c55e"

          return (
            <button
              key={jewel.id}
              onClick={() => onSelect(jewel.id)}
              className="group w-full text-left rounded-md px-2 py-2 transition-all"
              style={{
                background: isSelected ? `${sevColor}14` : "transparent",
                border: `1px solid ${isSelected ? `${sevColor}40` : "transparent"}`,
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-10 shrink-0 text-right text-lg font-semibold tabular-nums leading-none"
                  style={{ color: sevColor }}
                >
                  {notComputed ? "—" : score}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-xs font-medium text-foreground">
                      {jewel.name ?? jewel.id}
                    </span>
                    {!notComputed && <SeverityBadge severity={sev} size="sm" />}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="uppercase tracking-wide">{getJewelTypeLabel(jewel.type)}</span>
                    {notComputed && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span title="No materialized attack paths exist for this jewel yet — run the attack-path materializer to compute them.">
                          not computed
                        </span>
                      </>
                    )}
                    {!notComputed && (() => {
                      // P0.5 — primary count is in_system only when
                      // class_counts is populated; cross-system paths
                      // (platform_access / external_pivot / etc.)
                      // surface in the secondary line below the row.
                      // When class_counts is absent (BE migration
                      // window), fall back to legacy path_count.
                      const cc = jewel.class_counts
                      const inSystem = cc != null ? (cc.in_system ?? 0) : (jewel.path_count ?? 0)
                      if (inSystem <= 0) return null
                      return (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="tabular-nums">
                            {inSystem} path{inSystem > 1 ? "s" : ""}
                          </span>
                        </>
                      )
                    })()}
                    {!notComputed && (
                      <MaterializedScopeBadge
                        surfaced={jewel.path_count ?? 0}
                        graphTotal={jewel.materialized_path_count}
                      />
                    )}
                    {jewel.is_internet_exposed && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="inline-flex items-center gap-0.5 text-red-500 font-medium">
                          <Globe className="w-2.5 h-2.5" />
                          exposed
                        </span>
                      </>
                    )}
                  </div>
                  {/* P0.5 secondary line — cross-system breakdown so
                     the operator sees where the non-in-system paths
                     went after the primary number switched to in_system
                     only (e.g. saferemediate-access-logs had primary
                     14 before, primary 0 now + this line surfaces the
                     14 platform-access paths from cyntroprod). */}
                  {!notComputed && (() => {
                    const cc = jewel.class_counts ?? {}
                    const parts: string[] = []
                    if ((cc.service_linked ?? 0) > 0)  parts.push(`+${cc.service_linked} service-linked (gated)`)
                    if ((cc.platform_access ?? 0) > 0) parts.push(`+${cc.platform_access} platform-access`)
                    if ((cc.external_pivot ?? 0) > 0)  parts.push(`+${cc.external_pivot} external-pivot`)
                    if ((cc.unclassified ?? 0) > 0)    parts.push(`+${cc.unclassified} unclassified`)
                    if (!parts.length) return null
                    return (
                      <div
                        className="text-[9.5px] font-mono text-muted-foreground/70 mt-0.5"
                        title="Paths reaching this jewel from outside its own attack surface. Service-linked = AWS-managed roles (gated by the phantom filter). Platform-access = Cyntro platform infrastructure (expected). External-pivot = sibling-tenant exposure. Unclassified = classifier hasn't run on the source system yet."
                      >
                        {parts.join(" · ")}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </button>
          )
        })}

        {(jewels?.length ?? 0) === 0 && (
          <div className="text-center py-8">
            <Shield className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No crown jewels detected</p>
          </div>
        )}
      </div>
    </div>
  )
}
