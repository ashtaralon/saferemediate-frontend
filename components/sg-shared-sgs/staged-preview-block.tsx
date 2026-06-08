"use client"

import { useState } from "react"
import { Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { fetchSGStagePreview } from "@/lib/api-client"

// SG-9d STAGED preview block. Extracted from rules-diff-tab so it
// can live inline inside the AFTER card's per-scoped-SG sub-cards.

export function StagedPreviewBlock({
  planId,
  groupId,
}: {
  planId: string
  groupId: string
}) {
  const [preview, setPreview] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePreview = async () => {
    setLoading(true)
    setError(null)
    setPreview(null)
    try {
      const r = await fetchSGStagePreview(planId, groupId)
      setPreview(r)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        className="text-[11px] h-7 -ml-2"
        onClick={handlePreview}
        disabled={loading}
        title="STAGED dry-run preview — reads live AWS, no mutation"
      >
        {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
        Preview STAGED
      </Button>

      {error && (
        <div className="text-[11px] text-red-700 dark:text-red-300 p-2 rounded bg-red-50 dark:bg-red-950/30">
          {error}
        </div>
      )}

      {preview && <PreviewContent preview={preview} />}
    </div>
  )
}

function PreviewContent({ preview }: { preview: any }) {
  const summary = preview.summary || {}
  const blockers = preview.overall_blockers || []
  const consumers: any[] = preview.consumers || []
  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-2.5 space-y-2 bg-zinc-50/40 dark:bg-zinc-900/30">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider font-medium text-zinc-700 dark:text-zinc-200">
          STAGED preview
        </span>
        <Badge variant="outline" className="text-[10px]">
          {summary.ratio_label || "—"} swappable
        </Badge>
      </div>
      {blockers.length > 0 && (
        <ul className="text-[11px] space-y-0.5">
          {blockers.map((b: any, i: number) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 text-red-600 shrink-0" />
              <span className="font-mono">{b.code}</span>
              <span className="text-zinc-700 dark:text-zinc-200">{b.message}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1">
        {consumers.slice(0, 5).map((c) => (
          <div
            key={c.consumer_id}
            className="font-mono text-[10px] flex items-center gap-2"
          >
            <span className="truncate">{c.consumer_id}</span>
            {c.actionable ? (
              <span className="text-emerald-700 dark:text-emerald-300">
                {c.sgs_to_remove?.length ? `−${c.sgs_to_remove.join(",")} ` : ""}
                {c.sgs_to_add?.length ? `+${c.sgs_to_add.join(",")}` : ""}
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-300">
                {(c.blockers || []).map((b: any) => b.code).join(" · ")}
              </span>
            )}
          </div>
        ))}
        {consumers.length > 5 && (
          <div className="text-[10px] text-zinc-600 dark:text-zinc-300">
            +{consumers.length - 5} more…
          </div>
        )}
      </div>
    </div>
  )
}
