"use client"

import { Globe, Network, AlertTriangle } from "lucide-react"

// SG-9d single rule row used by the Rules-diff tab. Protocol+port as
// a mono badge, source as mono text. Semantic left border:
//   public ingress (0.0.0.0/0) → red
//   high-risk flag             → amber
//   otherwise                  → neutral

export interface SGRule {
  protocol?: string | null
  from_port?: number | null
  to_port?: number | null
  source?: string | null
  source_type?: string | null  // "cidr" | "sg" | etc.
  peer_sg_id?: string | null
  is_public?: boolean | null
  is_high_risk?: boolean | null
  description?: string | null
}

export function RuleRow({ rule }: { rule: SGRule }) {
  const portLabel = formatPort(rule)
  const protocolLabel = formatProtocol(rule.protocol)
  const isPublic = rule.is_public || rule.source === "0.0.0.0/0" || rule.source === "::/0"
  const isHighRisk = rule.is_high_risk
  const isSGRef = rule.source_type === "sg" || rule.peer_sg_id

  const borderTone = isPublic
    ? "border-l-red-500"
    : isHighRisk
    ? "border-l-amber-500"
    : "border-l-zinc-200 dark:border-l-zinc-800"

  return (
    <div
      className={`grid grid-cols-[110px_1fr_auto] gap-2 items-center py-1 px-2 border-l-2 ${borderTone}`}
    >
      <div className="font-mono text-[11px] uppercase">
        <span className="text-muted-foreground">{protocolLabel}</span>{" "}
        <span className="text-foreground">{portLabel}</span>
      </div>
      <div className="font-mono text-[11px] text-foreground/80 truncate">
        {isSGRef ? (
          <span className="inline-flex items-center gap-1">
            <Network className="w-3 h-3 opacity-60" />
            {rule.peer_sg_id || rule.source || "—"}
          </span>
        ) : isPublic ? (
          <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300">
            <Globe className="w-3 h-3" />
            {rule.source}
          </span>
        ) : (
          rule.source || "—"
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[10px]">
        {isPublic && (
          <span className="px-1.5 py-0 rounded-sm bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300 uppercase tracking-wider">
            public
          </span>
        )}
        {isHighRisk && !isPublic && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded-sm bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 uppercase tracking-wider">
            <AlertTriangle className="w-2.5 h-2.5" />
            high-risk
          </span>
        )}
      </div>
    </div>
  )
}

function formatProtocol(p?: string | null): string {
  if (!p || p === "-1") return "ALL"
  return p.toUpperCase()
}

function formatPort(rule: SGRule): string {
  const from = rule.from_port
  const to = rule.to_port
  if (from === null || from === undefined || from === -1) return "ALL"
  if (to === null || to === undefined || to === from) return String(from)
  return `${from}–${to}`
}
