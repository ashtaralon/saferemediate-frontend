/// <reference types="vitest/globals" />
/**
 * lp-severity tests
 * =================
 *
 * Locks in the contract that the LP "Active Issues" severity badge
 * mirrors the backend `severity` field verbatim, and never re-derives
 * severity from gapPercent. A regression that re-introduces the
 * gap-percent ladder would make a CRITICAL public-read S3 bucket
 * (gapPercent=0) render as "Low" and hide it in the Active Issues list.
 *
 * Live evidence captured 2026-05-18 from
 * /api/least-privilege/issues?systemName=alon-prod:
 *
 *   {
 *     "resourceName": "alon-demo-data-bucket-745783559495",
 *     "severity":     "CRITICAL",
 *     "gapPercent":   0,
 *     "description":  "PUBLIC READ POLICY: ..."
 *   }
 */

import {
  normalizeLPSeverity,
  lpSeverityColor,
  lpSeverityLabel,
} from '../lib/lp-severity'

describe('normalizeLPSeverity', () => {
  test('passes through canonical CAPS values', () => {
    expect(normalizeLPSeverity('CRITICAL')).toBe('CRITICAL')
    expect(normalizeLPSeverity('HIGH')).toBe('HIGH')
    expect(normalizeLPSeverity('MEDIUM')).toBe('MEDIUM')
    expect(normalizeLPSeverity('LOW')).toBe('LOW')
    expect(normalizeLPSeverity('INFO')).toBe('INFO')
  })

  test('uppercases lowercase / mixed-case fallback values written by the frontend', () => {
    expect(normalizeLPSeverity('critical')).toBe('CRITICAL')
    expect(normalizeLPSeverity('Medium')).toBe('MEDIUM')
    expect(normalizeLPSeverity(' high ')).toBe('HIGH')
  })

  test('returns null for unknown, empty, or non-string input', () => {
    expect(normalizeLPSeverity('')).toBeNull()
    expect(normalizeLPSeverity('FATAL')).toBeNull()
    expect(normalizeLPSeverity(undefined)).toBeNull()
    expect(normalizeLPSeverity(null)).toBeNull()
    expect(normalizeLPSeverity(0)).toBeNull()
    expect(normalizeLPSeverity({})).toBeNull()
  })
})

describe('lpSeverityLabel', () => {
  test('CRITICAL bucket with gapPercent=0 renders Critical, not Low', () => {
    // Regression guard for the public-read S3 bucket bug.
    expect(lpSeverityLabel('CRITICAL')).toBe('Critical')
  })

  test('MEDIUM resource with gapPercent=0 renders Medium', () => {
    expect(lpSeverityLabel('MEDIUM')).toBe('Medium')
  })

  test('renders Title case for every canonical severity', () => {
    expect(lpSeverityLabel('CRITICAL')).toBe('Critical')
    expect(lpSeverityLabel('HIGH')).toBe('High')
    expect(lpSeverityLabel('MEDIUM')).toBe('Medium')
    expect(lpSeverityLabel('LOW')).toBe('Low')
    expect(lpSeverityLabel('INFO')).toBe('Info')
  })

  test('renders Unknown for missing severity (no fabricated Low/Medium)', () => {
    // Per memory feedback_no_mock_numbers_in_ui: missing data must not
    // be invented as "Low". A missing badge should look distinct from a
    // real LOW finding.
    expect(lpSeverityLabel(undefined)).toBe('Unknown')
    expect(lpSeverityLabel(null)).toBe('Unknown')
    expect(lpSeverityLabel('')).toBe('Unknown')
  })
})

describe('lpSeverityColor', () => {
  test('CRITICAL is red (#ef4444), not green', () => {
    // Regression guard: previous gap%-derived logic returned green for
    // gapPercent=0 even when backend severity was CRITICAL.
    expect(lpSeverityColor('CRITICAL')).toBe('#ef4444')
  })

  test('every canonical severity maps to a distinct colour', () => {
    const colours = new Set([
      lpSeverityColor('CRITICAL'),
      lpSeverityColor('HIGH'),
      lpSeverityColor('MEDIUM'),
      lpSeverityColor('LOW'),
      lpSeverityColor('INFO'),
    ])
    expect(colours.size).toBe(5)
  })

  test('renders neutral grey for unknown severity', () => {
    expect(lpSeverityColor(undefined)).toBe('#6b7280')
    expect(lpSeverityColor('FATAL')).toBe('#6b7280')
  })
})
