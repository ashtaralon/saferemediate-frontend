"use client"

import { AlertOctagon, Shield } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/** One Security Hub read, as the backend counted it (/api/security-hub/findings). */
export interface SecurityHubData {
  total: number
  critical: number
  high: number
  medium: number
  low: number
  byProduct: Record<string, number>
}

/**
 * A Security Hub reading from a 200 answer, or null when the answer carries no
 * count. The backend answers a typed 503 when the hub is not connected
 * (SECURITY_HUB_NOT_CONNECTED) or the read failed (SECURITY_HUB_READ_FAILED);
 * neither -- nor a body without a numeric total -- is "0 findings".
 */
export function parseSecurityHubReading(payload: unknown): SecurityHubData | null {
  const summary = (payload as { summary?: Record<string, any> } | null)?.summary
  if (!summary || typeof summary.total !== "number" || !Number.isFinite(summary.total)) return null
  const bySeverity = summary.by_severity || {}
  // A severity absent from a real read's by_severity had no findings: that 0 is measured.
  return {
    total: summary.total,
    critical: bySeverity.CRITICAL || 0,
    high: bySeverity.HIGH || 0,
    medium: bySeverity.MEDIUM || 0,
    low: bySeverity.LOW || 0,
    byProduct: summary.by_product || {},
  }
}

/** Only a Security Hub reading gets a card: none when the hub is not connected or was not read. */
export function SecurityHubCard({ data }: { data: SecurityHubData | null }) {
  if (!data) return null
  const highlights = Object.entries(data.byProduct).slice(0, 3)

  if (data.total > 0) {
    return (
      <Card className="rounded-[24px] border-[#ef444430] bg-gradient-to-br from-red-50 to-orange-50 shadow-[0_20px_60px_-42px_rgba(239,68,68,0.4)]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-red-900 flex items-center gap-2">
              <AlertOctagon className="h-5 w-5 text-[#ef4444]" />
              Security Hub Findings
            </CardTitle>
            <span className="text-xs bg-red-600 text-white px-2 py-1 rounded-full font-medium">
              {data.total} Active
            </span>
          </div>
          <p className="text-xs text-[#ef4444]">
            AWS Security Hub aggregated findings
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white/70 rounded-xl p-3 text-center border-l-4 border-red-600">
              <div className="text-2xl font-bold text-[#ef4444]">{data.critical}</div>
              <div className="text-xs text-[var(--muted-foreground,#4b5563)]">Critical</div>
            </div>
            <div className="bg-white/70 rounded-xl p-3 text-center border-l-4 border-orange-500">
              <div className="text-2xl font-bold text-orange-500">{data.high}</div>
              <div className="text-xs text-[var(--muted-foreground,#4b5563)]">High</div>
            </div>
            <div className="bg-white/70 rounded-xl p-3 text-center border-l-4 border-amber-500">
              <div className="text-2xl font-bold text-amber-500">{data.medium}</div>
              <div className="text-xs text-[var(--muted-foreground,#4b5563)]">Medium</div>
            </div>
            <div className="bg-white/70 rounded-xl p-3 text-center border-l-4 border-blue-400">
              <div className="text-2xl font-bold text-blue-500">{data.low}</div>
              <div className="text-xs text-[var(--muted-foreground,#4b5563)]">Low</div>
            </div>
          </div>
          {highlights.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {highlights.map(([product, count]) => (
                <span key={product} className="rounded-full bg-white/80 px-3 py-1 text-xs text-[var(--foreground,#374151)]">
                  {product}: {count}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-[24px] border-[#dbeafe] bg-gradient-to-br from-sky-50 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Shield className="h-5 w-5 text-[#2D51DA]" />
          Security Hub Status
        </CardTitle>
        <p className="text-sm text-[var(--muted-foreground,#6b7280)]">
          No Security Hub findings are currently being surfaced into the dashboard.
        </p>
      </CardHeader>
      <CardContent>
        <div className="rounded-2xl border border-[#dbeafe] bg-white p-4">
          <div className="text-sm font-medium text-slate-900">Hub ingestion looks quiet</div>
          <p className="mt-1 text-xs text-[var(--muted-foreground,#6b7280)]">
            Once findings arrive, this card will highlight the active products and severities here.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
