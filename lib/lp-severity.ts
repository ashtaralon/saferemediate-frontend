/**
 * Least-Privilege severity badge helpers.
 *
 * Backend is the source of truth for the per-resource severity. The
 * frontend used to derive Critical/High/Medium/Low from `gapPercent`
 * thresholds, which silently downgraded findings that are critical for
 * non-gap reasons (public S3 policy, orphan SG, default SG, etc.) to
 * "Low" whenever gapPercent was 0. That hid a publicly-readable bucket
 * inside the "Active Issues" list alongside genuinely low-risk rows.
 *
 * This module re-establishes the contract: the badge mirrors the
 * backend `severity` string verbatim (case-insensitive). Missing or
 * unrecognised values render as "Unknown" rather than a fabricated
 * "Low" — see memory note feedback_no_mock_numbers_in_ui.
 */

export type LPSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'

const KNOWN_SEVERITIES: ReadonlySet<LPSeverity> = new Set<LPSeverity>([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'INFO',
])

const SEVERITY_COLOR: Record<LPSeverity, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#eab308',
  LOW:      '#22c55e',
  INFO:     '#3b82f6',
}

const SEVERITY_LABEL: Record<LPSeverity, string> = {
  CRITICAL: 'Critical',
  HIGH:     'High',
  MEDIUM:   'Medium',
  LOW:      'Low',
  INFO:     'Info',
}

const UNKNOWN_COLOR = '#6b7280'
const UNKNOWN_LABEL = 'Unknown'

export function normalizeLPSeverity(raw: unknown): LPSeverity | null {
  if (typeof raw !== 'string') return null
  const upper = raw.trim().toUpperCase()
  return KNOWN_SEVERITIES.has(upper as LPSeverity) ? (upper as LPSeverity) : null
}

export function lpSeverityColor(raw: unknown): string {
  const sev = normalizeLPSeverity(raw)
  return sev ? SEVERITY_COLOR[sev] : UNKNOWN_COLOR
}

export function lpSeverityLabel(raw: unknown): string {
  const sev = normalizeLPSeverity(raw)
  return sev ? SEVERITY_LABEL[sev] : UNKNOWN_LABEL
}
