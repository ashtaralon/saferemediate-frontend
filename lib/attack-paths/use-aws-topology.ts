"use client"

import { useEffect, useState } from "react"

/** Subset of the topology-aws response we read. */
export interface TopologyWorkload {
  id?: string
  name?: string
  type?: string | null
  sg_ids?: string[]
}

/** Egress mechanism enum — single source of truth lives in the backend
 *  graph as (s:Subnet)-[:HAS_EGRESS_PATH {class}]->(target). The
 *  topology endpoint exposes it per subnet as `egress_classes`. A subnet
 *  can have multiple egress paths (e.g. IGW_DIRECT + VPC_ENDPOINT_ONLY)
 *  so the field is plural. See backend classifiers/egress_classifier.py. */
export type EgressClass =
  | "NAT_GATEWAY"
  | "NAT_INSTANCE"
  | "EGRESS_FIREWALL"
  | "FORWARD_PROXY"
  | "TRANSIT_GATEWAY_EGRESS"
  | "VPN_OR_DX_EGRESS"
  | "IPV6_EGRESS_ONLY_IGW"
  | "IGW_DIRECT"
  | "VPC_ENDPOINT_ONLY"
  | "NO_EGRESS"
  | "UNKNOWN"

/** Ingress posture enum — backend classifiers/ingress_classifier.py.
 *  PUBLIC_INGRESS requires the full triple (IGW route + public IP +
 *  open SG); IGW route alone stays PRIVATE. */
export type IngressClass = "PUBLIC_INGRESS" | "ELB_FACING" | "PRIVATE" | "UNKNOWN"

export interface TopologySubnet {
  id: string
  name: string | null
  cidr: string | null
  /** @deprecated since 2026-06-20. Kept for one-release compat. Readers
   *  should consume `egress_classes` + `ingress_class` instead — the
   *  bool collapsed 10 egress mechanisms and 4 ingress postures into
   *  one bit and lied about subnets where the route table has an IGW
   *  rule but no actual public ingress (no public IP / no open SG). */
  is_public: boolean | null
  /** AZ id this subnet belongs to. Populated by backend ≥ 2026-06-19;
   *  older responses may leave it null and rely on the wrapping
   *  TopologyAZ.az / .name. */
  az?: string | null
  route_table_id?: string | null
  workloads?: TopologyWorkload[]
  /** Backend currently emits `nacl_id` (singular, first NACL only, may be
   *  null). Plural `nacl_ids` is reserved for a future multi-NACL response.
   *  Readers should accept either. */
  nacl_id?: string | null
  nacl_ids?: string[]
  /** Typed egress mechanisms — one entry per HAS_EGRESS_PATH edge in
   *  the graph. Empty/missing on old backends. Multi-element when the
   *  subnet has multiple egress paths (e.g. ["IGW_DIRECT",
   *  "VPC_ENDPOINT_ONLY"] for a subnet that routes via both). */
  egress_classes?: EgressClass[] | null
  /** Typed ingress posture. Empty/missing on old backends. */
  ingress_class?: IngressClass | null
}

export interface TopologyAZ {
  /** Canonical AZ id (e.g. "eu-west-1a"). Backend ≥ 2026-06-19. */
  az?: string | null
  /** Legacy AZ id field — older backends emitted `name` instead of `az`.
   *  Readers should accept either. */
  name?: string | null
  subnets: TopologySubnet[]
}

export interface TopologyGateway {
  id?: string
  name?: string
  service?: string | null
}

export interface TopologySG {
  id?: string
  name?: string
}

export interface TopologyVpc {
  id: string
  name: string | null
  cidr: string | null
  region: string | null
  azs: TopologyAZ[]
  internet_gateways?: TopologyGateway[]
  vpc_endpoints?: TopologyGateway[]
  security_groups?: TopologySG[]
  nacls?: Array<{ id?: string; name?: string }>
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
