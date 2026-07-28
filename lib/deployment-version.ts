const NON_DEPLOYMENT_VERSIONS = new Set(["", "development", "unknown"])

export function normalizeDeploymentVersion(
  value: string | null | undefined,
): string | null {
  const normalized = (value ?? "").trim()
  if (NON_DEPLOYMENT_VERSIONS.has(normalized.toLowerCase())) return null
  return normalized
}

export function deploymentHasChanged(
  clientVersion: string | null | undefined,
  serverVersion: string | null | undefined,
): boolean {
  const client = normalizeDeploymentVersion(clientVersion)
  const server = normalizeDeploymentVersion(serverVersion)
  return client != null && server != null && client !== server
}
