export type DependencyDirection = "inbound" | "outbound"

export interface DependencyPeer {
  id?: string | null
  name?: string | null
  arn?: string | null
  type?: string | null
}

export interface DependencyFreshness {
  state?: string | null
  field?: string | null
  value?: string | null
  source?: string | null
}

export interface DependencyRelationship {
  type?: string | null
  port?: number | string | null
  protocol?: string | null
  hit_count?: number | null
  first_seen?: string | null
  last_seen?: string | null
  action?: string | null
  properties?: Record<string, unknown> | null
  plane?: string | null
  evidence_kind?: string | null
  edge_class?: string | null
  source_system?: string | null
  freshness?: DependencyFreshness | null
  is_stale?: boolean | null
}

export interface DependencyConnection {
  source?: DependencyPeer
  target?: DependencyPeer
  relationship?: DependencyRelationship
}

export interface DependencyCoverage {
  returned: number
  relationship_total: number
  neighbor_total: number
  page_size: number
  truncated: boolean
}

export interface DependencyScope {
  account_id?: string | null
  account_match_mode?: string | null
  authority?: string | null
}

export interface ResourceDependenciesResponse {
  success: boolean
  resource_id: string
  connections: {
    inbound: DependencyConnection[]
    outbound: DependencyConnection[]
  }
  inbound_count: number
  outbound_count: number
  scope: DependencyScope
  coverage: {
    inbound: DependencyCoverage
    outbound: DependencyCoverage
  }
  timestamp?: string | null
}

export interface DependencyRow {
  key: string
  direction: DependencyDirection
  role: "Used by" | "Uses"
  peer: DependencyPeer
  relationship: DependencyRelationship
}

function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

export function dependencyRows(
  response: ResourceDependenciesResponse,
  direction: DependencyDirection,
): DependencyRow[] {
  const items = response.connections?.[direction] || []
  return items.flatMap((connection, index) => {
    const peer = direction === "inbound" ? connection.source || {} : connection.target || {}
    const relationship = connection.relationship || {}
    if (isOperationalRelationship(relationship)) return []
    const identity = text(peer.arn) || text(peer.id) || text(peer.name) || `unknown-${index}`
    const relation = text(relationship.type) || "UNKNOWN"
    return [{
      key: `${direction}:${identity}:${relation}:${index}`,
      direction,
      role: direction === "inbound" ? "Used by" : "Uses",
      peer,
      relationship,
    }]
  })
}

export function isOperationalRelationship(relationship: DependencyRelationship): boolean {
  return (
    text(relationship.plane).toUpperCase() === "OPERATIONAL" ||
    text(relationship.edge_class).toLowerCase() === "decision_execution"
  )
}

export function excludedOperationalCount(response: ResourceDependenciesResponse): number {
  return ([
    ...(response.connections?.inbound || []),
    ...(response.connections?.outbound || []),
  ]).filter((connection) => isOperationalRelationship(connection.relationship || {})).length
}

export function dependencyPlaneLabel(plane: unknown): string {
  switch (text(plane).toUpperCase()) {
    case "ALLOWED":
      return "Configured"
    case "OBSERVED":
      return "Observed"
    case "DERIVED":
      return "Derived"
    case "OPERATIONAL":
      return "Operational"
    default:
      return "Unknown"
  }
}

export function dependencyDisplayName(peer: DependencyPeer): string {
  return text(peer.name) || text(peer.id) || text(peer.arn) || "Unresolved resource"
}

export function dependencyRelationshipLabel(value: unknown): string {
  const raw = text(value)
  if (!raw) return "Unknown relationship"
  return raw
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function dependencyFreshnessValue(relationship: DependencyRelationship): string | null {
  return (
    text(relationship.freshness?.value) ||
    text(relationship.last_seen) ||
    text(relationship.first_seen) ||
    null
  )
}

export function dependencyTotal(response: ResourceDependenciesResponse): number {
  return (
    Number(response.coverage?.inbound?.relationship_total || 0) +
    Number(response.coverage?.outbound?.relationship_total || 0)
  )
}

export function dependenciesAreTruncated(response: ResourceDependenciesResponse): boolean {
  return Boolean(response.coverage?.inbound?.truncated || response.coverage?.outbound?.truncated)
}

export function dependencyErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>
    for (const candidate of [record.detail, record.error]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
      if (candidate && typeof candidate === "object") {
        const nested = candidate as Record<string, unknown>
        if (typeof nested.message === "string" && nested.message.trim()) return nested.message.trim()
        if (typeof nested.code === "string" && nested.code.trim()) return nested.code.trim()
      }
    }
  }
  return `Dependencies returned ${status}`
}
