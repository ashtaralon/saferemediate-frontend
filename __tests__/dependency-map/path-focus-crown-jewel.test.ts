import { describe, it, expect } from "vitest"
import { isPathFocusOffTargetCrownJewelHidden } from "@/components/dependency-map/traffic-flow-map"

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
