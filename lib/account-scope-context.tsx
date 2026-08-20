"use client"

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { AccountScopeOptions, ProductScope } from "@/lib/account-scope"
import { resolveCanonicalCustomer, scopeOptionsFromSystems } from "@/lib/account-scope"

interface AccountScopeContextValue extends ProductScope {
  options: AccountScopeOptions | null
  loading: boolean
  error: string | null
  setCustomerId: (value: string) => void
  setGroupId: (value: string) => void
  setAccountId: (value: string) => void
  setRegion: (value: string) => void
  refresh: () => void
}

const AccountScopeContext = createContext<AccountScopeContextValue | null>(null)

const SCOPE_STORAGE_KEY = "cyntro-product-scope"

function storedScope(): Partial<ProductScope> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(window.localStorage.getItem(SCOPE_STORAGE_KEY) || "{}")
  } catch {
    return {}
  }
}

export function AccountScopeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const customerFromUrl = searchParams.get("customer_id")
  const [customerId, setCustomerState] = useState<string | null>(() => customerFromUrl || storedScope().customerId || null)
  const [groupId, setGroupState] = useState(() => searchParams.get("account_group") || storedScope().groupId || "all")
  const [accountId, setAccountState] = useState(() => searchParams.get("account_id") || storedScope().accountId || "all")
  const [region, setRegionState] = useState(() => searchParams.get("region") || storedScope().region || "all")
  const [options, setOptions] = useState<AccountScopeOptions | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const updateParam = (key: string, value: string, dependentKeys: string[] = []) => {
    const next = new URLSearchParams(searchParams.toString())
    if (value === "all" || !value) next.delete(key)
    else next.set(key, value)
    dependentKeys.forEach((dependent) => next.delete(dependent))
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }))
  }

  useEffect(() => {
    if (pathname === "/login") return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const loadSystemFallback = async () => {
          const systemsResponse = await fetch("/api/proxy/systems", { cache: "no-store" })
          if (!systemsResponse.ok) return null
          return scopeOptionsFromSystems(await systemsResponse.json())
        }
        const requested = customerFromUrl || customerId
        let selected = requested
        let fallback: AccountScopeOptions | null = null
        const rosterResponse = await fetch("/api/proxy/admin/customers", { cache: "no-store" })
        const roster = rosterResponse.ok ? await rosterResponse.json() : []
        const rosterIds = Array.isArray(roster)
          ? roster.map((row) => typeof row?.customer_id === "string" ? row.customer_id : "").filter(Boolean)
          : []
        if (!rosterIds.length) fallback = await loadSystemFallback()
        selected = resolveCanonicalCustomer(requested, rosterIds, fallback?.customer_id)
        if (selected && selected !== requested) {
          const next = new URLSearchParams(searchParams.toString())
          next.set("customer_id", selected)
          if (next.has("system")) next.set("system", selected)
          next.delete("account_group")
          next.delete("account_id")
          next.delete("region")
          if (!cancelled) {
            setGroupState("all")
            setAccountState("all")
            setRegionState("all")
            startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }))
          }
        }
        if (!selected) {
          setOptions({ customer_id: "", accounts: [], groups: [] })
          return
        }
        if (!cancelled) setCustomerState(selected)
        const response = await fetch(
          `/api/proxy/admin/accounts/scope/options/all?customer_id=${encodeURIComponent(selected)}`,
          { cache: "no-store" },
        )
        const body = response.ok ? await response.json() : null
        const resolved = body?.accounts?.length ? body : (fallback || await loadSystemFallback())
        if (!resolved) throw new Error(`Account scope is unavailable (${response.status})`)
        if (!cancelled) setOptions(resolved)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [customerFromUrl, pathname, reloadKey]) // customer state is intentionally resolved inside the load

  // The root layout stays mounted during Next.js navigation, so retain the
  // operator's scope even when a legacy link omits query parameters. Rebind it
  // to the destination URL immediately; bookmarked URLs remain authoritative
  // when they provide an explicit value.
  useEffect(() => {
    const explicitGroup = searchParams.get("account_group")
    const explicitAccount = searchParams.get("account_id")
    const explicitRegion = searchParams.get("region")
    if (explicitGroup) setGroupState(explicitGroup)
    if (explicitAccount) setAccountState(explicitAccount)
    if (explicitRegion) setRegionState(explicitRegion)

    const next = new URLSearchParams(searchParams.toString())
    if (customerId && !next.has("customer_id")) next.set("customer_id", customerId)
    if (groupId !== "all" && !next.has("account_group")) next.set("account_group", groupId)
    if (accountId !== "all" && !next.has("account_id")) next.set("account_id", accountId)
    if (region !== "all" && !next.has("region")) next.set("region", region)
    if (next.toString() !== searchParams.toString()) {
      startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }))
    }
  }, [pathname, searchParams.toString()])

  useEffect(() => {
    window.localStorage.setItem(
      SCOPE_STORAGE_KEY,
      JSON.stringify({ customerId, groupId, accountId, region }),
    )
  }, [customerId, groupId, accountId, region])

  const setCustomerId = (value: string) => {
    setCustomerState(value)
    setGroupState("all")
    setAccountState("all")
    setRegionState("all")
    updateParam("customer_id", value, ["account_group", "account_id", "region"])
  }

  return (
    <AccountScopeContext.Provider
      value={{
        customerId,
        groupId,
        accountId,
        region,
        options,
        loading,
        error,
        setCustomerId,
        setGroupId: (value) => {
          setGroupState(value)
          setAccountState("all")
          setRegionState("all")
          updateParam("account_group", value, ["account_id", "region"])
        },
        setAccountId: (value) => {
          setAccountState(value)
          setRegionState("all")
          updateParam("account_id", value, ["region"])
        },
        setRegion: (value) => {
          setRegionState(value)
          updateParam("region", value)
        },
        refresh: () => setReloadKey((value) => value + 1),
      }}
    >
      {children}
    </AccountScopeContext.Provider>
  )
}

export function useAccountScope(): AccountScopeContextValue {
  const context = useContext(AccountScopeContext)
  if (!context) throw new Error("useAccountScope must be used within AccountScopeProvider")
  return context
}
