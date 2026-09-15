import { afterEach, describe, expect, it, vi } from "vitest"
import {
  OnboardingApiError,
  canCancel,
  canRetry,
  createBinding,
  intentIdentity,
  listChildren,
  operationSchema,
  submitOperation,
  trackOperation,
} from "@/lib/account-onboarding"
import { organizationTree, previewScope } from "@/lib/organization-scope"
import { ACCOUNT, MANAGEMENT, TENANT, binding, discovery, operation } from "./fixtures/account-onboarding-v2"

const calls: Array<{ url: string; init?: RequestInit }> = []

function respond(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const { status = 200, body } = handler(url, init)
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  calls.length = 0
})

const identity = intentIdentity(undefined, "sig", "CONNECT_ACCOUNT")

describe("account-onboarding/v2 client", () => {
  it("submits a v2 command through the BFF and returns the validated operation", async () => {
    respond(() => ({ status: 202, body: { accepted: true, replayed: false, operation: operation() } }))
    const result = await submitOperation({ customerId: TENANT, accountId: ACCOUNT, operationType: "CONNECT_ACCOUNT", command: { display_name: "Payments" }, identity })
    expect(result.operation.status).toBe("QUEUED")
    expect(calls[0].url).toBe("/api/proxy/admin/accounts/onboarding/operations")
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body).toMatchObject({ contract_version: "account-onboarding/v2", customer_id: TENANT, account_id: ACCOUNT, idempotency_key: identity.idempotencyKey })
    expect(JSON.stringify(body)).not.toMatch(/external|role_arn|secret|token/i)
  })

  it("refuses an operation for a different account instead of rendering it", async () => {
    respond(() => ({ status: 202, body: { accepted: true, replayed: false, operation: operation({ account_id: "222222222222" }) } }))
    await expect(submitOperation({ customerId: TENANT, accountId: ACCOUNT, operationType: "CONNECT_ACCOUNT", command: {}, identity })).rejects.toMatchObject({ code: "INVALID_RESPONSE" })
  })

  it("refuses an unknown status rather than treating it as success", () => {
    expect(operationSchema.safeParse(operation({ status: "CONNECTED" })).success).toBe(false)
    expect(operationSchema.safeParse(operation({ contract_version: "account-onboarding/v1" })).success).toBe(false)
  })

  it("maps identity refusals and keeps a stored-but-unqueued operation", async () => {
    respond(() => ({ status: 401, body: { detail: { error: "OPERATOR_SESSION_REVOKED", message: "server text" } } }))
    const revoked = await submitOperation({ customerId: TENANT, accountId: ACCOUNT, operationType: "CONNECT_ACCOUNT", command: {}, identity }).catch((e) => e)
    expect(revoked).toBeInstanceOf(OnboardingApiError)
    expect(revoked.needsSignIn).toBe(true)
    expect(revoked.message).toBe("This session was signed out. Sign in again.")

    respond(() => ({ status: 503, body: { detail: { error: "account_onboarding_queue_unavailable", operation: operation() } } }))
    const queued = await submitOperation({ customerId: TENANT, accountId: ACCOUNT, operationType: "CONNECT_ACCOUNT", command: {}, identity }).catch((e) => e)
    expect(queued.operation?.operation_id).toBe(operation().operation_id)
  })

  it("returns a generated ExternalId only when the backend marks it display-once", async () => {
    respond(() => ({ status: 201, body: { binding: binding(), external_id: "x".repeat(40), external_id_display: "ONCE" } }))
    expect((await createBinding({ customerId: TENANT, accountId: ACCOUNT, purpose: "MEMBER_READ" })).externalIdOnce).toBe("x".repeat(40))
    respond(() => ({ status: 201, body: { binding: binding(), external_id: "leaked", external_id_display: "NOT_RETURNED" } }))
    expect((await createBinding({ customerId: TENANT, accountId: ACCOUNT, purpose: "MEMBER_READ" })).externalIdOnce).toBeNull()
  })

  it("reuses one request identity per intent", () => {
    const again = intentIdentity(identity, "sig", "CONNECT_ACCOUNT")
    expect(again).toBe(identity)
    expect(intentIdentity(identity, "other", "CONNECT_ACCOUNT").idempotencyKey).not.toBe(identity.idempotencyKey)
  })

  it("mirrors the backend cancel and retry rules", () => {
    const parse = (overrides: Record<string, unknown>) => operationSchema.parse(operation(overrides))
    expect(canCancel(parse({ status: "QUEUED" }))).toBe(true)
    expect(canCancel(parse({ status: "CANCEL_REQUESTED" }))).toBe(false)
    expect(canRetry(parse({ status: "SUCCEEDED" }))).toBe(false)
    expect(canRetry(parse({ status: "BLOCKED", failure: { code: "ASSUME_ROLE_DENIED", message: "m", retryable: true } }))).toBe(true)
    expect(canRetry(parse({ status: "FAILED", failure: { code: "HANDLER_FAILED", message: "m", retryable: false } }))).toBe(false)
    expect(canRetry(parse({ status: "PARTIALLY_SUCCEEDED" }))).toBe(true)
  })

  it("polls until the operation is terminal", async () => {
    let reads = 0
    respond(() => {
      reads += 1
      return { body: { operation: operation({ status: reads < 2 ? "RUNNING" : "SUCCEEDED" }), events: [] } }
    })
    const updates: string[] = []
    const done = await trackOperation(operationSchema.parse(operation()), ({ operation: op }) => updates.push(op.status), { intervalMs: 1 })
    expect(done.status).toBe("SUCCEEDED")
    expect(updates).toEqual(["RUNNING", "SUCCEEDED"])
  })

  it("refuses children that belong to another parent", async () => {
    const parent = operationSchema.parse(operation({ account_id: MANAGEMENT, operation_type: "CONNECT_ORGANIZATION_ACCOUNTS" }))
    respond(() => ({ body: { parent_operation_id: parent.operation_id, total: 1, hidden_by_account_scope: 0, children: [operation({ parent_operation_id: "aon-ffffffffffffffffffffffff" })] } }))
    await expect(listChildren(parent)).rejects.toMatchObject({ code: "INVALID_RESPONSE" })
  })
})

describe("organization scope preview", () => {
  const snapshot = () => {
    const raw = discovery()
    return { ...raw }
  }

  it("matches the worker's resolution: nested OUs, suspended skipped, exclusions and undiscovered ids", () => {
    const preview = previewScope(snapshot() as never, { organizationalUnitIds: ["ou-ab12-prod0001"], accountIds: ["555555555555"], excludedAccountIds: [] })
    expect(preview).toEqual({ active: ["111111111111", "222222222222"], suspended: ["333333333333"], notDiscovered: ["555555555555"] })
    expect(previewScope(snapshot() as never, { organizationalUnitIds: ["ou-ab12-prod0001"], accountIds: ["444444444444"], excludedAccountIds: ["222222222222"] }).active)
      .toEqual(["111111111111", "444444444444"])
    expect(previewScope(snapshot() as never, { organizationalUnitIds: [], accountIds: [], excludedAccountIds: [] }).active).toEqual([])
  })

  it("builds a tree rooted at the organization root", () => {
    const [root] = organizationTree(snapshot() as never)
    expect(root.kind).toBe("root")
    expect(root.children.map((node) => node.name)).toEqual(["Production", "Sandbox"])
    expect(root.children[0].children[0].accounts.map((account) => account.account_id)).toEqual(["222222222222", "333333333333"])
  })
})
