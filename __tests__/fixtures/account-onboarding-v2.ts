/** Contract-shaped account-onboarding/v2 records for unit tests (shapes from services/account_onboarding_commands.py). */
export const TENANT = "tenant-a"
export const ACCOUNT = "111111111111"
export const MANAGEMENT = "999999999999"

export function operation(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: "account-onboarding/v2",
    operation_id: "aon-0123456789abcdef01234567",
    request_id: "request-connect-1",
    idempotency_key: "connect-1",
    customer_id: TENANT,
    account_id: ACCOUNT,
    operation_type: "CONNECT_ACCOUNT",
    command: { display_name: "Payments", environment: "PRODUCTION", regions: ["eu-west-1"], tags: {}, account_id: ACCOUNT },
    command_digest: `sha256:${"a".repeat(64)}`,
    requested_by: { identity_source: "bearer_verified", actor: "https://idp.example.test#op-1", tenant_id: TENANT, roles: ["OPERATOR"] },
    status: "QUEUED",
    requested_at: "2026-09-15T10:00:00+00:00",
    updated_at: "2026-09-15T10:00:00+00:00",
    started_at: null,
    finished_at: null,
    attempt_count: 0,
    next_attempt_at: null,
    cancel_requested: false,
    parent_operation_id: null,
    retry_of: null,
    child_operation_count: 0,
    lifecycle_state: null,
    steps: [],
    failure: null,
    result: {},
    ...overrides,
  }
}

export function binding(overrides: Record<string, unknown> = {}) {
  return {
    customer_id: TENANT,
    account_id: ACCOUNT,
    purpose: "MEMBER_READ",
    binding_version: 1,
    status: "PENDING_ROLE",
    external_id_source: "GENERATED",
    role_configured: false,
    role_account_id: null,
    created_by: "https://idp.example.test#op-1",
    created_at: "2026-09-15T10:00:00+00:00",
    updated_at: "2026-09-15T10:00:00+00:00",
    last_validated_at: null,
    last_validation_code: null,
    activated_by_operation_id: null,
    source_binding_account_id: null,
    revoked_at: null,
    ...overrides,
  }
}

export function discovery() {
  return {
    discovery_id: "aod-0123456789abcdef01234567",
    operation_id: "aon-aaaaaaaaaaaaaaaaaaaaaaaa",
    organization_id: "o-abcdefghij",
    management_account_id: MANAGEMENT,
    discovered_at: "2026-09-15T10:00:00+00:00",
    truncated: false,
    organizational_units: [
      { organizational_unit_id: "ou-ab12-prod0001", name: "Production", parent_id: "r-ab12", path: "/Root/Production" },
      { organizational_unit_id: "ou-ab12-apps0001", name: "Apps", parent_id: "ou-ab12-prod0001", path: "/Root/Production/Apps" },
      { organizational_unit_id: "ou-ab12-sand0001", name: "Sandbox", parent_id: "r-ab12", path: "/Root/Sandbox" },
    ],
    accounts: [
      { account_id: MANAGEMENT, name: "management", status: "ACTIVE", parent_id: "r-ab12", ou_path: "/Root" },
      { account_id: "111111111111", name: "payments", status: "ACTIVE", parent_id: "ou-ab12-prod0001", ou_path: "/Root/Production" },
      { account_id: "222222222222", name: "checkout", status: "ACTIVE", parent_id: "ou-ab12-apps0001", ou_path: "/Root/Production/Apps" },
      { account_id: "333333333333", name: "legacy", status: "SUSPENDED", parent_id: "ou-ab12-apps0001", ou_path: "/Root/Production/Apps" },
      { account_id: "444444444444", name: "sandbox", status: "ACTIVE", parent_id: "ou-ab12-sand0001", ou_path: "/Root/Sandbox" },
    ],
  }
}

export function operatorState(overrides: { roles?: string[]; submit?: boolean; read?: boolean; verified?: string; mode?: string } = {}) {
  const verified = overrides.verified ?? "VERIFIED"
  return {
    mode: overrides.mode ?? "HOSTED_OIDC",
    configured: true,
    signed_in: verified !== "NOT_SIGNED_IN",
    verified,
    reason: null,
    operator: verified === "VERIFIED" ? {
      display_name: "QA Operator",
      email: "qa-operator@example.test",
      tenant_id: TENANT,
      roles: overrides.roles ?? ["OPERATOR"],
      tenant_wide: true,
      account_scope: [],
      permissions: { read: overrides.read ?? true, submit: overrides.submit ?? true, cancel: overrides.submit ?? true },
      session: { revocable: true, expires_at: "2026-09-15T11:00:00+00:00" },
    } : null,
  }
}
