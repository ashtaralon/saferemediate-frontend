import { describe, it, expect } from "vitest"
import {
  ensurePathTargetResource,
  isPathFocusOffTargetCrownJewelHidden,
  resolvePathFocusTargetJewelId,
} from "@/components/dependency-map/traffic-flow-map"

describe("isPathFocusOffTargetCrownJewelHidden", () => {
  const target = "arn:aws:s3:::saferemediate-logs"
  const otherKms = "arn:aws:kms:eu-west-1:1:key/aaa"

  it("hides off-target crown jewels when path focus is on and blast is off", () => {
    expect(
      isPathFocusOffTargetCrownJewelHidden({
        pathFilterActive: true,
        showAllConnections: false,
        isCrownJewel: true,
        nodeId: otherKms,
        targetJewelId: target,
      }),
    ).toBe(true)
  })

  it("keeps the target crown jewel visible in path focus", () => {
    expect(
      isPathFocusOffTargetCrownJewelHidden({
        pathFilterActive: true,
        showAllConnections: false,
        isCrownJewel: true,
        nodeId: target,
        targetJewelId: target,
      }),
    ).toBe(false)
  })

  it("reveals off-target crown jewels when blast radius is on", () => {
    expect(
      isPathFocusOffTargetCrownJewelHidden({
        pathFilterActive: true,
        showAllConnections: true,
        isCrownJewel: true,
        nodeId: otherKms,
        targetJewelId: target,
      }),
    ).toBe(false)
  })

  it("does not hide non-CJ resources", () => {
    expect(
      isPathFocusOffTargetCrownJewelHidden({
        pathFilterActive: true,
        showAllConnections: false,
        isCrownJewel: false,
        nodeId: "arn:aws:s3:::other-bucket",
        targetJewelId: target,
      }),
    ).toBe(false)
  })

  it("is a no-op outside path-filter mode", () => {
    expect(
      isPathFocusOffTargetCrownJewelHidden({
        pathFilterActive: false,
        showAllConnections: false,
        isCrownJewel: true,
        nodeId: otherKms,
        targetJewelId: target,
      }),
    ).toBe(false)
  })
})

describe("ensurePathTargetResource", () => {
  it("adds the selected RDS target when a rich override omits its terminal", () => {
    const target = "arn:aws:rds:eu-west-1:1:cluster:orders"
    const architecture = ensurePathTargetResource(
      { resources: [], computeServices: [{ id: "i-1" }] } as any,
      {
        nodeIds: ["i-1", target],
        crownJewelIds: [target],
        jewelName: "orders",
        pathNodes: [
          { id: "i-1", name: "app", type: "EC2Instance" },
          { id: target, name: "orders", type: "RDSCluster", tier: "crown_jewel" },
        ],
      },
    )

    expect(architecture.resources).toEqual([
      expect.objectContaining({
        id: target,
        name: "orders",
        type: "database",
        isCrownJewel: true,
      }),
    ])
  })
})

describe("resolvePathFocusTargetJewelId", () => {
  const S3 = "arn:aws:s3:::saferemediate-logs-745783559495"
  const KMS = "arn:aws:kms:eu-west-1:1:key/c3e064e4-af2d-447c"

  it("prefers crownJewelIds[0] over a later KMS crown_jewel hop", () => {
    expect(
      resolvePathFocusTargetJewelId({
        crownJewelIds: [S3],
        pathNodes: [
          { id: "role-1", tier: "identity" },
          { id: S3, tier: "crown_jewel" },
          { id: KMS, tier: "crown_jewel" },
        ],
      }),
    ).toBe(S3)
  })

  it("falls back to last crown_jewel hop when crownJewelIds is empty", () => {
    expect(
      resolvePathFocusTargetJewelId({
        pathNodes: [
          { id: S3, tier: "crown_jewel" },
          { id: KMS, tier: "identity" },
        ],
      }),
    ).toBe(S3)
  })
})
