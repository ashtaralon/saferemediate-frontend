"use client"

import { useState } from "react"
import { Shield, Globe, ChevronLeft, ChevronRight } from "lucide-react"
import { MaterializedScopeBadge } from "@/components/attack-paths-v2/materialized-scope-badge"
import { ServiceTypeBadge, getServiceMeta } from "@/lib/service-type"
import { SeverityBadge } from "./severity-badge"
import type { CrownJewelSummary } from "./types"

interface CrownJewelListPanelProps {
  jewels: CrownJewelSummary[]
  selectedJewelId: string | null
  onSelect: (id: string) => void
  /** Notify parent so the aside can shrink when the list collapses. */
  onCollapsedChange?: (collapsed: boolean) => void
}

/** Crown-jewel names carry a trailing `-<12-digit account id>`; strip it for a
 *  cleaner rail (full name stays in the title attr). Type icon + color now come
 *  from the canonical `@/lib/service-type` badge — the old per-panel
 *  getJewelTypeMeta / JewelServiceIcon maps were retired (2026-07-13). */
function jewelDisplayName(name: string): string {
  return name.replace(/-\d{12}$/, "")
}

export function CrownJewelListPanel({
  jewels,
  selectedJewelId,
  onSelect,
  onCollapsedChange,
}: CrownJewelListPanelProps) {
  // Collapsible per user feedback ("the page is cut off, 50% of the screen is menu").
  // Operators select a jewel once then drill into paths; the list doesn't need
  // to stay wide while they read the surface card / attack graph.
  const [collapsed, setCollapsed] = useState(false)

  const setCollapsedAndNotify = (next: boolean) => {
    setCollapsed(next)
    onCollapsedChange?.(next)
  }

  if (collapsed) {
    return (
      <div className="w-9 min-w-[36px] flex flex-col items-center pt-3">
        <button
          onClick={() => setCollapsedAndNotify(false)}
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
    <div className="w-full min-w-0 bg-card/95">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700/80 dark:text-amber-400/90">
            Crown Jewels
          </div>
          <div className="text-xs text-foreground mt-0.5 whitespace-nowrap">
            <span className="font-semibold tabular-nums text-amber-800 dark:text-amber-300">
              {jewels?.length ?? 0}
            </span>{" "}
            critical assets
          </div>
        </div>
        <button
          onClick={() => setCollapsedAndNotify(true)}
          className="p-1 rounded hover:bg-accent transition-colors shrink-0"
          title="Collapse to give the attack graph more room"
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="p-2 space-y-1.5">
        {(jewels ?? []).map((jewel) => {
          const isSelected =
            jewel.id === selectedJewelId ||
            (selectedJewelId != null &&
              jewel.canonical_id != null &&
              jewel.canonical_id === selectedJewelId)
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
          const svc = getServiceMeta(jewel.type)

          return (
            <button
              key={jewel.id}
              onClick={() => onSelect(jewel.id)}
              className="group w-full text-left rounded-lg px-2.5 py-2.5 transition-all hover:bg-muted/40"
              style={{
                background: isSelected ? "var(--muted)" : "transparent",
                border: `1px solid ${isSelected ? "var(--border)" : "transparent"}`,
                boxShadow: isSelected ? "inset 3px 0 0 var(--primary)" : "none",
              }}
            >
              <div className="flex items-start gap-2.5">
                <ServiceTypeBadge type={jewel.type} variant="tile" size={34} />

                <div
                  className="w-9 shrink-0 text-right text-base font-semibold tabular-nums leading-none pt-0.5"
                  style={{ color: sevColor }}
                >
                  {notComputed ? "—" : score}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-xs font-semibold text-foreground" title={jewel.name ?? jewel.id}>
                      {jewel.name ? jewelDisplayName(jewel.name) : jewel.id}
                    </span>
                    {!notComputed && <SeverityBadge severity={sev} size="sm" />}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="text-[13px] font-bold tracking-wide"
                      style={{ color: svc.accent }}
                    >
                      {svc.short}
                    </span>
                    {notComputed && (
                      <span
                        className="text-[10px] text-muted-foreground"
                        title="No materialized attack paths exist for this jewel yet — run the attack-path materializer to compute them."
                      >
                        not computed
                      </span>
                    )}
                    {!notComputed && (() => {
                      const cc = jewel.class_counts
                      const inSystem = cc != null ? (cc.in_system ?? 0) : (jewel.path_count ?? 0)
                      if (inSystem <= 0) return null
                      return (
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {inSystem} path{inSystem > 1 ? "s" : ""}
                        </span>
                      )
                    })()}
                    {!notComputed && (
                      <MaterializedScopeBadge
                        surfaced={jewel.path_count ?? 0}
                        graphTotal={jewel.materialized_path_count}
                      />
                    )}
                    {jewel.is_internet_exposed && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600 dark:text-red-400 font-medium">
                        <Globe className="w-2.5 h-2.5" />
                        exposed
                      </span>
                    )}
                  </div>
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
