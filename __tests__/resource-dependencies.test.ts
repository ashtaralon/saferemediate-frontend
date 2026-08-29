import { describe, expect, it } from "vitest"
import {
  dependenciesAreTruncated,
  dependencyDisplayName,
  dependencyErrorMessage,
  excludedOperationalCount,
  dependencyFreshnessValue,
  dependencyPlaneLabel,
  dependencyRelationshipLabel,
  dependencyRows,
  dependencyTotal,
  type ResourceDependenciesResponse,
} from "@/lib/resource-dependencies"

function response(): ResourceDependenciesResponse {
  return {
    success: true,
    resource_id: "sg-1",
    connections: {
      inbound: [
        {
          source: { id: "i-consumer", name: "payments", type: "EC2Instance" },
          relationship: {
            type: "SECURED_BY",
            plane: "ALLOWED",
            evidence_kind: "CONFIG_PROVEN",
            source_system: "security_group_collector",
            freshness: { state: "TIMESTAMP_AVAILABLE", value: "2026-08-29T10:00:00Z" },
          },
        },
      ],
      outbound: [
        {
          target: { arn: "arn:aws:rds:eu-west-1:111111111111:db:orders", type: "RDSInstance" },
          relationship: {
            type: "ACTUAL_TRAFFIC",
            plane: "OBSERVED",
            last_seen: "2026-08-29T11:00:00Z",
          },
        },
      ],
    },
    inbound_count: 1,
    outbound_count: 1,
    scope: {
      account_id: "111111111111",
      account_match_mode: "EXACT",
      authority: "SERVER_DEPLOYMENT_CONFIG",
    },
    coverage: {
      inbound: { returned: 1, relationship_total: 1, neighbor_total: 1, page_size: 100, truncated: false },
      outbound: { returned: 1, relationship_total: 192, neighbor_total: 170, page_size: 100, truncated: true },
    },
  }
}

describe("All Services dependency contract", () => {
  it("keeps inbound consumers and outbound providers directionally distinct", () => {
    const payload = response()
    const inbound = dependencyRows(payload, "inbound")
    const outbound = dependencyRows(payload, "outbound")

    expect(inbound).toHaveLength(1)
    expect(inbound[0].role).toBe("Used by")
    expect(inbound[0].peer.name).toBe("payments")
    expect(outbound).toHaveLength(1)
    expect(outbound[0].role).toBe("Uses")
    expect(outbound[0].peer.type).toBe("RDSInstance")
  })

  it("uses exact totals instead of returned-row counts", () => {
    const payload = response()
    expect(dependencyTotal(payload)).toBe(193)
    expect(dependenciesAreTruncated(payload)).toBe(true)
  })

  it("never upgrades unknown evidence into configured or observed", () => {
    expect(dependencyPlaneLabel("ALLOWED")).toBe("Configured")
    expect(dependencyPlaneLabel("OBSERVED")).toBe("Observed")
    expect(dependencyPlaneLabel("DERIVED")).toBe("Derived")
    expect(dependencyPlaneLabel("UNREGISTERED")).toBe("Unknown")
    expect(dependencyPlaneLabel("OPERATIONAL")).toBe("Operational")
    expect(dependencyPlaneLabel(undefined)).toBe("Unknown")
  })

  it("excludes operational bookkeeping from customer dependency rows", () => {
    const payload = response()
    payload.connections.outbound.push({
      target: { id: "audit-1", name: "audit event", type: "OverrideEvent" },
      relationship: { type: "HAS_AUDIT_EVENT", plane: "OPERATIONAL", edge_class: "decision_execution" },
    })
    expect(excludedOperationalCount(payload)).toBe(1)
    expect(dependencyRows(payload, "outbound")).toHaveLength(1)
  })

  it("uses honest fallbacks for missing identity and freshness", () => {
    expect(dependencyDisplayName({ arn: "arn:aws:s3:::bucket" })).toBe("arn:aws:s3:::bucket")
    expect(dependencyDisplayName({})).toBe("Unresolved resource")
    expect(dependencyFreshnessValue({})).toBeNull()
    expect(dependencyFreshnessValue({ first_seen: "2026-08-01" })).toBe("2026-08-01")
  })

  it("turns relationship identifiers into labels without inventing semantics", () => {
    expect(dependencyRelationshipLabel("READS_FROM")).toBe("Reads From")
    expect(dependencyRelationshipLabel(null)).toBe("Unknown relationship")
  })

  it("renders structured backend refusals instead of object stringification", () => {
    expect(dependencyErrorMessage({
      detail: { code: "resource_identifier_ambiguous", message: "Use the ARN" },
    }, 409)).toBe("Use the ARN")
    expect(dependencyErrorMessage(null, 503)).toBe("Dependencies returned 503")
  })
})
