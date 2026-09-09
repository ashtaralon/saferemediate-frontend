import { describe, expect, it } from "vitest"
import {
  INGRESS_TYPES,
  RAIL_PLACED_TYPES,
  REGIONAL_EDGE_SERVICE_TYPES,
  SERVERLESS_TYPES,
  TRIGGER_TYPES,
  mapSlotForType,
  resolveNodePlacement,
  SYNTHETIC_TIER_TYPES,
} from "@/components/topology-v0-2/estate-placement"

describe("estate-placement registry", () => {
  it("places ALB and API Gateway on ingress", () => {
    expect(mapSlotForType("LoadBalancer")).toBe("ingress")
    expect(mapSlotForType("APIGateway")).toBe("ingress")
    expect(INGRESS_TYPES.has("APIGateway")).toBe(true)
  })

  it("places ASG on web and RDS on data", () => {
    expect(mapSlotForType("AutoScalingGroup")).toBe("web")
    expect(mapSlotForType("RDS")).toBe("data")
    expect(SYNTHETIC_TIER_TYPES.AutoScalingGroup).toBe("web")
    expect(SYNTHETIC_TIER_TYPES.RDS).toBe("data")
  })

  it("places S3/DynamoDB on the regional rail — not VPC grid", () => {
    expect(mapSlotForType("S3")).toBe("regional")
    expect(mapSlotForType("DynamoDB")).toBe("regional")
    expect(REGIONAL_EDGE_SERVICE_TYPES.has("APIGateway")).toBe(false)
  })

  it("places EventBridge/SQS/StepFunction in the triggers band, not regional", () => {
    // They invoke the serverless lane; they are not terminal data services.
    for (const t of ["EventBridge", "EventBridgeRule", "SQS", "SQSQueue", "StepFunction", "StateMachine"]) {
      expect(mapSlotForType(t)).toBe("triggers")
      expect(TRIGGER_TYPES.has(t)).toBe(true)
      expect(REGIONAL_EDGE_SERVICE_TYPES.has(t)).toBe(false)
    }
  })

  it("RAIL_PLACED_TYPES covers every non-grid rail type", () => {
    // The regression this pins: three call sites asked
    // REGIONAL_EDGE_SERVICE_TYPES "is this node grid-placed?". When triggers
    // split out, that question started answering `false` for EventBridge —
    // which sends it to the unplaced bucket and lists it as a stale workload.
    for (const t of [...REGIONAL_EDGE_SERVICE_TYPES, ...TRIGGER_TYPES]) {
      expect(RAIL_PLACED_TYPES.has(t)).toBe(true)
    }
    expect(RAIL_PLACED_TYPES.has("EventBridge")).toBe(true)
    expect(RAIL_PLACED_TYPES.has("S3")).toBe(true)
    // Grid-placed and ingress types must never be claimed by a rail.
    expect(RAIL_PLACED_TYPES.has("EC2")).toBe(false)
    expect(RAIL_PLACED_TYPES.has("RDS")).toBe(false)
    expect(RAIL_PLACED_TYPES.has("APIGateway")).toBe(false)
    // Serverless has its own lane and its own guard; it is not a rail-placed
    // type in the RAIL_PLACED_TYPES sense (tryPlaceInGrid checks it separately).
    for (const t of SERVERLESS_TYPES) expect(RAIL_PLACED_TYPES.has(t)).toBe(false)
  })

  it("prefers BE placement_tier over type default", () => {
    const r = resolveNodePlacement({
      type: "EC2",
      placementTier: "web",
      subnetTier: "app",
    })
    expect(r.gridTier).toBe("web")
  })

  it("hides unknown types instead of inventing a slot", () => {
    expect(mapSlotForType("TotallyFakeService")).toBe("hidden")
  })
})
