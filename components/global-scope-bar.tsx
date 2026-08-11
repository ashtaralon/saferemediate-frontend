"use client"

import { Building2, Cloud, Globe2, Layers3, Loader2 } from "lucide-react"
import { usePathname } from "next/navigation"
import { useAccountScope } from "@/lib/account-scope-context"

function ScopeSelect({
  label,
  value,
  onChange,
  children,
  icon: Icon,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  icon: typeof Cloud
  disabled?: boolean
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 border-r border-slate-200 px-4 last:border-r-0">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-52 bg-transparent text-xs font-semibold text-slate-700 outline-none disabled:text-slate-400"
      >
        {children}
      </select>
    </label>
  )
}

export function GlobalScopeBar() {
  const pathname = usePathname()
  const scope = useAccountScope()
  if (pathname === "/login" || pathname.startsWith("/design/")) return null

  const selectedAccount = scope.options?.accounts.find(
    (account) => account.account_id === scope.accountId,
  )
  const accountOptions = scope.groupId === "all"
    ? scope.options?.accounts || []
    : (scope.options?.accounts || []).filter((account) => account.group_ids.includes(scope.groupId))
  const regionOptions = selectedAccount?.regions || Array.from(
    new Set(accountOptions.flatMap((account) => account.regions)),
  ).sort()

  return (
    <div className="sticky top-0 z-[60] flex h-11 items-center border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="flex h-full items-center px-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        Scope
      </div>
      <ScopeSelect
        label="Organization"
        icon={Building2}
        value={scope.customerId || ""}
        onChange={scope.setCustomerId}
        disabled={!scope.customerId}
      >
        <option value={scope.customerId || ""}>{scope.customerId || "Not configured"}</option>
      </ScopeSelect>
      <ScopeSelect label="Group" icon={Layers3} value={scope.groupId} onChange={scope.setGroupId}>
        <option value="all">All account groups</option>
        {(scope.options?.groups || []).map((group) => (
          <option key={group.group_id} value={group.group_id}>{group.name}</option>
        ))}
      </ScopeSelect>
      <ScopeSelect label="Account" icon={Cloud} value={scope.accountId} onChange={scope.setAccountId}>
        <option value="all">All accounts</option>
        {accountOptions.map((account) => (
          <option key={account.account_id} value={account.account_id}>
            {account.display_name} · {account.account_id}
          </option>
        ))}
      </ScopeSelect>
      <ScopeSelect label="Region" icon={Globe2} value={scope.region} onChange={scope.setRegion}>
        <option value="all">All regions</option>
        {regionOptions.map((value) => <option key={value} value={value}>{value}</option>)}
      </ScopeSelect>
      <div className="ml-auto flex items-center gap-2 px-4 text-xs text-slate-500">
        {scope.loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {scope.error ? <span className="text-amber-700">Scope metadata unavailable</span> : null}
        {!scope.loading && !scope.error ? (
          <span>{accountOptions.length} accounts in view</span>
        ) : null}
      </div>
    </div>
  )
}
