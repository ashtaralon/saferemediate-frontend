"use client"

/**
 * "Add System" (D2/D4/D17). The one way to add a system is the System Boundary wizard on an account's inventory
 * (declare-from-inventory.tsx); this control only leads there. With one served account in the current scope it opens
 * that account's inventory with the declare flow asked for; with several it lists them to choose from first. It saves
 * nothing and adds no row: a system is listed once its declaration is saved and served.
 *
 * It replaced a dropdown of "Available systems from AWS" that inserted a row with invented Production / criticality
 * defaults and toasted "System Added" before a POST to a route the backend never had.
 */
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronDown, Plus } from "lucide-react"
import { useAccountScope } from "@/lib/account-scope-context"
import { accountOptionText } from "@/lib/account-scope"
import { accountsInScope, declareFlowHref } from "@/lib/system-boundary-entry"

const BUTTON =
  "inline-flex items-center gap-1.5 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-90"

export function AddSystemEntry({ menuAlign = "right" }: { menuAlign?: "right" | "center" }) {
  const scope = useAccountScope()
  const accounts = accountsInScope(scope)
  const [choosing, setChoosing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!choosing) return
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setChoosing(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [choosing])

  if (accounts.length === 0) {
    const reason = scope.loading
      ? "Loading the accounts in scope…"
      : scope.error || !scope.options
        ? "The accounts in scope could not be read, so no account can be opened to declare a system."
        : "No AWS account is in the selected scope. Systems are declared from an account's inventory."
    return (
      <button type="button" disabled title={reason} data-testid="add-system"
        className={`${BUTTON} cursor-not-allowed opacity-50`} style={{ background: "#8b5cf6" }}>
        <Plus className="w-3.5 h-3.5" />
        Add System
      </button>
    )
  }

  if (accounts.length === 1) {
    return (
      <Link href={declareFlowHref(accounts[0].account_id)} data-testid="add-system" className={BUTTON}
        style={{ background: "#8b5cf6" }} title={`Declare a system from ${accountOptionText(accounts[0])}`}>
        <Plus className="w-3.5 h-3.5" />
        Add System
      </Link>
    )
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button type="button" data-testid="add-system" aria-expanded={choosing} onClick={() => setChoosing((open) => !open)}
        className={BUTTON} style={{ background: "#8b5cf6" }}>
        <Plus className="w-3.5 h-3.5" />
        Add System
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${choosing ? "rotate-180" : ""}`} />
      </button>
      {choosing ? (
        <div data-testid="add-system-accounts"
          className={`absolute top-full mt-2 w-80 rounded-lg shadow-xl border z-50 text-left ${
            menuAlign === "center" ? "left-1/2 -translate-x-1/2" : "right-0"}`}
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <p className="p-3 border-b text-xs" style={{ color: "var(--text-muted)", borderColor: "var(--border-subtle)" }}>
            Systems are declared from an account&apos;s inventory. Choose the account:
          </p>
          <ul className="max-h-64 overflow-y-auto">
            {accounts.map((account) => (
              <li key={account.account_id} className="border-b last:border-0" style={{ borderColor: "var(--border-subtle)" }}>
                <Link href={declareFlowHref(account.account_id)} className="block p-3 text-sm hover:bg-white/5"
                  style={{ color: "var(--text-primary)" }}>
                  {accountOptionText(account)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
