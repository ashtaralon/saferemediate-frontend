import { describe, it, expect } from "vitest"
import {
  awsNodeMeta,
  resolveReportNode,
} from "@/components/attack-paths-v2/attack-path-card-light"
import type { PathNodeDetail } from "@/components/identity-attack-paths/types"

// Chip identity regression (operator report 2026-07-03): the hero card showed
// "RESOURCE i-0ee29afa0048943e0" — the EC2's name under the ALB's
// (unrecognized) type, because the chip's name came from
// current_state.source_label while its type/icon came from nodes[0] (the path
// ENTRY — the load balancer on ALB-fronted paths). Modeled on the real
// alon-prod 11-hop path to saferemediate-logs.
const NODES = [
  {
    id: "arn:aws:elasticloadbalancing:eu-west-1:1:loadbalancer/app/alon-prod-3tier-alb/x",
    name: "alon-prod-3tier-alb",
    type: "LoadBalancer",
    tier: "entry",
  },
  { id: "i-0ee29afa0048943e0", name: "i-0ee29afa0048943e0", type: "EC2Instance", tier: "identity" },
  { id: "arn:aws:iam::1:role/alon-demo-ec2-role", name: "alon-demo-ec2-role", type: "IAMRole", tier: "identity" },
  {
    id: "arn:aws:s3:::saferemediate-logs-745783559495",
    name: "saferemediate-logs-745783559495",
    type: "S3Bucket",
    tier: "crown_jewel",
  },
] as unknown as PathNodeDetail[]

describe("resolveReportNode — chip name/type must describe the same node", () => {
  it("resolves the workload the source_label names, not nodes[0] (the ALB)", () => {
    const n = resolveReportNode(NODES, "i-0ee29afa0048943e0")
    expect(n?.type).toBe("EC2Instance")
    expect(n?.id).toBe("i-0ee29afa0048943e0")
  })

  it("resolves the jewel by ARN or name", () => {
    expect(resolveReportNode(NODES, "arn:aws:s3:::saferemediate-logs-745783559495")?.type).toBe("S3Bucket")
    expect(resolveReportNode(NODES, "saferemediate-logs-745783559495")?.type).toBe("S3Bucket")
  })

  it("returns undefined for an unknown label (caller falls back explicitly)", () => {
    expect(resolveReportNode(NODES, "does-not-exist")).toBeUndefined()
    expect(resolveReportNode(NODES, null)).toBeUndefined()
  })
})

describe("awsNodeMeta — every path-participating type gets a real label", () => {
  it("EC2Instance → EC2 instance (not the generic Resource fallback)", () => {
    expect(awsNodeMeta("EC2Instance").label).toBe("EC2 instance")
  })
  it("LoadBalancer → Load balancer (was falling through to Resource)", () => {
    expect(awsNodeMeta("LoadBalancer").label).toBe("Load balancer")
  })
  it("unknown type still degrades honestly to Resource", () => {
    expect(awsNodeMeta("SomethingNew").label).toBe("Resource")
  })
})
