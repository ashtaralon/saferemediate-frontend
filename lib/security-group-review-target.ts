export type SecurityGroupReviewTarget = {
  sgId: string
  accountId: string
  region: string
  resourceArn?: string
}

type ResourceLike = {
  id?: string | null
  resourceName?: string | null
  resourceArn?: string | null
  accountId?: string | null
  account_id?: string | null
  region?: string | null
  awsRegion?: string | null
  aws_region?: string | null
}

const SG_ID = /^sg-[0-9a-f]{8,17}$/
const ACCOUNT_ID = /^\d{12}$/
const REGION = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/

export function resolveSecurityGroupReviewTarget(
  resource: ResourceLike,
): SecurityGroupReviewTarget | null {
  const arn = String(resource.resourceArn || "")
  const arnParts = arn.startsWith("arn:") ? arn.split(":") : []
  const arnSg = arn.match(/security-group\/(sg-[0-9a-f]{8,17})/i)?.[1]
  const sgId = [resource.id, resource.resourceName, arnSg]
    .map((value) => String(value || "").toLowerCase())
    .find((value) => SG_ID.test(value))
  const accountId = String(
    resource.accountId || resource.account_id || arnParts[4] || "",
  )
  const region = String(
    resource.region || resource.awsRegion || resource.aws_region || arnParts[3] || "",
  )

  if (!sgId || !ACCOUNT_ID.test(accountId) || !REGION.test(region)) return null
  return {
    sgId,
    accountId,
    region,
    ...(arn ? { resourceArn: arn } : {}),
  }
}

export function securityGroupReviewQuery(target: SecurityGroupReviewTarget): string {
  const params = new URLSearchParams({
    account_id: target.accountId,
    region: target.region,
  })
  return params.toString()
}
