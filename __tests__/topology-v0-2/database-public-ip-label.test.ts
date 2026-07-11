import { describe, expect, it } from "vitest"
import { databasePublicIpExposureLabel } from "@/components/topology-v0-2/estate-edge-labels"

describe("databasePublicIpExposureLabel", () => {
  it("names public IPs on an engine port (not systems)", () => {
    expect(databasePublicIpExposureLabel(57, 5432)).toBe("57 public IPs on :5432")
    expect(databasePublicIpExposureLabel(1, 5432)).toBe("1 public IP on :5432")
  })

  it("falls back without a port", () => {
    expect(databasePublicIpExposureLabel(3, null)).toBe("3 public IPs on RDS")
  })

  it("returns null when there is no public-IP exposure", () => {
    expect(databasePublicIpExposureLabel(0, 5432)).toBeNull()
    expect(databasePublicIpExposureLabel(null as unknown as number, 5432)).toBeNull()
  })
})
