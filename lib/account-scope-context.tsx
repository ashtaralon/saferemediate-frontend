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
import {
  normalizeCustomerRoster,
  resolveCustomerId,
  type AccountScopeOptions,
  type CustomerScopeOption,
  type ProductScope,
} from "@/lib/account-scope"

interface AccountScopeContextValue extends ProductScope {
  options: AccountScopeOptions | null
  customers: CustomerScopeOption[]
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
  const [customers, setCustomers] = useState<CustomerScopeOption[]>([])
  const [loading, setLoading] = useState(pathname !== "/login")
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
        const rosterResponse = await fetch("/api/proxy/admin/customers", { cache: "no-store" })
        if (!rosterResponse.ok) throw new Error(`Organization roster is unavailable (${rosterResponse.status})`)
        const roster = normalizeCustomerRoster(await rosterResponse.json())
        if (!cancelled) setCustomers(roster)

        const requested = customerFromUrl || customerId
        const selected = resolveCustomerId(requested, roster)
        if (!selected) {
          if (!cancelled) {
            setCustomerState(null)
            setOptions({ customer_id: "", accounts: [], groups: [] })
          }
          return
        }

        if (!cancelled && selected !== requested) {
          setCustomerState(selected)
          setGroupState("all")
          setAccountState("all")
          setRegionState("all")
          const next = new URLSearchParams(searchParams.toString())
          next.set("customer_id", selected)
          next.delete("account_group")
          next.delete("account_id")
          next.delete("region")
          startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }))
        } else if (!cancelled) {
          setCustomerState(selected)
        }
        const response = await fetch(
          `/api/proxy/admin/accounts/scope/options/all?customer_id=${encodeURIComponent(selected)}`,
          { cache: "no-store" },
        )
        if (!response.ok) throw new Error(`Account scope is unavailable (${response.status})`)
        const body = await response.json()
        if (!cancelled) setOptions(body)
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
        customers,
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
