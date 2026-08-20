import { afterEach, describe, expect, it } from "vitest"

import {
  approvalBackendHeaders,
  approvalOperatorIdentity,
  approvalWorkflowConfigured,
} from "@/lib/server/approval-backend-auth"

const originalSecret = process.env.CYNTRO_APPROVAL_PROXY_SECRET
const originalIdentity = process.env.CYNTRO_OPERATOR_IDENTITY

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.CYNTRO_APPROVAL_PROXY_SECRET
  } else {
    process.env.CYNTRO_APPROVAL_PROXY_SECRET = originalSecret
  }
  if (originalIdentity === undefined) {
    delete process.env.CYNTRO_OPERATOR_IDENTITY
  } else {
    process.env.CYNTRO_OPERATOR_IDENTITY = originalIdentity
  }
})

describe("approvalBackendHeaders", () => {
  it("fails closed when the server-to-server secret is absent", () => {
    delete process.env.CYNTRO_APPROVAL_PROXY_SECRET
    expect(() => approvalBackendHeaders()).toThrow(/not configured/)
  })

  it("adds the secret without exposing it to client code", () => {
    process.env.CYNTRO_APPROVAL_PROXY_SECRET = "test-secret"
    expect(approvalBackendHeaders()).toEqual({
      "Content-Type": "application/json",
      "X-Cyntro-Approval-Secret": "test-secret",
    })
  })

  it("requires both the server secret and operator identity", () => {
    process.env.CYNTRO_APPROVAL_PROXY_SECRET = "test-secret"
    delete process.env.CYNTRO_OPERATOR_IDENTITY
    expect(approvalWorkflowConfigured()).toBe(false)
    expect(() => approvalOperatorIdentity()).toThrow(/identity is not configured/)

    process.env.CYNTRO_OPERATOR_IDENTITY = "c1-operator"
    expect(approvalWorkflowConfigured()).toBe(true)
    expect(approvalOperatorIdentity()).toBe("c1-operator")
  })
})
