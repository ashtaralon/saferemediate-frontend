"use client"

import { useEffect, useState } from "react"
import { Loader2, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  fetchSGStagedState,
  enableSGStaged,
  disableSGStaged,
  type SGStagedState,
} from "@/lib/api-client"

// SG-9h: per-SG STAGED enable toggle. Replaces the legacy
// SHARED_SGS_STAGED_ALLOWLIST env var that Cyntro engineers had to
// edit per customer. Now the operator clicks here, the state writes
// to the customer's Neo4j (cyntro_staged_enabled), and STAGED execute
// gates on it.

export function StagedEnableToggle({
  sgId,
  actor,
  /** Called after every successful enable/disable so the parent
   *  can re-fetch the plan + gate-readiness. */
  onChange,
}: {
  sgId: string
  actor: string
  onChange?: () => void
}) {
  const [state, setState] = useState<SGStagedState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<"enable" | "disable" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSGStagedState(sgId)
      .then((s) => { if (!cancelled) setState(s) })
      .catch((e) => { if (!cancelled) setError(String(e?.message ?? e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sgId, reloadKey])

  const handleEnable = async () => {
    setBusy("enable")
    setError(null)
    try {
      const next = await enableSGStaged(sgId, actor, note)
      setState(next)
      setNote("")
      setReloadKey((k) => k + 1)
      onChange?.()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(null)
    }
  }

  const handleDisable = async () => {
    if (!confirm(`Disable STAGED for ${sgId}? Any pending STAGED plan against this SG will be refused until re-enabled.`)) return
    setBusy("disable")
    setError(null)
    try {
      const next = await disableSGStaged(sgId, actor, note)
      setState(next)
      setNote("")
      setReloadKey((k) => k + 1)
      onChange?.()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <Card className="border-l-4 border-l-zinc-300 dark:border-l-zinc-700">
        <CardContent className="p-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <Loader2 className="w-4 h-4 animate-spin" />
          Reading STAGED-enable state for {sgId}…
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-l-4 border-l-red-500">
        <CardContent className="p-4 text-sm text-red-700 dark:text-red-300">
          Failed to read STAGED-enable state: {error}
        </CardContent>
      </Card>
    )
  }

  const enabled = Boolean(state?.enabled)

  return (
    <Card
      className={
        enabled
          ? "border-l-4 border-l-emerald-500"
          : "border-l-4 border-l-amber-500"
      }
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          {enabled ? (
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-600" />
          )}
          <span
            className={
              enabled
                ? "text-[12px] uppercase tracking-wider font-medium text-emerald-800 dark:text-emerald-200"
                : "text-[12px] uppercase tracking-wider font-medium text-amber-800 dark:text-amber-200"
            }
          >
            STAGED execute · {enabled ? "ENABLED" : "NOT ENABLED"}
          </span>
        </div>

        {enabled && state ? (
          <div className="text-[12px] text-zinc-700 dark:text-zinc-200 space-y-0.5">
            <div>
              ✓ Enabled by{" "}
              <b>{state.enabled_by || "—"}</b>
              {state.enabled_at && (
                <span className="text-zinc-600 dark:text-zinc-300">
                  {" "}· {state.enabled_at}
                </span>
              )}
            </div>
            {state.enabled_note && (
              <div className="text-[11px] text-zinc-600 dark:text-zinc-300 italic">
                &ldquo;{state.enabled_note}&rdquo;
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-2 text-[12px] text-zinc-700 dark:text-zinc-200 leading-relaxed">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
            <span>
              This SG is not opted in for STAGED execute. STAGED swaps a
              consumer&apos;s SG list (mutates Lambda VpcConfig, ENI groups,
              etc.). Enabling is an operator-in-the-loop control —
              after you click, plans against this SG can fire STAGED.
              {state?.disabled_by && (
                <>
                  {" "}Last disabled by <b>{state.disabled_by}</b>
                  {state.disabled_at && <> · {state.disabled_at}</>}.
                </>
              )}
            </span>
          </div>
        )}

        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 space-y-2">
          <Label htmlFor="staged-note" className="text-[11px] uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
            Note (audit trail)
          </Label>
          <Input
            id="staged-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              enabled
                ? "Optional rationale for disabling (e.g. incident response)"
                : "Required: why is this SG being opted in?"
            }
            className="h-8 text-[12px]"
          />
          <div className="flex items-center gap-2">
            {enabled ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDisable}
                disabled={busy !== null}
                className="text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30"
              >
                {busy === "disable" ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <ShieldAlert className="w-3 h-3 mr-1" />
                )}
                Disable STAGED for this SG
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleEnable}
                disabled={busy !== null || !note.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                {busy === "enable" ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3 h-3 mr-1" />
                )}
                Enable STAGED for this SG
              </Button>
            )}
            {!enabled && !note.trim() && (
              <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
                Note required to enable (audit)
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
