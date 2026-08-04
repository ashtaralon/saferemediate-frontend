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
