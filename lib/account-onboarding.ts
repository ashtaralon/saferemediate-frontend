import { z } from "zod"

/**
 * account-onboarding/v2 client.
 *
 * Every response is validated before the UI renders it, and nothing is shown as
 * connected unless the backend operation says SUCCEEDED. Calls go through the
 * account admin BFF, which attaches the operator identity server-side.
 */
export const ACCOUNT_ONBOARDING_CONTRACT_VERSION = "account-onboarding/v2" as const
const BASE = "/api/proxy/admin/accounts/onboarding"

export const operationTypes = [
  "CONNECT_ACCOUNT",
  "VALIDATE_ACCESS",
  "DISCOVER_ORGANIZATION",
  "CONNECT_ORGANIZATION_ACCOUNTS",
  "OBSERVE_STACKSET",
  "OFFBOARD_ACCOUNT",
  "INSTALL_STACKSET",
] as const
export const operationStatuses = [
  "QUEUED",
  "RUNNING",
  "RETRY_SCHEDULED",
  "CANCEL_REQUESTED",
  "SUCCEEDED",
  "PARTIALLY_SUCCEEDED",
  "BLOCKED",
  "FAILED",
  "CANCELLED",
] as const
export const bindingPurposes = ["MEMBER_READ", "ORGANIZATION_MEMBER_READ", "ORGANIZATION_DISCOVERY"] as const
export const bindingStatuses = ["PENDING_ROLE", "PENDING_VALIDATION", "ACTIVE", "INVALID", "REVOKED"] as const

export type OperationType = typeof operationTypes[number]
export type OperationStatus = typeof operationStatuses[number]
export type BindingPurpose = typeof bindingPurposes[number]

const PENDING: ReadonlySet<OperationStatus> = new Set(["QUEUED", "RUNNING", "RETRY_SCHEDULED", "CANCEL_REQUESTED"])
const CANCELLABLE: ReadonlySet<OperationStatus> = new Set(["QUEUED", "RUNNING", "RETRY_SCHEDULED"])

const accountId = z.string().regex(/^\d{12}$/)
const timestamp = z.string().datetime({ offset: true })

const stepSchema = z.object({
  step_id: z.string().min(3).max(128),
  status: z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "ALREADY_APPLIED", "SKIPPED", "BLOCKED", "FAILED"]),
  recorded_at: timestamp,
  detail: z.string().max(400),
  evidence: z.record(z.string(), z.unknown()),
})

export const operationSchema = z.object({
  contract_version: z.literal(ACCOUNT_ONBOARDING_CONTRACT_VERSION),
  operation_id: z.string().regex(/^aon-[0-9a-f]{24}$/),
  request_id: z.string().min(3).max(128),
  idempotency_key: z.string().min(3).max(128),
  customer_id: z.string().min(3).max(64),
  account_id: accountId,
  operation_type: z.enum(operationTypes),
  command: z.record(z.string(), z.unknown()),
  requested_by: z.object({ identity_source: z.string(), actor: z.string(), tenant_id: z.string(), roles: z.array(z.string()) }).partial(),
  status: z.enum(operationStatuses),
  requested_at: timestamp,
  updated_at: timestamp,
  started_at: timestamp.nullable(),
  finished_at: timestamp.nullable(),
  attempt_count: z.number().int().nonnegative(),
  next_attempt_at: timestamp.nullable(),
  cancel_requested: z.boolean(),
  parent_operation_id: z.string().nullable(),
  retry_of: z.string().nullable(),
  child_operation_count: z.number().int().nonnegative(),
  lifecycle_state: z.string().nullable(),
  steps: z.array(stepSchema).max(128),
  failure: z.object({ code: z.string().min(3).max(128), message: z.string().max(400), retryable: z.boolean() }).nullable(),
  result: z.record(z.string(), z.unknown()),
})

export const eventSchema = z.object({
  operation_id: z.string(),
  sequence: z.number().int(),
  at: timestamp,
  from_status: z.enum(operationStatuses).nullable(),
  to_status: z.enum(operationStatuses),
  reason_code: z.string(),
  actor: z.string(),
  attempt: z.number().int(),
})

export const bindingSchema = z.object({
  customer_id: z.string(),
  account_id: accountId,
  purpose: z.enum(bindingPurposes),
  binding_version: z.number().int().positive(),
  status: z.enum(bindingStatuses),
  external_id_source: z.enum(["GENERATED", "CUSTOMER_PROVIDED"]),
  role_configured: z.boolean(),
  role_account_id: z.string().nullable(),
  created_by: z.string(),
  created_at: timestamp,
  updated_at: timestamp,
  last_validated_at: timestamp.nullable(),
  last_validation_code: z.string().nullable(),
  activated_by_operation_id: z.string().nullable(),
  source_binding_account_id: z.string().nullable(),
  revoked_at: timestamp.nullable(),
})

const discoverySchema = z.object({
  discovery_id: z.string().regex(/^aod-[0-9a-f]{24}$/),
  operation_id: z.string(),
  organization_id: z.string(),
  management_account_id: accountId,
  discovered_at: z.string(),
  truncated: z.boolean(),
  accounts: z.array(z.object({ account_id: accountId, name: z.string(), status: z.string(), parent_id: z.string(), ou_path: z.string() })),
  organizational_units: z.array(z.object({ organizational_unit_id: z.string(), name: z.string(), parent_id: z.string(), path: z.string() })),
})

const planSchema = z.object({
  mode: z.enum(["single_account", "organization"]),
  execution_owner: z.literal("CUSTOMER"),
  templates: z.array(z.object({
    template_id: z.string(),
    path: z.string(),
    sha256: z.string(),
    template_version: z.string(),
    parameters: z.array(z.object({ name: z.string(), value: z.string(), value_source: z.string().optional() })),
  })),
  steps: z.array(z.object({ step_id: z.string(), title: z.string(), commands: z.array(z.string()), verification: z.string().optional() })),
  rollback: z.array(z.object({ step_id: z.string(), commands: z.array(z.string()), note: z.string().optional() })),
})

export const operatorStateSchema = z.object({
  mode: z.enum(["HOSTED_OIDC", "CUSTOMER_IDP_ALB"]),
  configured: z.boolean(),
  signed_in: z.boolean(),
  verified: z.enum(["VERIFIED", "NOT_SIGNED_IN", "REFUSED", "UNAVAILABLE"]),
  reason: z.string().nullable(),
  operator: z.object({
    display_name: z.string(),
    email: z.string(),
    tenant_id: z.string(),
    roles: z.array(z.string()),
    tenant_wide: z.boolean(),
    account_scope: z.array(z.string()),
    permissions: z.object({ read: z.boolean(), submit: z.boolean(), cancel: z.boolean() }),
    session: z.object({ revocable: z.boolean(), expires_at: z.string().nullable() }),
  }).nullable(),
})

export type Operation = z.infer<typeof operationSchema>
export type OperationEvent = z.infer<typeof eventSchema>
export type Binding = z.infer<typeof bindingSchema>
export type Discovery = z.infer<typeof discoverySchema>
export type InstallationPlan = z.infer<typeof planSchema>
export type OperatorState = z.infer<typeof operatorStateSchema>

export class OnboardingApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly code: string,
    public readonly operation: Operation | null = null,
  ) {
    super(message)
    this.name = "OnboardingApiError"
  }

  get needsSignIn(): boolean {
    return this.status === 401
  }
}

const MESSAGES: Record<string, string> = {
  OPERATOR_IDENTITY_REQUIRED: "Sign in with your organization's identity provider to manage AWS accounts.",
  OPERATOR_IDENTITY_INVALID: "Your sign-in could not be verified. Sign in again.",
  OPERATOR_SESSION_REVOKED: "This session was signed out. Sign in again.",
  OPERATOR_NOT_AUTHORIZED: "Your role does not allow this account action.",
  TENANT_SCOPE_MISMATCH: "This installation serves a different customer.",
  OPERATOR_SESSION_STATE_UNAVAILABLE: "Sign-in state could not be verified right now. Nothing was changed.",
  CROSS_SITE_REQUEST_REFUSED: "This change must be made from the Cyntro console.",
  account_onboarding_commands_unavailable: "Account onboarding is not installed for this deployment. Nothing was changed.",
  account_onboarding_queue_unavailable: "The request was saved and will be queued automatically when the queue recovers.",
  account_onboarding_store_unavailable: "Account onboarding storage is unavailable. Nothing was changed.",
  account_onboarding_key_unavailable: "The onboarding key is unavailable. Nothing was changed.",
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function errorFrom(status: number, payload: unknown): OnboardingApiError {
  const detail = payload && typeof payload === "object" && "detail" in payload ? (payload as { detail: unknown }).detail : payload
  const record = detail && typeof detail === "object" ? detail as Record<string, unknown> : {}
  const code = typeof record.error === "string" ? record.error : `HTTP_${status}`
  const serverMessage = typeof record.message === "string" ? record.message : typeof detail === "string" ? detail : ""
  const parsedOperation = operationSchema.safeParse(record.operation)
  return new OnboardingApiError(MESSAGES[code] || serverMessage || `Account onboarding returned ${status}.`, status, code, parsedOperation.success ? parsedOperation.data : null)
}

async function call<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init, headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } })
  const payload = await readJson(response)
  if (!response.ok) throw errorFrom(response.status, payload)
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new OnboardingApiError("Account onboarding returned a response this console does not understand. Nothing was marked complete.", response.status, "INVALID_RESPONSE")
  }
  return parsed.data
}

function query(values: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item))
    else if (value !== undefined) params.set(key, value)
  }
  return params.toString()
}

export async function readOperatorState(customerId?: string | null, signal?: AbortSignal): Promise<OperatorState> {
  const suffix = customerId ? `?${query({ customer_id: customerId })}` : ""
  return call(operatorStateSchema, `/api/auth/operator/session${suffix}`, { signal })
}

export async function signOutOperator(): Promise<{ signed_in: false; revocation: string; end_session_url: string | null }> {
  const schema = z.object({ signed_in: z.literal(false), revocation: z.string(), end_session_url: z.string().nullable() })
  const response = await fetch("/api/auth/operator/logout", { method: "POST", cache: "no-store" })
  const payload = await readJson(response)
  const parsed = schema.safeParse(payload)
  if (!parsed.success) throw errorFrom(response.status, payload)
  return parsed.data
}

export async function listBindings(customerId: string): Promise<Binding[]> {
  const result = await call(z.object({ bindings: z.array(bindingSchema) }), `${BASE}/access-bindings?${query({ customer_id: customerId })}`)
  return result.bindings
}

export async function createBinding(input: { customerId: string; accountId: string; purpose: BindingPurpose }): Promise<{ binding: Binding; externalIdOnce: string | null }> {
  const result = await call(
    z.object({ binding: bindingSchema, external_id: z.string().nullable(), external_id_display: z.enum(["ONCE", "NOT_RETURNED"]) }),
    `${BASE}/access-bindings`,
    {
      method: "POST",
      body: JSON.stringify({
        contract_version: ACCOUNT_ONBOARDING_CONTRACT_VERSION,
        customer_id: input.customerId,
        account_id: input.accountId,
        purpose: input.purpose,
        external_id_source: "GENERATED",
      }),
    },
  )
  return { binding: result.binding, externalIdOnce: result.external_id_display === "ONCE" ? result.external_id : null }
}

export async function attachRole(input: { customerId: string; accountId: string; purpose: BindingPurpose; roleArn?: string; roleName?: string }): Promise<Binding> {
  const result = await call(z.object({ binding: bindingSchema }), `${BASE}/access-bindings/role`, {
    method: "POST",
    body: JSON.stringify({
      contract_version: ACCOUNT_ONBOARDING_CONTRACT_VERSION,
      customer_id: input.customerId,
      account_id: input.accountId,
      purpose: input.purpose,
      ...(input.roleName ? { role_name: input.roleName } : { role_arn: input.roleArn }),
    }),
  })
  return result.binding
}

export interface IntentIdentity {
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

/** One request identity per intent, so a double click or a lost response replays instead of duplicating. */
export function intentIdentity(current: IntentIdentity | undefined, signature: string, operationType: OperationType): IntentIdentity {
  if (current?.signature === signature) return current
  const prefix = operationType.toLowerCase().replaceAll("_", "-")
  return { signature, requestId: correlationId(`request-${prefix}`), idempotencyKey: correlationId(prefix) }
}

export async function submitOperation(input: {
  customerId: string
  accountId: string
  operationType: OperationType
  command: Record<string, unknown>
  identity: IntentIdentity
}): Promise<{ operation: Operation; replayed: boolean }> {
  try {
    const result = await call(z.object({ accepted: z.boolean(), replayed: z.boolean(), operation: operationSchema }), `${BASE}/operations`, {
      method: "POST",
      body: JSON.stringify({
        contract_version: ACCOUNT_ONBOARDING_CONTRACT_VERSION,
        request_id: input.identity.requestId,
        idempotency_key: input.identity.idempotencyKey,
        customer_id: input.customerId,
        account_id: input.accountId,
        operation_type: input.operationType,
        command: input.command,
      }),
    })
    assertScope(result.operation, input.customerId, input.accountId, input.operationType)
    return { operation: result.operation, replayed: result.replayed }
  } catch (error) {
    if (error instanceof OnboardingApiError && error.operation) assertScope(error.operation, input.customerId, input.accountId, input.operationType)
    throw error
  }
}

function assertScope(operation: Operation, customerId: string, account: string, operationType?: OperationType): void {
  if (operation.customer_id !== customerId || operation.account_id !== account || (operationType && operation.operation_type !== operationType)) {
    throw new OnboardingApiError("The onboarding service returned an operation for a different account or request.", null, "INVALID_RESPONSE")
  }
}

export async function readOperation(customerId: string, account: string, operationId: string, signal?: AbortSignal): Promise<{ operation: Operation; events: OperationEvent[] }> {
  const result = await call(z.object({ operation: operationSchema, events: z.array(eventSchema) }), `${BASE}/operations/${encodeURIComponent(operationId)}?${query({ customer_id: customerId, account_id: account })}`, { signal })
  assertScope(result.operation, customerId, account)
  return result
}

export async function listOperations(customerId: string, account?: string): Promise<Operation[]> {
  const result = await call(z.object({ operations: z.array(operationSchema) }), `${BASE}/operations?${query({ customer_id: customerId, account_id: account, limit: "50" })}`)
  return result.operations
}

export async function cancelOperation(operation: Operation): Promise<Operation> {
  const result = await call(z.object({ operation: operationSchema }), `${BASE}/operations/${encodeURIComponent(operation.operation_id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ contract_version: ACCOUNT_ONBOARDING_CONTRACT_VERSION, customer_id: operation.customer_id, account_id: operation.account_id }),
  })
  assertScope(result.operation, operation.customer_id, operation.account_id)
  return result.operation
}

export async function retryOperation(operation: Operation): Promise<Operation> {
  const result = await call(z.object({ accepted: z.boolean(), replayed: z.boolean(), operation: operationSchema }), `${BASE}/operations/${encodeURIComponent(operation.operation_id)}/retry`, {
    method: "POST",
    body: JSON.stringify({
      contract_version: ACCOUNT_ONBOARDING_CONTRACT_VERSION,
      customer_id: operation.customer_id,
      account_id: operation.account_id,
      request_id: `retry-${operation.operation_id}`,
    }),
  })
  assertScope(result.operation, operation.customer_id, operation.account_id)
  return result.operation
}

export async function readDiscovery(customerId: string, managementAccountId: string, discoveryId: string): Promise<Discovery> {
  const result = await call(z.object({ discovery: discoverySchema }), `${BASE}/discoveries/${encodeURIComponent(discoveryId)}?${query({ customer_id: customerId, account_id: managementAccountId })}`)
  if (result.discovery.management_account_id !== managementAccountId) {
    throw new OnboardingApiError("The discovery belongs to a different management account.", null, "INVALID_RESPONSE")
  }
  return result.discovery
}

export async function listChildren(parent: Operation, offset = 0): Promise<{ total: number; children: Operation[]; hiddenByAccountScope: number }> {
  const result = await call(
    z.object({ parent_operation_id: z.string(), total: z.number().int(), children: z.array(operationSchema), hidden_by_account_scope: z.number().int() }),
    `${BASE}/operations/${encodeURIComponent(parent.operation_id)}/children?${query({ customer_id: parent.customer_id, account_id: parent.account_id, offset: String(offset), limit: "200" })}`,
  )
  if (result.parent_operation_id !== parent.operation_id || result.children.some((child) => child.parent_operation_id !== parent.operation_id || child.customer_id !== parent.customer_id)) {
    throw new OnboardingApiError("The onboarding service returned child operations for a different request.", null, "INVALID_RESPONSE")
  }
  return { total: result.total, children: result.children, hiddenByAccountScope: result.hidden_by_account_scope }
}

export async function readInstallationPlan(input: { customerId: string; accountId: string; mode: "single_account" | "organization"; regions: string[]; organizationalUnitIds?: string[] }): Promise<InstallationPlan> {
  return call(planSchema, `${BASE}/installation-plans/${input.mode}?${query({
    customer_id: input.customerId,
    account_id: input.accountId,
    regions: input.regions,
    organizational_unit_ids: input.organizationalUnitIds,
  })}`)
}

export function isPending(status: OperationStatus): boolean {
  return PENDING.has(status)
}

export function canCancel(operation: Operation): boolean {
  return CANCELLABLE.has(operation.status)
}

/** Mirrors the backend rule; the server still decides. */
export function canRetry(operation: Operation): boolean {
  if (isPending(operation.status) || operation.status === "SUCCEEDED") return false
  return operation.status === "PARTIALLY_SUCCEEDED" || Boolean(operation.failure?.retryable)
}

export function failureText(operation: Operation): string {
  if (operation.failure) return operation.failure.message
  return operation.steps.at(-1)?.detail || ""
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Operation cancelled", "AbortError"))
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

/** Poll until the operation is terminal, reporting every read. Stops (without failing the operation) after maxPolls. */
export async function trackOperation(
  operation: Operation,
  onUpdate: (update: { operation: Operation; events: OperationEvent[] }) => void,
  options: { signal?: AbortSignal; intervalMs?: number; maxPolls?: number } = {},
): Promise<Operation> {
  let current = operation
  const interval = options.intervalMs ?? 1500
  const maxPolls = options.maxPolls ?? 160
  for (let poll = 0; isPending(current.status) && poll < maxPolls; poll += 1) {
    await wait(interval, options.signal)
    const read = await readOperation(current.customer_id, current.account_id, current.operation_id, options.signal)
    current = read.operation
    onUpdate(read)
  }
  return current
}
