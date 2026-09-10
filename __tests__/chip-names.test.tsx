/// <reference types="vitest/globals" />
/**
 * Shared-prefix elision on rail chips (C1 production QA, 2026-09-02: six
 * Lambda chips all read "cyntro-tb-prod-c…"). The pure helper decides the
 * prefix; the render test pins that the lane's chips show "…suffix", the
 * header states the prefix once, and the chip title keeps the full name.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

import { AwsFrame } from "@/components/topology-v0-2/aws-frame"
import {
  buildFrameNameElision,
  computeCanvasGrid,
  regionalFamilies,
} from "@/components/topology-v0-2/aws-frame"
import { elideSharedPrefix, sharedNamePrefix } from "@/components/topology-v0-2/chip-names"
import type { SubnetMeta, TopologyNode, VpcTopology } from "@/components/topology-v0-2/types"

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})
afterEach(() => cleanup())

describe("sharedNamePrefix / elideSharedPrefix", () => {
  it("elides the longest separator-bounded prefix that leaves every name a readable remainder", () => {
    const names = ["cyntro-tb-prod-consumer-a", "cyntro-tb-prod-consumer-b", "cyntro-tb-prod-checkout"]
    expect(sharedNamePrefix(names)).toBe("cyntro-tb-prod-")
    expect(elideSharedPrefix(names).labels).toEqual(["…consumer-a", "…consumer-b", "…checkout"])
  })

  it("backs the prefix off one token when the full common prefix would leave a one-letter remainder", () => {
    const names = ["cyntro-tb-prod-consumer-a", "cyntro-tb-prod-consumer-b", "cyntro-tb-prod-consumer-c"]
    expect(sharedNamePrefix(names)).toBe("cyntro-tb-prod-")
    expect(elideSharedPrefix(names).labels).toEqual(["…consumer-a", "…consumer-b", "…consumer-c"])
  })

  it("never cuts inside a word", () => {
    expect(sharedNamePrefix(["cyntro-tb-prod-cart", "cyntro-tb-prod-catalog", "cyntro-tb-prod-cache-warm"])).toBe("cyntro-tb-prod-")
  })

  it("takes the family prefix, not the one every name shares — one outlier must not collapse it", () => {
    // C1's regional lane: nine cyntro-tb-prod-* beside one aws-sam-cli bucket
    // reduced the common prefix to "cyntro-" and left four chips identical.
    const names = [
      "cyntro-tb-prod-appdata",
      "cyntro-tb-prod-artifacts",
      "cyntro-tb-prod-consumer-monthly",
      "cyntro-tb-prod-consumer-weekly",
      "aws-sam-cli-managed-default-sourcebucket",
    ]
    const out = elideSharedPrefix(names)
    expect(out.prefix).toBe("cyntro-tb-prod-")
    expect(out.count).toBe(4)
    // The outlier keeps its own name; nothing is mislabelled.
    expect(out.labels).toEqual([
      "…appdata",
      "…artifacts",
      "…consumer-monthly",
      "…consumer-weekly",
      "aws-sam-cli-managed-default-sourcebucket",
    ])
  })

  it("does nothing for fewer than three names, no separator-bounded prefix, or a too-short prefix", () => {
    expect(elideSharedPrefix(["cyntro-tb-prod-a-service", "cyntro-tb-prod-b-service"])).toEqual({
      prefix: "",
      labels: ["cyntro-tb-prod-a-service", "cyntro-tb-prod-b-service"],
      count: 0,
    })
    expect(sharedNamePrefix(["alpha-one", "beta-two", "gamma-three"])).toBe("")
    expect(sharedNamePrefix(["ab-service-one", "ab-service-two", "ab-worker-three"])).toBe("")
  })

  it("keeps a name that does not carry the prefix verbatim and ignores empty names", () => {
    const names = ["cyntro-tb-prod-consumer-a", "cyntro-tb-prod-consumer-b", "cyntro-tb-prod-consumer-c", ""]
    const out = elideSharedPrefix(names)
    expect(out.prefix).toBe("cyntro-tb-prod-")
    expect(out.count).toBe(3)
    expect(out.labels[3]).toBe("")
  })
})

const VPC = "vpc-0c39cde96f29f8f4e"
function sn(p: Partial<SubnetMeta> & Pick<SubnetMeta, "id">): SubnetMeta {
  return { name: p.id, az: "eu-west-1a", cidr: "10.42.0.0/24", tier: "web", tier_source: "property", vpc_id: VPC, ...p }
}
function nd(p: Partial<TopologyNode> & Pick<TopologyNode, "id">): TopologyNode {
  return { name: p.id, type: "EC2", subnet_id: null, score: null, stale: null, is_jewel: false, ...p }
}
const vpcTopology: VpcTopology = {
  region: "eu-west-1",
  account_id: "416651950952",
  vpc_id: VPC,
  azs: ["eu-west-1a"],
  subnets: [sn({ id: "subnet-web-1a" })],
  edges: { igws: [], nat_gws: [], vpces: [] },
  unknown_subnet_count: 0,
  security_groups: [],
  iam_roles: [],
}
const nodes: TopologyNode[] = [
  nd({ id: "i-web", type: "EC2", vpc_id: VPC, subnet_id: "subnet-web-1a" }),
  nd({ id: "fn-a", name: "cyntro-tb-prod-consumer-a", type: "Lambda" }),
  nd({ id: "fn-b", name: "cyntro-tb-prod-consumer-b", type: "Lambda" }),
  nd({ id: "fn-c", name: "cyntro-tb-prod-checkout", type: "Lambda" }),
  nd({ id: "arn:aws:s3:::cyntro-tb-prod-appdata", name: "cyntro-tb-prod-appdata", type: "S3" }),
  nd({ id: "arn:aws:s3:::cyntro-tb-prod-logs", name: "cyntro-tb-prod-logs", type: "S3" }),
  nd({ id: "arn:aws:s3:::cyntro-tb-prod-exports", name: "cyntro-tb-prod-exports", type: "S3" }),
]

describe("rail chips elide the lane's shared name prefix", () => {
  it("shows …suffix on the chips, the prefix once in the header, and the full name in the title", () => {
    render(
      <AwsFrame
        vpcTopology={vpcTopology}
        nodes={nodes}
        mergedVpcView={false}
        presentationMode={true}
        viewDensity="inventory"
        selectedNodeId={null}
        onSelect={() => {}}
      />,
    )
    const rail = screen.getByTestId("topology-edge-services-rail")
    const serverless = within(rail).getByTestId("topology-serverless-tier")
    const serverlessPrefix = within(serverless).getByTestId("topology-serverless-name-prefix")
    expect(serverlessPrefix).toHaveTextContent("cyntro-tb-prod-… ×3")
    const lambdaChips = within(serverless).getAllByTestId("topology-service-node-icon")
    expect(lambdaChips.map(chip => chip.querySelector("span.truncate")?.textContent)).toEqual([
      "…consumer-a",
      "…consumer-b",
      "…checkout",
    ])
    expect(lambdaChips[0]).toHaveAttribute("title", expect.stringContaining("cyntro-tb-prod-consumer-a"))

    const regional = within(rail).getByTestId("topology-regional-data-tier")
    expect(within(regional).getByTestId("topology-regional-name-prefix")).toHaveTextContent("cyntro-tb-prod-… ×3")
    const bucketChips = within(regional).getAllByTestId("topology-service-node-icon")
    expect(bucketChips.map(chip => chip.querySelector("span.truncate")?.textContent)).toEqual(["…appdata", "…logs", "…exports"])
    // The in-VPC chip is untouched.
    expect(screen.getByTitle(/^i-web ·/)).toHaveTextContent("i-web")
  })
})

// In-VPC workload chips. The rail lanes above elide per lane, which works
// because a lane IS the whole family. Inside the VPC the family is split across
// tier rows by role — web siblings in the web row, their app peer one row down —
// so per-cell or per-row elision sees 1-2 names, declines (minNames = 3), and
// leaves two chips reading the same clipped string. Elision is therefore
// computed per FRAME, and the frame header states the prefix once.
// The two web siblings sit in DIFFERENT AZs, as a load-balanced pair does in
// every real account. That matters: within one cell, Glance groups same-type
// nodes into a single ×N stack labelled by TYPE, so two siblings sharing a
// subnet never collide in the first place. The collision needs one chip per
// cell, which is what an AZ-spread pair produces.
const TIERED_SUBNETS: SubnetMeta[] = [
  sn({ id: "subnet-web-1a", tier: "web", az: "eu-west-1a", cidr: "10.42.1.0/24" }),
  sn({ id: "subnet-web-1b", tier: "web", az: "eu-west-1b", cidr: "10.42.2.0/24" }),
  sn({ id: "subnet-app-1a", tier: "app", az: "eu-west-1a", cidr: "10.42.10.0/24" }),
  sn({ id: "subnet-data-1a", tier: "data", az: "eu-west-1a", cidr: "10.42.20.0/24" }),
]
const tieredTopology: VpcTopology = {
  ...vpcTopology,
  azs: ["eu-west-1a", "eu-west-1b"],
  subnets: TIERED_SUBNETS,
}
/** Two web siblings + one app sibling: a family no single tier row can see. */
const TIERED_SIBLINGS: TopologyNode[] = [
  nd({ id: "i-web-1", name: "cyntro-tb-prod-web-1", type: "EC2", vpc_id: VPC, subnet_id: "subnet-web-1a" }),
  nd({ id: "i-web-2", name: "cyntro-tb-prod-web-2", type: "EC2", vpc_id: VPC, subnet_id: "subnet-web-1b" }),
  nd({ id: "i-app-1", name: "cyntro-tb-prod-app-1", type: "EC2", vpc_id: VPC, subnet_id: "subnet-app-1a" }),
]

function renderFrame(nodesToRender: TopologyNode[], viewDensity: "glance" | "inventory") {
  render(
    <AwsFrame
      vpcTopology={tieredTopology}
      nodes={nodesToRender}
      mergedVpcView={false}
      presentationMode={true}
      viewDensity={viewDensity}
      selectedNodeId={null}
      onSelect={() => {}}
    />,
  )
}

function chipLabels(testId: string): string[] {
  return screen
    .getAllByTestId(testId)
    .map(chip => within(chip).getByTestId("topology-chip-label").textContent ?? "")
}

describe("buildFrameNameElision", () => {
  it("finds the family across tier rows, which no single row can see", () => {
    const grid = computeCanvasGrid(VPC, TIERED_SUBNETS, TIERED_SIBLINGS, [])
    const elision = buildFrameNameElision(grid)
    expect(elision.prefix).toBe("cyntro-tb-prod-")
    expect(elision.count).toBe(3)
    expect(elision.total).toBe(3)
    expect(elision.displayName("i-web-1")).toBe("…web-1")
    expect(elision.displayName("i-web-2")).toBe("…web-2")
    expect(elision.displayName("i-app-1")).toBe("…app-1")

    // The control that makes the assertion above mean something: elide per tier
    // row — the widest scope short of the frame — and the whole web row is two
    // names, so elideSharedPrefix correctly declines and the pair still collides.
    const webRow = [...grid.byAzAndTier.values()].flatMap(byTier => byTier.get("web") ?? [])
    expect(webRow.map(n => n.name).sort()).toEqual(["cyntro-tb-prod-web-1", "cyntro-tb-prod-web-2"])
    expect(elideSharedPrefix(webRow.map(n => n.name)).prefix).toBe("")
  })

  it("returns undefined per node when there is no family, so callers fall back to the full name", () => {
    const twoOnly = TIERED_SIBLINGS.slice(0, 2)
    const elision = buildFrameNameElision(computeCanvasGrid(VPC, TIERED_SUBNETS, twoOnly, []))
    expect(elision.prefix).toBe("")
    expect(elision.count).toBe(0)
    expect(elision.total).toBe(2)
    expect(elision.displayName("i-web-1")).toBeUndefined()
  })

  it("counts a multi-AZ workload once, not once per cell it is drawn in", () => {
    // Drawn in both zones' web cells; one resource, so one family member. If it
    // counted per cell, a 3-member family could be two names in a trench coat.
    const multiAz = nd({
      id: "i-span",
      name: "cyntro-tb-prod-web-3",
      type: "EC2",
      vpc_id: VPC,
      subnet_ids: ["subnet-web-1a", "subnet-web-1b"],
    } as Partial<TopologyNode> & Pick<TopologyNode, "id">)
    const grid = computeCanvasGrid(VPC, TIERED_SUBNETS, [...TIERED_SIBLINGS, multiAz], [])
    const cells = [
      grid.byAzAndTier.get("eu-west-1a")?.get("web") ?? [],
      grid.byAzAndTier.get("eu-west-1b")?.get("web") ?? [],
    ]
    expect(cells.flat().filter(n => n.id === "i-span")).toHaveLength(2)
    expect(buildFrameNameElision(grid).total).toBe(4)
  })
})

describe("VPC workload chips elide the frame's shared name prefix", () => {
  it("shortens the label, states the prefix once in the frame header, keeps the full name on the title", () => {
    renderFrame(TIERED_SIBLINGS, "glance")
    const header = screen.getByTestId("topology-vpc-frame-header")
    expect(within(header).getByTestId("topology-vpc-name-prefix")).toHaveTextContent("cyntro-tb-prod-… ×3")
    // One EC2 per cell, so each is a lone stack labelled by its representative's
    // name — the site where two siblings used to render the same clipped text.
    expect(chipLabels("topology-service-stack").sort()).toEqual(["…app-1", "…web-1", "…web-2"])
    expect(screen.getByTitle(/^cyntro-tb-prod-web-1 ·/)).toBeTruthy()
    expect(screen.getByTitle(/^cyntro-tb-prod-web-2 ·/)).toBeTruthy()
  })

  it("elides in Inventory density too — same frame, per-node chips", () => {
    renderFrame(TIERED_SIBLINGS, "inventory")
    expect(chipLabels("topology-service-node-icon").sort()).toEqual(["…app-1", "…web-1", "…web-2"])
  })

  it("leaves labels and header alone when the frame has no shared prefix", () => {
    // Non-vacuity: without this the tests above would also pass on a build that
    // elided unconditionally, which would mislabel unrelated workloads.
    renderFrame(TIERED_SIBLINGS.slice(0, 2), "glance")
    expect(screen.queryByTestId("topology-vpc-name-prefix")).toBeNull()
    expect(chipLabels("topology-service-stack").sort()).toEqual([
      "cyntro-tb-prod-web-1",
      "cyntro-tb-prod-web-2",
    ])
  })
})

describe("lane headers state only what the payload supports", () => {
  it("calls a Lambda without a VPC reading 'attachment unverified', never 'not VPC-attached'", () => {
    render(
      <AwsFrame
        vpcTopology={vpcTopology}
        nodes={nodes}
        mergedVpcView={false}
        presentationMode={true}
        viewDensity="inventory"
        selectedNodeId={null}
        onSelect={() => {}}
      />,
    )
    const header = screen
      .getByTestId("topology-serverless-tier")
      .querySelector('[data-flow-obstacle="serverless-tier-header"]')
    expect(header).not.toBeNull()
    // The backend's coverage contract calls these unknown; the header must not
    // contradict it on the same screen (C1 production QA, 2026-09-02).
    expect(header).toHaveTextContent("3 attachment unverified")
    expect(header?.textContent).not.toContain("not VPC-attached")
    expect(header?.textContent).not.toContain("attachment unresolved")
  })

  it("names the regional families the lane holds, commonest first", () => {
    // Count descending; ties break alphabetically so the header is stable
    // across syncs rather than following payload order.
    expect(
      regionalFamilies([
        nd({ id: "r1", name: "rule-a", type: "EventBridge" }),
        nd({ id: "r2", name: "rule-b", type: "EventBridge" }),
        nd({ id: "r3", name: "rule-c", type: "EventBridge" }),
        nd({ id: "b1", name: "bucket-a", type: "S3" }),
        nd({ id: "t1", name: "table-a", type: "DynamoDB" }),
      ]),
      // DDB, not DynamoDB: a 200px lane header is ~26 uppercase characters and
      // the long form wrapped the count onto a second line (measured
      // 2026-09-10). The chips themselves keep the shared catalog's own label.
    ).toBe("EventBridge / DDB / S3")
    // More families than the header can name: the rest are counted, not dropped.
    expect(
      regionalFamilies([
        nd({ id: "b1", name: "b", type: "S3" }),
        nd({ id: "t1", name: "t", type: "DynamoDB" }),
        nd({ id: "k1", name: "k", type: "KMSKey" }),
        nd({ id: "q1", name: "q", type: "SQS" }),
      ]),
    ).toMatch(/\+1$/)
    expect(regionalFamilies([])).toBe("services")
  })
})
