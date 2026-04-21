"use client"

import { Shield, Globe } from "lucide-react"
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
  return (
    <div
      className="w-[280px] min-w-[280px] border-r overflow-y-auto"
      style={{ background: "rgba(15, 23, 42, 0.95)", borderColor: "rgba(148, 163, 184, 0.15)" }}
    >
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: "rgba(148, 163, 184, 0.15)" }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Crown Jewels
        </div>
        <div className="text-xs text-slate-200 mt-0.5">
          <span className="font-semibold tabular-nums">{jewels?.length ?? 0}</span> critical assets
        </div>
      </div>

      <div className="p-2 space-y-1">
        {(jewels ?? []).map((jewel) => {
          const isSelected = jewel.id === selectedJewelId
          const sev = jewel.severity ?? "LOW"
          const score = Math.round(jewel.highest_risk_score ?? 0)
          const sevColor =
            sev === "CRITICAL" ? "#ef4444" :
            sev === "HIGH" ? "#f97316" :
            sev === "MEDIUM" ? "#eab308" : "#22c55e"

          return (
            <button
              key={jewel.id}
              onClick={() => onSelect(jewel.id)}
              className="group w-full text-left rounded-md px-2 py-2 transition-all"
              style={{
                background: isSelected
                  ? `linear-gradient(135deg, ${sevColor}18 0%, ${sevColor}08 100%)`
                  : "transparent",
                border: `1px solid ${isSelected ? `${sevColor}40` : "transparent"}`,
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-10 shrink-0 text-right text-lg font-semibold tabular-nums leading-none"
                  style={{ color: sevColor }}
                >
                  {score}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-xs font-medium text-white">
                      {jewel.name ?? jewel.id}
                    </span>
                    <SeverityBadge severity={sev} size="sm" />
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="uppercase tracking-wide">{getJewelTypeLabel(jewel.type)}</span>
                    {(jewel.path_count ?? 0) > 0 && (
                      <>
                        <span className="text-slate-600">·</span>
                        <span className="tabular-nums">
                          {jewel.path_count} path{(jewel.path_count ?? 0) > 1 ? "s" : ""}
                        </span>
                      </>
                    )}
                    {jewel.is_internet_exposed && (
                      <>
                        <span className="text-slate-600">·</span>
                        <span className="inline-flex items-center gap-0.5 text-red-400 font-medium">
                          <Globe className="w-2.5 h-2.5" />
                          exposed
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </button>
          )
        })}

        {(jewels?.length ?? 0) === 0 && (
          <div className="text-center py-8">
            <Shield className="w-6 h-6 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No crown jewels detected</p>
          </div>
        )}
      </div>
    </div>
  )
}
