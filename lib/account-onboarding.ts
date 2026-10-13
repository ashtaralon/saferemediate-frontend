import { z } from "zod"

export const ACCOUNT_ONBOARDING_CONTRACT_VERSION = "account-onboarding/v1" as const

export const accountOnboardingOperationTypes = [
  "REGISTER_METADATA",
  "VALIDATE_ACCESS",
  "INSTALL_STACKSET",
] as const

export const accountOnboardingStatuses = [
  "QUEUED",
  "RUNNING",
  "BLOCKED",
  "FAILED",
  "SUCCEEDED",
] as const

export type AccountOnboardingOperationType = typeof accountOnboardingOperationTypes[number]
export type AccountOnboardingStatus = typeof accountOnboardingStatuses[number]

export interface SavedOnboardingIntentIdentity {
  signature: string
  requestId: string
  idempotencyKey: string
}

function correlationId(prefix: string): string {
  const value = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${value}`
}

export function reuseOnboardingIntentIdentity(
  current: SavedOnboardingIntentIdentity | undefined,
  signature: string,
  operationType: AccountOnboardingOperationType,
): SavedOnboardingIntentIdentity {
  if (current?.signature === signature) return current
  return {
    signature,
    requestId: correlationId("request"),
    idempotencyKey: correlationId(operationType === "REGISTER_METADATA" ? "register" : "validate"),
  }
}

const lifecycleStates = [
  "INSTALLING",
  "PROVISIONING",
  "BOOTSTRAPPING",
  "BACKFILLING",
  "SHADOW",
  "VALIDATION_HELD",
  "READY",
  "ACTIVE",
  "OFFBOARDED",
] as const

const receiptEvidenceSchema = z.object({
  checks_total: z.number().int().nonnegative().optional(),
  checks_passed: z.number().int().nonnegative().optional(),
  checks_failed: z.number().int().nonnegative().optional(),
  check_ids: z.array(z.string().max(128)).max(32).optional(),
  failed_check_ids: z.array(z.string().max(128)).max(32).optional(),
  lifecycle_state: z.string().max(256).optional(),
  mutation_enabled: z.boolean().optional(),
  read_enabled: z.boolean().optional(),
  verification_enabled: z.boolean().optional(),
  receipt_id: z.string().max(256).optional(),
  source: z.string().max(256).optional(),
  verified_at: z.string().max(256).optional(),
}).strict()

const stepReceiptSchema = z.object({
  step_id: z.string().min(3).max(128),
  status: z.enum(["QUEUED", "RUNNING", "BLOCKED", "FAILED", "SUCCEEDED", "ALREADY_APPLIED"]),
  recorded_at: z.string().datetime({ offset: true }),
  detail: z.string().max(400),
  evidence: receiptEvidenceSchema,
}).strict()

const operationFailureSchema = z.object({
  code: z.string().min(3).max(128),
  message: z.string().max(400),
  retryable: z.boolean(),
}).strict()

export const accountOnboardingOperationSchema = z.object({
  contract_version: z.literal(ACCOUNT_ONBOARDING_CONTRACT_VERSION),
  operation_id: z.string().min(3).max(128),
  request_id: z.string().min(3).max(128),
  idempotency_key: z.string().min(3).max(128),
  customer_id: z.string().min(3).max(64),
  account_id: z.string().regex(/^\d{12}$/),
  operation_type: z.enum(accountOnboardingOperationTypes),
  command_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  requested_by: z.record(z.string(), z.unknown()),
  status: z.enum(accountOnboardingStatuses),
  requested_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  started_at: z.string().datetime({ offset: true }).nullable(),
  finished_at: z.string().datetime({ offset: true }).nullable(),
  attempt_count: z.number().int().nonnegative(),
  lifecycle_state: z.enum(lifecycleStates).nullable(),
  steps: z.array(stepReceiptSchema).max(128),
  failure: operationFailureSchema.nullable(),
}).strict()

const submissionSchema = z.object({
  accepted: z.boolean(),
  replayed: z.boolean(),
  operation: accountOnboardingOperationSchema,
}).strict().superRefine((value, context) => {
  if (value.accepted === value.replayed) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "exactly one of accepted or replayed must be true",
    })
  }
})

const statusResponseSchema = z.object({
  operation: accountOnboardingOperationSchema,
}).strict()

export type AccountOnboardingOperation = z.infer<typeof accountOnboardingOperationSchema>

export interface ExpectedOnboardingOperation {
  customerId: string
  accountId: string
  operationType: AccountOnboardingOperationType
  operationId?: string
  requestId?: string
  idempotencyKey?: string
}

export interface AccountOnboardingIntent extends ExpectedOnboardingOperation {
  requestId: string
  idempotencyKey: string
  command: Record<string, unknown>
}

export class AccountOnboardingRequestError extends Error {
  constructor(
    message: string,
    public readonly kind: "SETUP_UNAVAILABLE" | "QUEUE_UNAVAILABLE" | "POLL_TIMEOUT" | "REQUEST_FAILED" | "INVALID_RESPONSE",
    public readonly status: number | null,
    public readonly operation: AccountOnboardingOperation | null = null,
  ) {
    super(message)
    this.name = "AccountOnboardingRequestError"
  }
}

function assertExpectedOperation(
  operation: AccountOnboardingOperation,
  expected: ExpectedOnboardingOperation,
): AccountOnboardingOperation {
  const mismatch =
    operation.customer_id !== expected.customerId ||
    operation.account_id !== expected.accountId ||
    operation.operation_type !== expected.operationType ||
    (expected.operationId !== undefined && operation.operation_id !== expected.operationId) ||
    (expected.requestId !== undefined && operation.request_id !== expected.requestId) ||
    (expected.idempotencyKey !== undefined && operation.idempotency_key !== expected.idempotencyKey)
  if (mismatch) {
    throw new AccountOnboardingRequestError(
      "The onboarding service returned a status from a different account or request.",
      "INVALID_RESPONSE",
      null,
    )
  }
  return operation
}

export function parseOnboardingSubmission(
  payload: unknown,
  expected: ExpectedOnboardingOperation,
): AccountOnboardingOperation {
  const parsed = submissionSchema.safeParse(payload)
  if (!parsed.success) {
    throw new AccountOnboardingRequestError(
      "The onboarding service returned an invalid response. Nothing was marked complete.",
      "INVALID_RESPONSE",
      null,
    )
  }
  return assertExpectedOperation(parsed.data.operation, expected)
}

export function parseOnboardingStatus(
  payload: unknown,
  expected: ExpectedOnboardingOperation,
): AccountOnboardingOperation {
  const parsed = statusResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new AccountOnboardingRequestError(
      "The onboarding service returned an invalid status. Nothing was marked complete.",
      "INVALID_RESPONSE",
      null,
    )
  }
  return assertExpectedOperation(parsed.data.operation, expected)
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function failureMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback
  const detail = "detail" in payload ? payload.detail : payload
  if (typeof detail === "string" && detail.trim()) return detail
  if (detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string") {
    return detail.message
  }
  return fallback
}

export async function submitOnboardingIntent(
  intent: AccountOnboardingIntent,
  signal?: AbortSignal,
): Promise<AccountOnboardingOperation> {
  const response = await fetch("/api/proxy/admin/accounts/onboarding-operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contract_version: ACCOUNT_ONBOARDING_CONTRACT_VERSION,
      request_id: intent.requestId,
      idempotency_key: intent.idempotencyKey,
      customer_id: intent.customerId,
      account_id: intent.accountId,
      operation_type: intent.operationType,
      command: intent.command,
    }),
    signal,
  })
  const payload = await readPayload(response)
  if (!response.ok) {
    if (response.status === 503) {
      if (payload && typeof payload === "object" && "detail" in payload) {
        const detail = payload.detail
        if (detail && typeof detail === "object" && "error" in detail && detail.error === "account_onboarding_queue_unavailable" && "operation" in detail) {
          const parsed = accountOnboardingOperationSchema.safeParse(detail.operation)
          if (parsed.success) {
            const operation = assertExpectedOperation(parsed.data, intent)
            throw new AccountOnboardingRequestError(
              "The onboarding request was stored but could not be queued. It was recorded as failed.",
              "QUEUE_UNAVAILABLE",
              response.status,
              operation,
            )
          }
        }
      }
      throw new AccountOnboardingRequestError(
        "Account setup is unavailable right now. No successful registration or validation was recorded.",
        "SETUP_UNAVAILABLE",
        response.status,
      )
    }
    throw new AccountOnboardingRequestError(
      failureMessage(payload, `Account setup request returned ${response.status}.`),
      "REQUEST_FAILED",
      response.status,
    )
  }
  return parseOnboardingSubmission(payload, intent)
}

export async function readOnboardingStatus(
  expected: Required<Pick<ExpectedOnboardingOperation, "customerId" | "accountId" | "operationType" | "operationId">>,
  signal?: AbortSignal,
): Promise<AccountOnboardingOperation> {
  const query = new URLSearchParams({
    customer_id: expected.customerId,
    account_id: expected.accountId,
  })
  const response = await fetch(
    `/api/proxy/admin/accounts/onboarding-operations/${encodeURIComponent(expected.operationId)}?${query}`,
    { cache: "no-store", signal },
  )
  const payload = await readPayload(response)
  if (!response.ok) {
    if (response.status === 503) {
      throw new AccountOnboardingRequestError(
        "Account setup is unavailable right now. The operation status could not be verified.",
        "SETUP_UNAVAILABLE",
        response.status,
      )
    }
    throw new AccountOnboardingRequestError(
      failureMessage(payload, `Account setup status returned ${response.status}.`),
      "REQUEST_FAILED",
      response.status,
    )
  }
  return parseOnboardingStatus(payload, expected)
}

export function isOnboardingPending(status: AccountOnboardingStatus): boolean {
  return status === "QUEUED" || status === "RUNNING"
}

export function operationFailureText(operation: AccountOnboardingOperation): string {
  return operation.failure?.message || operation.steps.at(-1)?.detail || "The operation did not complete."
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Operation cancelled", "AbortError"))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException("Operation cancelled", "AbortError"))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export async function submitAndTrackOnboarding(
  intent: AccountOnboardingIntent,
  onUpdate: (operation: AccountOnboardingOperation) => void,
  options: { signal?: AbortSignal; pollIntervalMs?: number; maxPolls?: number } = {},
): Promise<AccountOnboardingOperation> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_250
  const maxPolls = options.maxPolls ?? 48
  let operation = await submitOnboardingIntent(intent, options.signal)
  onUpdate(operation)
  for (let poll = 0; isOnboardingPending(operation.status) && poll < maxPolls; poll += 1) {
    await wait(pollIntervalMs, options.signal)
    operation = await readOnboardingStatus({
      customerId: intent.customerId,
      accountId: intent.accountId,
      operationType: intent.operationType,
      operationId: operation.operation_id,
    }, options.signal)
    onUpdate(operation)
  }
  if (isOnboardingPending(operation.status)) {
    throw new AccountOnboardingRequestError(
      `Automatic status checks paused while operation ${operation.operation_id} is still ${operation.status.toLowerCase()}.`,
      "POLL_TIMEOUT",
      null,
      operation,
    )
  }
  return operation
}
