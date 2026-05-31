import { describe, it, expect } from "vitest"
import { derivePrecedenceForDestination } from "@/lib/route-precedence"
import type { EgressGatewayNode } from "@/components/dependency-map/traffic-flow-map"

// Test corpus modeled on alon-prod 2026-06-01 path-5203dfee3012
// (saferemediate-logs S3 read) plus a small set of edge cases that
// cover the public-fallback and the no-gateway disposition.

const igw: EgressGatewayNode = {
  id: "igw-0d1dd1d08b071f5cf",
  name: "igw-0d1dd1d08b071f5cf",
  shortName: "igw-0d1dd1d08b…",
  vpcId: "vpc-086bcc2186fa42c96",
  kind: "InternetGateway",
  kindLabel: "IGW",
  routed: true,
  routeDestinationCidr: "0.0.0.0/0",
  routeTargetService: null,
}

const vpceS3: EgressGatewayNode = {
  id: "vpce-03697705b0333e336",
  name: "vpce-03697705b0333e336",
  shortName: "vpce-03697705…",
  vpcId: "vpc-086bcc2186fa42c96",
  kind: "VPCEndpoint",
  kindLabel: "VPCE",
  serviceHint: "s3",
  routed: true,
  routeDestinationCidr: null,
  routeTargetService: "com.amazonaws.eu-west-1.s3",
}

const vpceDynamoEuWest: EgressGatewayNode = {
  ...vpceS3,
  id: "vpce-dynamo-eu-west-1",
  serviceHint: "dynamodb",
  routeTargetService: "com.amazonaws.eu-west-1.dynamodb",
}

const nat: EgressGatewayNode = {
  ...igw,
  id: "nat-private-subnet",
  kind: "NATGateway",
  kindLabel: "NAT GW",
}

describe("derivePrecedenceForDestination", () => {
  it("S3 destination with matching VPCE → VPCE wins, private", () => {
    const result = derivePrecedenceForDestination({ type: "storage" }, [igw, vpceS3])
    expect(result).not.toBeNull()
    expect(result!.gateway.id).toBe(vpceS3.id)
    expect(result!.isPrivate).toBe(true)
    expect(result!.label).toBe("com.amazonaws.eu-west-1.s3")
  })

  it("S3 destination without a matching VPCE → falls back to IGW, public", () => {
    const result = derivePrecedenceForDestination({ type: "storage" }, [igw])
    expect(result).not.toBeNull()
    expect(result!.gateway.id).toBe(igw.id)
    expect(result!.isPrivate).toBe(false)
    expect(result!.label).toBe("0.0.0.0/0")
  })

  it("S3 destination with a cross-service VPCE → IGW wins (the VPCE doesn't carry s3)", () => {
    // Only a DynamoDB VPCE present, not an S3 VPCE. S3 traffic
    // can't traverse the dynamodb VPCE, so default route via IGW
    // takes over.
    const result = derivePrecedenceForDestination(
      { type: "storage" },
      [igw, vpceDynamoEuWest],
    )
    expect(result).not.toBeNull()
    expect(result!.gateway.id).toBe(igw.id)
    expect(result!.isPrivate).toBe(false)
  })

  it("DynamoDB destination with matching VPCE → VPCE wins, private", () => {
    const result = derivePrecedenceForDestination(
      { type: "dynamodb" },
      [igw, vpceDynamoEuWest],
    )
    expect(result).not.toBeNull()
    expect(result!.gateway.id).toBe(vpceDynamoEuWest.id)
    expect(result!.isPrivate).toBe(true)
    expect(result!.label).toBe("com.amazonaws.eu-west-1.dynamodb")
  })

  it("Compute destination (non-AWS-service) → falls through to IGW", () => {
    // Non-storage non-dynamodb destination — no VPCE could ever
    // match. IGW carries it.
    const result = derivePrecedenceForDestination({ type: "compute" }, [igw, vpceS3])
    expect(result).not.toBeNull()
    expect(result!.gateway.id).toBe(igw.id)
    expect(result!.isPrivate).toBe(false)
  })

  it("Empty lane (no IGW, no VPCE) → null (no phantom claim)", () => {
    const result = derivePrecedenceForDestination({ type: "storage" }, [])
    expect(result).toBeNull()
  })

  it("S3 destination with only VPCE present (no IGW) → VPCE wins, private", () => {
    const result = derivePrecedenceForDestination({ type: "storage" }, [vpceS3])
    expect(result).not.toBeNull()
    expect(result!.gateway.id).toBe(vpceS3.id)
    expect(result!.isPrivate).toBe(true)
  })

  it("Non-S3 destination with only VPCE present (no IGW) → null", () => {
    // The VPCE only carries s3; the only fallback would be a
    // public gateway. None present → null. The renderer omits
    // the chip rather than lying that traffic goes via the s3
    // VPCE.
    const result = derivePrecedenceForDestination({ type: "compute" }, [vpceS3])
    expect(result).toBeNull()
  })

  it("Private-subnet path: NAT-only lane → NAT carries the traffic, public", () => {
    const result = derivePrecedenceForDestination({ type: "compute" }, [nat])
    expect(result).not.toBeNull()
    expect(result!.gateway.id).toBe(nat.id)
    expect(result!.isPrivate).toBe(false)
  })

  it("VPCE with no route metadata, just serviceHint → label falls back to com.amazonaws.<hint>", () => {
    const stubVpce: EgressGatewayNode = {
      ...vpceS3,
      routeTargetService: null,
      serviceHint: "s3",
    }
    const result = derivePrecedenceForDestination({ type: "storage" }, [stubVpce])
    expect(result).not.toBeNull()
    expect(result!.label).toBe("com.amazonaws.s3")
  })

  it("VPCE with no metadata at all → no match (can't claim it covers s3)", () => {
    const stubVpce: EgressGatewayNode = {
      ...vpceS3,
      routeTargetService: null,
      serviceHint: undefined,
    }
    const result = derivePrecedenceForDestination(
      { type: "storage" },
      [igw, stubVpce],
    )
    // The stub VPCE has nothing identifying its service. Match
    // must fail; IGW takes over.
    expect(result).not.toBeNull()
    expect(result!.gateway.id).toBe(igw.id)
    expect(result!.isPrivate).toBe(false)
  })
})
