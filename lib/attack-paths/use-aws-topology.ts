"use client"

import { useEffect, useState } from "react"

/** Subset of the topology-aws response we read. */
export interface TopologySubnet {
  id: string
  name: string | null
  cidr: string | null
  is_public: boolean | null
  workloads?: Array<{ id?: string; name?: string }>
}

export interface TopologyAZ {
  az: string
  subnets: TopologySubnet[]
}

export interface TopologyVpc {
  id: string
  name: string | null
  cidr: string | null
  region: string | null
  azs: TopologyAZ[]
  internet_gateways?: Array<{ id?: string; name?: string }>
}

export interface AwsTopology {
  system_name: string
  vpcs: TopologyVpc[]
  /** Set when the snapshot couldn't be retrieved. UI must say so explicitly. */
  error?: string | null
}

/** Fetches GET /api/proxy/topology-aws/<system>. Pure data — no derivation. */
export function useAwsTopology(systemName: string | null): {
  data: AwsTopology | null
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<AwsTopology | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!systemName) {
      setData(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const ctrl = new AbortController()
    const timer = setTimeout(
      () => ctrl.abort(new DOMException("Topology fetch timed out", "TimeoutError")),
      30_000,
    )

    fetch(`/api/proxy/topology-aws/${encodeURIComponent(systemName)}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (cancelled) return
        if (r.ok && body && !body.error) {
          setData(body as AwsTopology)
          setError(null)
        } else {
          setData(body && Array.isArray(body.vpcs) ? (body as AwsTopology) : null)
          setError(body?.error ?? `http_${r.status}`)
        }
      })
      .catch((e) => {
        if (cancelled) return
        setData(null)
        setError(String((e as Error).message ?? e))
      })
      .finally(() => {
        clearTimeout(timer)
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [systemName])

  return { data, loading, error }
}
