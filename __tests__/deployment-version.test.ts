import { describe, expect, it } from "vitest"
import {
  deploymentHasChanged,
  normalizeDeploymentVersion,
} from "@/lib/deployment-version"

describe("deployment version guard", () => {
  it("normalizes non-deployment local values", () => {
    expect(normalizeDeploymentVersion(undefined)).toBeNull()
    expect(normalizeDeploymentVersion(" development ")).toBeNull()
    expect(normalizeDeploymentVersion("unknown")).toBeNull()
  })

  it("normalizes a deployed source revision", () => {
    expect(normalizeDeploymentVersion(" 0e934240 ")).toBe("0e934240")
  })

  it("reloads only when two real deployment revisions differ", () => {
    expect(deploymentHasChanged("old-sha", "new-sha")).toBe(true)
    expect(deploymentHasChanged("same-sha", "same-sha")).toBe(false)
    expect(deploymentHasChanged("development", "new-sha")).toBe(false)
    expect(deploymentHasChanged("old-sha", "development")).toBe(false)
  })
})
