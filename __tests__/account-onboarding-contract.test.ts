import { afterEach, describe, expect, it, vi } from "vitest"
import {
  AccountOnboardingRequestError,
  parseOnboardingStatus,
  parseOnboardingSubmission,
  readOnboardingStatus,
  submitAndTrackOnboarding,
  submitOnboardingIntent,
} from "@/lib/account-onboarding"

function operation(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: "account-onboarding/v1",
    operation_id: "aon-1234567890abcdef12345678",
    request_id: "request-001",
    idempotency_key: "register-001",
    customer_id: "acme",
    account_id: "111111111111",
    operation_type: "REGISTER_METADATA",
    command_digest: `sha256:${"a".repeat(64)}`,
    requested_by: { identity_source: "identity_not_enforced", actor: null },
    status: "QUEUED",
    requested_at: "2026-09-15T10:00:00+00:00",
    updated_at: "2026-09-15T10:00:00+00:00",
    started_at: null,
    finished_at: null,
    attempt_count: 0,
    lifecycle_state: null,
    steps: [{
      step_id: "command.accepted",
      status: "QUEUED",
      recorded_at: "2026-09-15T10:00:00+00:00",
      detail: "Command persisted; execution has not started",
      evidence: {},
    }],
    failure: null,
    ...overrides,
  }
}

const expected = {
  customerId: "acme",
  accountId: "111111111111",
  operationType: "REGISTER_METADATA" as const,
  requestId: "request-001",
  idempotencyKey: "register-001",
}

describe("account-onboarding/v1 frontend boundary", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("accepts the exact response and all five honest operation states", () => {
    for (const status of ["QUEUED", "RUNNING", "SUCCEEDED", "BLOCKED", "FAILED"] as const) {
      const parsed = parseOnboardingSubmission({
        accepted: true,
        replayed: false,
        operation: operation({ status }),
      }, expected)
      expect(parsed.status).toBe(status)
    }
  })

  it("rejects wrong version, extra fields, contradictory replay flags, and cross-scope status", () => {
    const assertInvalid = (payload: unknown, scope = expected) => {
      expect(() => parseOnboardingSubmission(payload, scope)).toThrow(AccountOnboardingRequestError)
    }
    assertInvalid({ accepted: true, replayed: false, operation: operation({ contract_version: "account-onboarding/v2" }) })
    assertInvalid({ accepted: true, replayed: false, operation: { ...operation(), surprise: true } })
    assertInvalid({ accepted: true, replayed: true, operation: operation() })
    assertInvalid({ accepted: true, replayed: false, operation: operation({ account_id: "222222222222" }) })
    expect(() => parseOnboardingStatus(
      { operation: operation({ operation_type: "VALIDATE_ACCESS" }) },
      { ...expected, operationId: "aon-1234567890abcdef12345678" },
    )).toThrow(/different account or request/)
  })

  it("submits only through the same-origin proxy and preserves disabled access flags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      accepted: true,
      replayed: false,
      operation: operation(),
    }, { status: 202 }))
    vi.stubGlobal("fetch", fetchMock)

    await submitOnboardingIntent({
      ...expected,
      command: {
        display_name: "Production",
        read_enabled: false,
        verification_enabled: false,
        mutation_enabled: false,
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/proxy/admin/accounts/onboarding-operations")
    expect(String(url)).not.toMatch(/neptune|amazonaws|127\.0\.0\.1:8000/)
    expect(JSON.parse(String(init.body))).toMatchObject({
      contract_version: "account-onboarding/v1",
      operation_type: "REGISTER_METADATA",
      command: {
        read_enabled: false,
        verification_enabled: false,
        mutation_enabled: false,
      },
    })
  })

  it("polls the exact operation and scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      operation: operation({ status: "RUNNING" }),
    }))
    vi.stubGlobal("fetch", fetchMock)

    await readOnboardingStatus({
      customerId: "acme",
      accountId: "111111111111",
      operationType: "REGISTER_METADATA",
      operationId: "aon-1234567890abcdef12345678",
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/proxy/admin/accounts/onboarding-operations/aon-1234567890abcdef12345678?customer_id=acme&account_id=111111111111",
      expect.objectContaining({ cache: "no-store" }),
    )
  })

  it("treats commands-unavailable 503 as setup unavailable with no operation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      detail: {
        error: "account_onboarding_commands_unavailable",
        contract_version: "account-onboarding/v1",
      },
    }, { status: 503 })))

    await expect(submitOnboardingIntent({
      ...expected,
      command: { display_name: "Production" },
    })).rejects.toMatchObject({
      kind: "SETUP_UNAVAILABLE",
      status: 503,
    })
  })

  it("surfaces operator identity refusals without an operation or success", async () => {
    // The backend authenticates before it reports command availability, so an
    // enforced-identity deployment answers 401/403 ahead of any 503.
    for (const [status, detail] of [
      [401, "A trusted operator identity token is required"],
      [403, "operator-42 is scoped to tenant 'other' and cannot act on 'acme'"],
    ] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail }, { status })))

      await expect(submitOnboardingIntent({
        ...expected,
        command: { display_name: "Production" },
      })).rejects.toMatchObject({
        kind: "REQUEST_FAILED",
        status,
        message: detail,
        operation: null,
      })
    }
  })

  it("preserves a queue-unavailable FAILED operation and its exact identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      detail: {
        error: "account_onboarding_queue_unavailable",
        contract_version: "account-onboarding/v1",
        operation: operation({
          status: "FAILED",
          finished_at: "2026-09-15T10:00:01+00:00",
          failure: { code: "queue_unavailable", message: "Queue unavailable", retryable: false },
          steps: [{
            step_id: "command.enqueue",
            status: "FAILED",
            recorded_at: "2026-09-15T10:00:01+00:00",
            detail: "Command could not be queued",
            evidence: {},
          }],
        }),
      },
    }, { status: 503 })))

    await expect(submitOnboardingIntent({
      ...expected,
      command: { display_name: "Production" },
    })).rejects.toMatchObject({
      kind: "QUEUE_UNAVAILABLE",
      operation: {
        operation_id: "aon-1234567890abcdef12345678",
        status: "FAILED",
      },
    })
  })

  it("bounds permanently queued polling and returns the last exact operation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ accepted: true, replayed: false, operation: operation() }, { status: 202 }))
      .mockImplementation(() => Promise.resolve(Response.json({ operation: operation() })))
    vi.stubGlobal("fetch", fetchMock)

    await expect(submitAndTrackOnboarding({
      ...expected,
      command: { display_name: "Production" },
    }, vi.fn(), { pollIntervalMs: 0, maxPolls: 2 })).rejects.toMatchObject({
      kind: "POLL_TIMEOUT",
      operation: {
        operation_id: "aon-1234567890abcdef12345678",
        status: "QUEUED",
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("aborts a pending poll without issuing a status read", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ accepted: true, replayed: false, operation: operation() }, { status: 202 }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()
    const pending = submitAndTrackOnboarding({
      ...expected,
      command: { display_name: "Production" },
    }, vi.fn(), { signal: controller.signal })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
