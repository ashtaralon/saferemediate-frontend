import { describe, expect, it } from "vitest"

import { toNeo4jLabel } from "@/lib/readiness-labels"

describe("toNeo4jLabel", () => {
  it("maps resource types backed by the decision-coverage matrix", () => {
    expect(toNeo4jLabel("Lambda")).toBe("LambdaFunction")
    expect(toNeo4jLabel("S3")).toBe("S3Bucket")
  })

  it("does not send unsupported display-only types to the backend", () => {
    expect(toNeo4jLabel("EC2")).toBeNull()
    expect(toNeo4jLabel("EC2Instance")).toBeNull()
    expect(toNeo4jLabel("UnknownService")).toBeNull()
  })
})
