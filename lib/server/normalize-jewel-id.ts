/**
 * Normalize crown-jewel identifiers for facade IAP matching.
 *
 * S3 ARNs use a triple colon (`arn:aws:s3:::bucket`). When the ARN is carried
 * in a URL path segment, one colon is occasionally dropped (`s3::bucket`),
 * so IAP row `crown_jewel_id` no longer equals the decoded path param.
 */
export function normalizeJewelArn(jewelId: string): string {
  const decoded = decodeURIComponent(jewelId)
  return decoded.replace(/^arn:aws:s3::(?!:)/, "arn:aws:s3:::")
}

export function jewelIdsMatch(a: string, b: string): boolean {
  const na = normalizeJewelArn(a)
  const nb = normalizeJewelArn(b)
  return na === nb || a === b || na === b || a === nb
}
