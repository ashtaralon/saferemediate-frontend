"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"
import type { DamageScopePayload } from "./damage-scope-drawer"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  portalContainer?: HTMLElement | null
  lpConfidence: DamageScopePayload["lp_confidence"]
  remediationAction: DamageScopePayload["remediation_action"]
  roleName: string
  onSuccess: () => void
}

function levelBadgeClass(level: string) {
  const l = (level || "").toUpperCase()
  if (l === "HIGH") return "bg-emerald-500/20 text-emerald-200"
  if (l === "MEDIUM") return "bg-amber-500/20 text-amber-200"
  return "bg-slate-500/20 text-slate-300"
}

export function DamageScopeApprovalModal({
  open,
  onOpenChange,
  portalContainer,
  lpConfidence,
  remediationAction,
  roleName,
  onSuccess,
}: Props) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [confirmAuto, setConfirmAuto] = useState(false)

  async function runRemediation(mode: "shadow" | "auto") {
    setBusy(true)
    try {
      const payload = {
        ...remediationAction.payload,
        mode,
        dry_run: mode === "shadow",
      }
      const res = await fetch("/api/proxy/iam-roles/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          (body as { detail?: string }).detail ||
            (body as { error?: string }).error ||
            `Remediation failed (${res.status})`,
        )
      }
      toast({
        title: mode === "shadow" ? "Shadow remediation recorded" : "Remediation submitted",
        description: `Role ${roleName} — check audit trail for outcome.`,
      })
      onSuccess()
    } catch (e) {
      toast({
        title: "Remediation failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setBusy(false)
      setConfirmAuto(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        container={portalContainer}
        className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100"
        data-testid="damage-scope-approval-modal"
      >
        <DialogHeader>
          <DialogTitle>LP remediation approval</DialogTitle>
          <DialogDescription className="text-slate-400">
            Review confidence before applying least-privilege changes to{" "}
            <span className="text-slate-200">{roleName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm" data-testid="lp-confidence-breakdown">
          <div className="flex items-center gap-3">
            <span className="text-slate-400">Score</span>
            <span className="font-mono text-lg" data-testid="lp-confidence-score">
              {(lpConfidence.score * 100).toFixed(0)}%
            </span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${levelBadgeClass(lpConfidence.level)}`}
              data-testid="lp-confidence-level"
            >
              {lpConfidence.level}
            </span>
          </div>

          {lpConfidence.vetos.length > 0 && (
            <div data-testid="lp-confidence-vetos">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Vetos
              </div>
              <ul className="text-xs text-amber-200/90 list-disc pl-4">
                {lpConfidence.vetos.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            </div>
          )}

          {lpConfidence.evidence_gaps.length > 0 && (
            <div data-testid="lp-confidence-gaps">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Evidence gaps
              </div>
              <ul className="text-xs text-slate-400 list-disc pl-4 max-h-32 overflow-y-auto">
                {lpConfidence.evidence_gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          {!confirmAuto ? (
            <>
              <Button
                variant="secondary"
                className="w-full"
                disabled={busy}
                data-testid="run-shadow-btn"
                onClick={() => runRemediation("shadow")}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run as shadow"}
              </Button>
              <Button
                variant="destructive"
                className="w-full"
                disabled={busy}
                onClick={() => setConfirmAuto(true)}
              >
                Apply now…
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-amber-200/90 text-center">
                This will invoke live IAM remediation through the safety gate. Confirm?
              </p>
              <Button
                variant="destructive"
                className="w-full"
                disabled={busy}
                data-testid="apply-now-btn"
                onClick={() => runRemediation("auto")}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, apply now"}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setConfirmAuto(false)}
              >
                Back
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
