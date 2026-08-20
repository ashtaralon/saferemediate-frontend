const IAM_ROLE_MISSING = /NoSuchEntity|cannot be found|GetRole/i
const AWS_READ_AUTH = /UnauthorizedOperation|AccessDenied|not authorized|DescribeSecurityGroups/i
const INTERNAL_CONFIGURATION = /\/api\/collectors\/|SHARED_ROLES_[A-Z_]+|Render env|environment variable|proxy authentication/i

export function customerSafeError(
  value: unknown,
  fallback = 'This operation could not be completed. No change was made.',
): string {
  const message = typeof value === 'string'
    ? value.trim()
    : value instanceof Error
      ? value.message.trim()
      : ''
  if (!message) return fallback
  if (IAM_ROLE_MISSING.test(message)) {
    return 'The live IAM role could not be verified. It may have been removed or renamed since inventory was collected. Refresh IAM inventory and try again. No change was made.'
  }
  if (AWS_READ_AUTH.test(message)) {
    return 'Live AWS configuration could not be verified. Refresh the account read authorization, then try again. No change was made.'
  }
  if (INTERNAL_CONFIGURATION.test(message)) return fallback
  return message
}

export const IAM_INVENTORY_REFRESH_REQUIRED =
  'Live IAM configuration could not be verified. The role may have been removed or renamed after the last inventory snapshot. Refresh IAM inventory before reviewing a change.'
