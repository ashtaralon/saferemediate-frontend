import { describe, expect, it } from "vitest"
import {
  BOUNDARY_TYPES,
  GLOBAL_TYPES,
  INGRESS_TYPES,
  OFF_GRID_SLOTS,
  RAIL_PLACED_TYPES,
  REGIONAL_EDGE_SERVICE_TYPES,
  SERVERLESS_TYPES,
  TRIGGER_TYPES,
  isDeclaredOffCanvas,
  mapSlotForType,
  placementRuleForType,
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

describe("estate-placement v3 — ten slots, one per catalog type", () => {
  it("tells a declared hidden type from an unknown one", () => {
    // Both answer `hidden`; only one is a decision. The renderer's
    // `isOffCanvasByDesign` reads this distinction, so an IAM role is never
    // listed as a gap and a QuantumLedger is never silently swallowed.
    expect(mapSlotForType("IAMRole")).toBe("hidden")
    expect(placementRuleForType("IAMRole")).not.toBeNull()
    expect(isDeclaredOffCanvas("IAMRole")).toBe(true)
    expect(mapSlotForType("TotallyFakeService")).toBe("hidden")
    expect(placementRuleForType("TotallyFakeService")).toBeNull()
    expect(isDeclaredOffCanvas("TotallyFakeService")).toBe(false)
  })

  it("puts frames, off-estate endpoints and boundary devices off the grid by decision", () => {
    for (const t of ["VPC", "Subnet", "SecurityGroup", "NACL", "RouteTable", "Account"]) {
      expect(mapSlotForType(t)).toBe("container")
      expect(isDeclaredOffCanvas(t)).toBe(true)
    }
    for (const t of ["Internet", "CustomerGateway"]) {
      expect(mapSlotForType(t)).toBe("external")
      expect(isDeclaredOffCanvas(t)).toBe(true)
    }
    for (const t of ["InternetGateway", "IGW", "NATGateway", "VPCEndpoint", "EIP", "VPNGateway", "VPCPeering", "EICEndpoint"]) {
      expect(mapSlotForType(t)).toBe("boundary")
      expect(BOUNDARY_TYPES.has(t)).toBe(true)
      expect(isDeclaredOffCanvas(t)).toBe(true)
    }
    expect(mapSlotForType("Route53")).toBe("global")
    expect(GLOBAL_TYPES.has("Domain")).toBe(true)
  })

  it("keeps the lane types drawn, not off-canvas", () => {
    // Serverless / triggers / regional are drawn by their lanes; the grid asks
    // RAIL_PLACED_TYPES and SERVERLESS_TYPES about them, never this.
    for (const t of ["Lambda", "EventBridge", "SNSTopic", "S3", "CloudTrail"]) {
      expect(isDeclaredOffCanvas(t)).toBe(false)
    }
    for (const slot of ["serverless", "triggers", "regional", "boundary", "global", "container", "external", "hidden"]) {
      expect(OFF_GRID_SLOTS.has(slot as never)).toBe(true)
    }
    for (const slot of ["web", "app", "data", "ingress"]) {
      expect(OFF_GRID_SLOTS.has(slot as never)).toBe(false)
    }
  })

  it("places the platform services that used to fall through to the default", () => {
    // Cataloged `regional` for months, named by no rule, so they resolved to
    // `hidden` by default and rendered "type unresolved".
    for (const t of ["CloudTrail", "CloudTrailTrail", "CloudWatchLogGroup", "AthenaWorkgroup"]) {
      expect(mapSlotForType(t)).toBe("regional")
      expect(REGIONAL_EDGE_SERVICE_TYPES.has(t)).toBe(true)
    }
    // A topic delivers to subscribers: it fans out, like a rule or a queue.
    for (const t of ["SNS", "SNSTopic", "EventBus"]) {
      expect(mapSlotForType(t)).toBe("triggers")
      expect(RAIL_PLACED_TYPES.has(t)).toBe(true)
    }
    // Subnet-bound families AWS draws inside the private/data subnet.
    for (const t of ["ElastiCache", "ElastiCacheCluster", "EFS", "EFSFileSystem"]) {
      expect(mapSlotForType(t)).toBe("data")
      expect(SYNTHETIC_TIER_TYPES[t]).toBe("data")
    }
    for (const t of ["K8sCluster", "K8sPod"]) {
      expect(mapSlotForType(t)).toBe("app")
    }
  })

  it("resolves vpc-conditional in the authority: a Lambda with a subnet is subnet-placed", () => {
    // No subnet evidence → the runtime lane.
    expect(resolveNodePlacement({ type: "Lambda" })).toEqual({ slot: "serverless", gridTier: null })
    expect(resolveNodePlacement({ type: "LambdaFunction", subnetResolved: false, subnetTier: "app" }).slot)
      .toBe("serverless")
    // A resolved subnet with a known tier → that tier, drawn by the grid.
    expect(resolveNodePlacement({ type: "Lambda", subnetResolved: true, subnetTier: "app" }))
      .toEqual({ slot: "app", gridTier: "app" })
    expect(resolveNodePlacement({ type: "Lambda", subnetResolved: true, subnetTier: "data" }))
      .toEqual({ slot: "data", gridTier: "data" })
    // A resolved subnet whose tier is unknown still places — in the subnet's
    // own row — and the tier is NOT guessed.
    expect(resolveNodePlacement({ type: "Lambda", subnetResolved: true, subnetTier: "unknown" }))
      .toEqual({ slot: "app", gridTier: null })
  })
})
