import { afterEach, describe, expect, it } from "vitest"

import { approvalBackendHeaders } from "@/lib/server/approval-backend-auth"

const originalSecret = process.env.CYNTRO_APPROVAL_PROXY_SECRET

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.CYNTRO_APPROVAL_PROXY_SECRET
  } else {
    process.env.CYNTRO_APPROVAL_PROXY_SECRET = originalSecret
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
})
