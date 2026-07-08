/// <reference types="vitest/globals" />
/**
 * System architecture path — environment-agnostic model tests.
 * Uses synthetic frames (not alon-prod-specific).
 */
import { describe, expect, it } from "vitest"

import {
  architecturePathToTrafficEdges,
  buildSystemArchitecturePath,
  formatArchitecturePathStrip,
  type ArchitectureFrameInput,
} from "@/components/topology-v0-2/system-architecture-path"
import type { TopologyNode } from "@/components/topology-v0-2/types"

function nd(p: Partial<TopologyNode> & Pick<TopologyNode, "id">): TopologyNode {
  return {
    name: p.name ?? p.id,
    type: p.type ?? "EC2",
    subnet_id: null,
    score: null,
    stale: null,
    is_jewel: false,
    ...p,
  }
}

function emptyTierMaps(azs: string[]): ArchitectureFrameInput["grid"]["byAzAndTier"] {
  const m = new Map<string, Map<"web" | "app" | "data" | "unknown", TopologyNode[]>>()
  for (const az of azs) {
    m.set(
      az,
      new Map([
        ["web", []],
        ["app", []],
        ["data", []],
        ["unknown", []],
      ]),
    )
  }
  return m
}

describe("buildSystemArchitecturePath", () => {
  it("derives Internet → ingress → tiers → regional for any system", () => {
    const azs = ["us-east-1a"]
    const byAz = emptyTierMaps(azs)
    byAz.get("us-east-1a")!.set("web", [nd({ id: "i-web", type: "EC2", name: "web-1" })])
    byAz.get("us-east-1a")!.set("app", [nd({ id: "i-app", type: "Lambda", name: "app-fn" })])
    byAz.get("us-east-1a")!.set("data", [nd({ id: "db-1", type: "RDS", name: "primary-db" })])

    const frame: ArchitectureFrameInput = {
      vid: "vpc-aaaa1111bbbb2222",
      isForeign: false,
      ownerSystem: null,
      natGws: [],
      grid: {
        albNodes: [nd({ id: "alb-1", type: "LoadBalancer", name: "system-alb" })],
        azs,
        byAzAndTier: byAz,
        subnetsByCell: new Map([
          ["us-east-1a::web", [{ id: "sn-web" }]],
          ["us-east-1a::app", [{ id: "sn-app" }]],
          ["us-east-1a::data", [{ id: "sn-data" }]],
        ]),
      },
    }

    const path = buildSystemArchitecturePath({
      systemName: "payments-prod",
      frames: [frame],
      regionalNodes: [nd({ id: "s3-1", type: "S3", name: "data-bucket" })],
      serverlessNodes: [],
    })

    expect(path.hops.map(h => h.kind)).toEqual([
      "internet",
      "ingress",
      "web",
      "app",
      "data",
      "regional",
    ])
    expect(path.hops.find(h => h.kind === "ingress")?.label).toBe("ALB")
    expect(path.summary).toContain("payments-prod")
    expect(path.summary).toContain("Web Tier")
    expect(path.hasAlb).toBe(true)
    expect(formatArchitecturePathStrip(path)).toMatch(/Internet → ALB → Web Tier/)
  })

  it("always reserves Data hop when frames exist even if empty", () => {
    const azs = ["eu-west-1a"]
    const byAz = emptyTierMaps(azs)
    byAz.get("eu-west-1a")!.set("web", [nd({ id: "i-1" })])
    const frame: ArchitectureFrameInput = {
      vid: "vpc-cccc",
      isForeign: false,
      ownerSystem: null,
      natGws: [],
      grid: {
        albNodes: [],
        azs,
        byAzAndTier: byAz,
        subnetsByCell: new Map([["eu-west-1a::web", [{ id: "sn-w" }]]]),
      },
    }
    const path = buildSystemArchitecturePath({
      systemName: "demo-system",
      frames: [frame],
    })
    const dataHop = path.hops.find(h => h.kind === "data")
    expect(dataHop).toBeTruthy()
    expect(dataHop?.detail).toMatch(/No data subnet/)
  })

  it("labels shared VPC ownership without hardcoding co-tenant names", () => {
    const azs = ["eu-west-1a"]
    const byAz = emptyTierMaps(azs)
    byAz.get("eu-west-1a")!.set("web", [nd({ id: "i-shared" })])
    const own: ArchitectureFrameInput = {
      vid: "vpc-own",
      isForeign: false,
      ownerSystem: null,
      natGws: [],
      grid: {
        albNodes: [],
        azs,
        byAzAndTier: emptyTierMaps(azs),
        subnetsByCell: new Map([["eu-west-1a::web", [{ id: "sn-own" }]]]),
      },
    }
    own.grid.byAzAndTier.get("eu-west-1a")!.set("web", [nd({ id: "i-own" })])
    const shared: ArchitectureFrameInput = {
      vid: "vpc-shared",
      isForeign: true,
      ownerSystem: "other-system",
      natGws: [],
      grid: {
        albNodes: [],
        azs,
        byAzAndTier: byAz,
        subnetsByCell: new Map([["eu-west-1a::web", [{ id: "sn-sh" }]]]),
      },
    }
    const path = buildSystemArchitecturePath({
      systemName: "my-system",
      frames: [own, shared],
    })
    expect(path.hasSharedVpc).toBe(true)
    expect(path.vpcSummary).toMatch(/shared \(other-system\)/)
  })
})

describe("architecturePathToTrafficEdges", () => {
  it("emits structural edges between consecutive hops with node ids", () => {
    const path = buildSystemArchitecturePath({
      systemName: "x",
      frames: [],
    })
    // Force hops with ids for the edge builder
    path.hops = [
      { kind: "internet", label: "Internet", detail: null, nodeIds: [] },
      { kind: "ingress", label: "ALB", detail: null, nodeIds: ["alb-1"] },
      { kind: "web", label: "Web Tier", detail: null, nodeIds: ["i-web"] },
    ]
    const visible = new Set(["alb-1", "i-web", "__igw__"])
    const edges = architecturePathToTrafficEdges(path, visible)
    expect(edges.some(e => e.source_id === "__igw__" && e.target_id === "alb-1")).toBe(true)
    expect(edges.some(e => e.source_id === "alb-1" && e.target_id === "i-web")).toBe(true)
  })
})
