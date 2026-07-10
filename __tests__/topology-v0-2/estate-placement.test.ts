import { describe, expect, it } from "vitest"
import {
  INGRESS_TYPES,
  REGIONAL_EDGE_SERVICE_TYPES,
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

  it("places S3/SQS/EventBridge on regional rail — not VPC grid", () => {
    expect(mapSlotForType("S3")).toBe("regional")
    expect(mapSlotForType("SQS")).toBe("regional")
    expect(mapSlotForType("EventBridge")).toBe("regional")
    expect(REGIONAL_EDGE_SERVICE_TYPES.has("APIGateway")).toBe(false)
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
