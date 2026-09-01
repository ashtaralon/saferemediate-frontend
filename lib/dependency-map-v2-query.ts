export type DependencyMapMode = 'observed' | 'observed+potential'

export function dependencyMapV2ProxyUrl(
  systemId: string,
  window: string,
  mode: DependencyMapMode,
): string {
  const params = new URLSearchParams({ systemId, window, mode })
  return `/api/proxy/dependency-map/v2?${params.toString()}`
}
