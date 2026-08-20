const APPROVAL_SECRET_HEADER = "X-Cyntro-Approval-Secret"

export function approvalBackendHeaders(options?: { json?: boolean }): Record<string, string> {
  const secret = process.env.CYNTRO_APPROVAL_PROXY_SECRET?.trim()
  if (!secret) {
    throw new Error("IAM approval workflow is unavailable: proxy authentication is not configured")
  }

  return {
    ...(options?.json === false ? {} : { "Content-Type": "application/json" }),
    [APPROVAL_SECRET_HEADER]: secret,
  }
}

export function approvalWorkflowConfigured(): boolean {
  return Boolean(
    process.env.CYNTRO_APPROVAL_PROXY_SECRET?.trim() &&
    process.env.CYNTRO_OPERATOR_IDENTITY?.trim()
  )
}

export function approvalOperatorIdentity(): string {
  const identity = process.env.CYNTRO_OPERATOR_IDENTITY?.trim()
  if (!identity) {
    throw new Error("IAM approval workflow is unavailable: operator identity is not configured")
  }
  return identity
}
