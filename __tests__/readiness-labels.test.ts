/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest"

import { toNeo4jLabel } from "@/lib/readiness-labels"

describe("readiness label contract", () => {
  it("routes only labels supported by decision coverage", () => {
    expect(toNeo4jLabel("Lambda")).toBe("LambdaFunction")
    expect(toNeo4jLabel("LoadBalancer")).toBe("LoadBalancer")
    expect(toNeo4jLabel("EC2")).toBeNull()
    expect(toNeo4jLabel("TargetGroup")).toBe("TargetGroup")
    expect(toNeo4jLabel("EventBridge")).toBe("EventBridgeRule")
  })
})
