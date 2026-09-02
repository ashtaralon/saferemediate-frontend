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

  it("does nothing for fewer than three names, no separator-bounded prefix, or a too-short prefix", () => {
    expect(elideSharedPrefix(["cyntro-tb-prod-a-service", "cyntro-tb-prod-b-service"])).toEqual({
      prefix: "",
      labels: ["cyntro-tb-prod-a-service", "cyntro-tb-prod-b-service"],
    })
    expect(sharedNamePrefix(["alpha-one", "beta-two", "gamma-three"])).toBe("")
    expect(sharedNamePrefix(["ab-service-one", "ab-service-two", "ab-worker-three"])).toBe("")
  })

  it("keeps a name that does not carry the prefix verbatim and ignores empty names", () => {
    const names = ["cyntro-tb-prod-consumer-a", "cyntro-tb-prod-consumer-b", "cyntro-tb-prod-consumer-c", ""]
    const out = elideSharedPrefix(names)
    expect(out.prefix).toBe("cyntro-tb-prod-")
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
    expect(serverlessPrefix).toHaveTextContent("names start with cyntro-tb-prod-")
    const lambdaChips = within(serverless).getAllByTestId("topology-service-node-icon")
    expect(lambdaChips.map(chip => chip.querySelector("span.truncate")?.textContent)).toEqual([
      "…consumer-a",
      "…consumer-b",
      "…checkout",
    ])
    expect(lambdaChips[0]).toHaveAttribute("title", expect.stringContaining("cyntro-tb-prod-consumer-a"))

    const regional = within(rail).getByTestId("topology-regional-data-tier")
    expect(within(regional).getByTestId("topology-regional-name-prefix")).toHaveTextContent("names start with cyntro-tb-prod-")
    const bucketChips = within(regional).getAllByTestId("topology-service-node-icon")
    expect(bucketChips.map(chip => chip.querySelector("span.truncate")?.textContent)).toEqual(["…appdata", "…logs", "…exports"])
    // The in-VPC chip is untouched.
    expect(screen.getByTitle(/^i-web ·/)).toHaveTextContent("i-web")
  })
})
