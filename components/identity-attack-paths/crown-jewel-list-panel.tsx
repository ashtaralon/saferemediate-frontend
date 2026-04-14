"use client"

import { Database, HardDrive, Key, Shield, Globe } from "lucide-react"
import { SeverityBadge } from "./severity-badge"
import type { CrownJewelSummary } from "./types"

interface CrownJewelListPanelProps {
  jewels: CrownJewelSummary[]
  selectedJewelId: string | null
  onSelect: (id: string) => void
}

function getJewelIcon(type: string | null | undefined) {
  const t = (type ?? "").toLowerCase()
  if (t.includes("s3")) return <HardDrive className="w-4 h-4" />
  if (t.includes("rds") || t.includes("dynamo") || t.includes("database")) return <Database className="w-4 h-4" />
  if (t.includes("secret") || t.includes("kms")) return <Key className="w-4 h-4" />
  if (t.includes("iam")) return <Shield className="w-4 h-4" />
  return <Database className="w-4 h-4" />
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
  return (
    <div
      className="w-[280px] min-w-[280px] border-r overflow-y-auto"
      style={{ background: "rgba(15, 23, 42, 0.95)", borderColor: "rgba(148, 163, 184, 0.15)" }}
    >
      <div className="p-4 border-b" style={{ borderColor: "rgba(148, 163, 184, 0.15)" }}>
        <h3 className="text-sm font-semibold text-white">Crown Jewels</h3>
        <p className="text-xs text-slate-400 mt-1">{jewels?.length ?? 0} critical assets found</p>
      </div>

      <div className="p-2 space-y-1">
        {(jewels ?? []).map((jewel) => {
          const isSelected = jewel.id === selectedJewelId
          const sev = jewel.severity ?? "LOW"
          const sevColor =
            sev === "CRITICAL" ? "#ef4444" :
            sev === "HIGH" ? "#f97316" :
            sev === "MEDIUM" ? "#eab308" : "#22c55e"

          return (
            <button
              key={jewel.id}
              onClick={() => onSelect(jewel.id)}
              className="w-full text-left rounded-lg p-3 transition-all"
              style={{
                background: isSelected
                  ? `linear-gradient(135deg, ${sevColor}15 0%, ${sevColor}08 100%)`
                  : "transparent",
                border: `1px solid ${isSelected ? `${sevColor}40` : "transparent"}`,
              }}
            >
              <div className="flex items-start gap-2">
                <div
                  className="mt-0.5 p-1.5 rounded"
                  style={{ background: `${sevColor}20`, color: sevColor }}
                >
                  {getJewelIcon(jewel.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{jewel.name ?? jewel.id}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                    {getJewelTypeLabel(jewel.type)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <SeverityBadge severity={jewel.severity ?? "LOW"} size="sm" />
                    {(jewel.path_count ?? 0) > 0 && (
                      <span className="text-[10px] text-slate-400">
                        {jewel.path_count ?? 0} path{(jewel.path_count ?? 0) > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {jewel.is_internet_exposed && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <Globe className="w-3 h-3 text-red-400" />
                      <span className="text-[10px] text-red-400 font-medium">Internet Exposed</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Risk score bar */}
              <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "rgba(148, 163, 184, 0.1)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(jewel.highest_risk_score ?? 0, 100)}%`,
                    background: sevColor,
                    opacity: 0.7,
                  }}
                />
              </div>
            </button>
          )
        })}

        {(jewels?.length ?? 0) === 0 && (
          <div className="text-center py-8">
            <Shield className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No crown jewels detected</p>
          </div>
        )}
      </div>
    </div>
  )
}
