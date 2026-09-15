"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react"
import { OnboardingApiError, readOperatorState, signOutOperator, type OperatorState } from "@/lib/account-onboarding"

export function useOperatorState(customerId: string | null) {
  const [state, setState] = useState<OperatorState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setState(await readOperatorState(customerId))
    } catch (reason) {
      setState(null)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { state, loading, error, refresh }
}

const REFUSALS: Record<string, string> = {
  OPERATOR_SESSION_REVOKED: "This session was signed out. Sign in again.",
  OPERATOR_IDENTITY_INVALID: "Your sign-in could not be verified. Sign in again.",
  OPERATOR_NOT_AUTHORIZED: "You are signed in, but your identity provider groups do not map to this customer.",
  TENANT_SCOPE_MISMATCH: "This installation serves a different customer than the one selected.",
  OPERATOR_ISSUER_NOT_TRUSTED: "Your identity provider is not configured for account administration.",
}

export function OperatorSignInPanel({
  state,
  loading,
  error,
  onChanged,
}: {
  state: OperatorState | null
  loading: boolean
  error: string | null
  onChanged: () => void
}) {
  const [signingOut, setSigningOut] = useState(false)
  const [signOutNote, setSignOutNote] = useState<{ tone: "ok" | "warn"; text: string; endSessionUrl: string | null } | null>(null)
  const returnTo = "/api/auth/operator/start?returnTo=%2Fsettings%2Faccounts"

  async function signOut() {
    setSigningOut(true)
    try {
      const result = await signOutOperator()
      setSignOutNote(result.revocation === "NOT_RECORDED"
        ? { tone: "warn", text: "Signed out of this browser, but the sign-out could not be recorded for other devices. That session stays valid elsewhere until it expires.", endSessionUrl: result.end_session_url }
        : { tone: "ok", text: "Signed out of Cyntro on every device.", endSessionUrl: result.end_session_url })
    } catch (reason) {
      setSignOutNote({ tone: "warn", text: reason instanceof OnboardingApiError ? reason.message : "Sign-out failed. Try again.", endSessionUrl: null })
    } finally {
      setSigningOut(false)
      onChanged()
    }
  }

  if (loading) {
    return (
      <div data-testid="operator-panel" data-operator-state="loading" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking your sign-in
      </div>
    )
  }

  const operator = state?.operator
  const note = signOutNote ? (
    <div role="status" className={`mt-3 rounded-lg p-3 text-xs ${signOutNote.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
      {signOutNote.text}
      {signOutNote.endSessionUrl ? <> <a className="font-semibold underline" href={signOutNote.endSessionUrl}>Also sign out of your identity provider</a></> : null}
    </div>
  ) : null

  if (state?.verified === "VERIFIED" && operator) {
    const readOnly = !operator.permissions.submit
    return (
      <div data-testid="operator-panel" data-operator-state={readOnly ? "read-only" : "operator"} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-teal-700"><ShieldCheck className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{operator.display_name || operator.email || "Signed-in operator"}</p>
            <p className="truncate text-xs text-slate-500">
              {operator.email ? `${operator.email} · ` : ""}{operator.roles.length ? operator.roles.join(", ") : "No Cyntro role"} · customer {operator.tenant_id}
              {operator.tenant_wide ? "" : ` · accounts ${operator.account_scope.join(", ")}`}
            </p>
          </div>
          {state.mode === "HOSTED_OIDC" ? (
            <button type="button" onClick={() => void signOut()} disabled={signingOut} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              {signingOut ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />} Sign out
            </button>
          ) : (
            <span className="text-xs text-slate-500">Signed in through your organization&apos;s load balancer</span>
          )}
        </div>
        {!operator.permissions.read ? (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Your identity provider groups do not grant a Cyntro role. Ask an administrator to map your group before managing accounts.</p>
        ) : readOnly ? (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Read-only: your role can view onboarding status but cannot add accounts, retry or cancel.</p>
        ) : null}
        {note}
      </div>
    )
  }

  const hosted = state?.mode !== "CUSTOMER_IDP_ALB"
  const unavailable = state?.verified === "UNAVAILABLE" || (!state && error)
  const refusal = state?.verified === "REFUSED" ? REFUSALS[state.reason || ""] || "Your sign-in was refused for account administration." : null
  return (
    <div data-testid="operator-panel" data-operator-state={unavailable ? "unavailable" : refusal ? "refused" : "signed-out"} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">{unavailable || refusal ? <AlertTriangle className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {unavailable ? "Sign-in could not be verified right now" : refusal ? "Sign-in refused" : "Sign in to manage AWS accounts"}
          </p>
          <p className="text-xs text-slate-500">
            {unavailable
              ? "Account changes stay disabled until your identity is verified. Nothing was changed."
              : refusal
                ? refusal
                : hosted
                  ? state?.configured === false
                    ? "Operator sign-in is not configured for this deployment. The shared console password does not identify an operator."
                    : "Adding accounts records who made each change, so it needs your organization's identity provider, not the shared console password."
                  : "Your load balancer did not provide a signed-in identity for this request. Reload the page to sign in again."}
          </p>
        </div>
        {hosted && state?.configured !== false ? (
          <a href={returnTo} className="inline-flex items-center gap-1.5 rounded-lg bg-[#008f7d] px-3 py-2 text-xs font-semibold text-white hover:bg-[#007c6d]">
            <KeyRound className="h-3 w-3" /> Sign in
          </a>
        ) : null}
      </div>
      {note}
    </div>
  )
}
