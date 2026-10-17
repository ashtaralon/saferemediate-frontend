import { observationWindowParams, type ObservationWindowRequest } from '@/lib/observation-coverage'

export type DependencyMapMode = 'observed' | 'observed+potential'

/**
 * `window` is a preset string ("1d" | "7d" | "30d") or a request object; a
 * custom request adds `from`/`to`. The backend answers with the effective
 * window it served (lib/observation-coverage.ts readEffectiveWindow).
 */
export function dependencyMapV2ProxyUrl(
  systemId: string,
  window: string | ObservationWindowRequest,
  mode: DependencyMapMode,
): string {
  const windowParams = typeof window === 'string' ? { window } : observationWindowParams(window)
  const params = new URLSearchParams({ systemId, ...windowParams, mode })
  return `/api/proxy/dependency-map/v2?${params.toString()}`
}
