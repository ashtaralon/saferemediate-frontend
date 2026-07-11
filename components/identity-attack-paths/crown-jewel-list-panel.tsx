"use client"

import { useState } from "react"
import {
  Shield,
  Globe,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  Database,
  KeyRound,
  Key,
  Zap,
  Box,
  type LucideIcon,
} from "lucide-react"
import { MaterializedScopeBadge } from "@/components/attack-paths-v2/materialized-scope-badge"
import { awsIconUrl } from "@/components/topology-v0-2/aws-architecture-icons"
import { SeverityBadge } from "./severity-badge"
import type { CrownJewelSummary } from "./types"

interface CrownJewelListPanelProps {
  jewels: CrownJewelSummary[]
  selectedJewelId: string | null
  onSelect: (id: string) => void
  /** Notify parent so the aside can shrink when the list collapses. */
  onCollapsedChange?: (collapsed: boolean) => void
}

type JewelTypeMeta = {
  label: string
  short: string
  Icon: LucideIcon
  /** Tailwind text/bg/border for the type chip — AWS-ish, not purple. */
  chip: string
  iconTint: string
  awsType: string
}

function getJewelTypeMeta(type: string | null | undefined): JewelTypeMeta {
  const t = (type ?? "").toLowerCase()
  if (t.includes("s3")) {
    return {
      label: "S3 Bucket",
      short: "S3",
      Icon: HardDrive,
      chip: "bg-emerald-500/15 text-emerald-800 border-emerald-500/35 dark:text-emerald-300",
      iconTint: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      awsType: "S3Bucket",
    }
  }
  if (t.includes("dynamo")) {
    return {
      label: "DynamoDB",
      short: "DDB",
      Icon: Database,
      chip: "bg-sky-500/15 text-sky-800 border-sky-500/35 dark:text-sky-300",
      iconTint: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
      awsType: "DynamoDBTable",
    }
  }
  if (t.includes("rds") || t.includes("aurora") || t.includes("redshift")) {
    return {
      label: "RDS Database",
      short: "RDS",
      Icon: Database,
      chip: "bg-blue-500/15 text-blue-800 border-blue-500/35 dark:text-blue-300",
      iconTint: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
      awsType: "RDSInstance",
    }
  }
  if (t.includes("secret")) {
    return {
      label: "Secret",
      short: "Secret",
      Icon: KeyRound,
      chip: "bg-amber-500/15 text-amber-900 border-amber-500/35 dark:text-amber-300",
      iconTint: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
      awsType: "SecretsManagerSecret",
    }
  }
  if (t.includes("kms")) {
    return {
      label: "KMS Key",
      short: "KMS",
      Icon: Key,
      chip: "bg-rose-500/15 text-rose-800 border-rose-500/35 dark:text-rose-300",
      iconTint: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
      awsType: "KMSKey",
    }
  }
  if (t.includes("lambda")) {
    return {
      label: "Lambda",
      short: "Lambda",
      Icon: Zap,
      chip: "bg-orange-500/15 text-orange-900 border-orange-500/35 dark:text-orange-300",
      iconTint: "bg-orange-500/15 text-orange-800 dark:text-orange-300",
      awsType: "Lambda",
    }
  }
  return {
    label: type ?? "Resource",
    short: type ?? "Resource",
    Icon: Box,
    chip: "bg-slate-500/15 text-slate-800 border-slate-500/30 dark:text-slate-300",
    iconTint: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    awsType: type ?? "Resource",
  }
}

function JewelServiceIcon({ type }: { type: string | null | undefined }) {
  const meta = getJewelTypeMeta(type)
  const url = awsIconUrl(meta.awsType)
  const { Icon } = meta
  const [imgFailed, setImgFailed] = useState(false)
  const showImg = Boolean(url) && !imgFailed
  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${meta.iconTint}`}
      title={meta.label}
      aria-hidden
    >
      {showImg ? (
        // Official AWS architecture icon (CDN). Lucide fallback on error.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url!}
          alt=""
          width={16}
          height={16}
          className="h-4 w-4 object-contain"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
    </span>
  )
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
          const typeMeta = getJewelTypeMeta(jewel.type)

          return (
            <button
              key={jewel.id}
              onClick={() => onSelect(jewel.id)}
              className="group w-full text-left rounded-lg px-2.5 py-2.5 transition-all"
              style={{
                background: isSelected ? `${sevColor}18` : "transparent",
                border: `1px solid ${isSelected ? `${sevColor}45` : "transparent"}`,
              }}
            >
              <div className="flex items-start gap-2.5">
                <JewelServiceIcon type={jewel.type} />

                <div
                  className="w-9 shrink-0 text-right text-base font-semibold tabular-nums leading-none pt-0.5"
                  style={{ color: sevColor }}
                >
                  {notComputed ? "—" : score}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-xs font-semibold text-foreground">
                      {jewel.name ?? jewel.id}
                    </span>
                    {!notComputed && <SeverityBadge severity={sev} size="sm" />}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${typeMeta.chip}`}
                    >
                      <typeMeta.Icon className="h-2.5 w-2.5" />
                      {typeMeta.short}
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
