'use client'

import * as React from 'react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import type { BlastRadiusScore } from '@/lib/types'

// Cloud-agnostic display labels for the scanner coverage registry. Keep in
// sync with unified/scoring/scan_coverage.py::SCANNABLE_TYPES.
const COVERAGE_TYPE_LABELS: Record<string, string> = {
  IAMRole: 'IAM roles',
  IAMUser: 'IAM users',
  IAMGroup: 'IAM groups',
  S3Bucket: 'S3 buckets',
  SecurityGroup: 'Security groups',
  NetworkACL: 'Network ACLs',
  KMSKey: 'KMS keys',
  LambdaFunction: 'Lambda functions',
  SecretsManager: 'Secrets Manager secrets',
  SNSTopic: 'SNS topics',
  SQSQueue: 'SQS queues',
  ECRRepository: 'ECR repositories',
  APIGateway: 'API Gateways',
}

function prettifyCoverageType(key: string): string {
  return COVERAGE_TYPE_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2')
}

export interface CoveragePillProps {
  brss: BlastRadiusScore
  /** tailwind class for the trigger pill — defaults to overview-card styling */
  className?: string
  /** "Coverage 31%" | "Cov 31%" etc. */
  label?: (percent: number) => string
  testId?: string
  align?: 'start' | 'center' | 'end'
}

/**
 * Coverage pill with full scanner-scope popover. One source of truth for the
 * "what does coverage mean" explanation across Overview card, LP tab, and any
 * future surface that surfaces the BRSS coverage number.
 */
export function CoveragePill({
  brss,
  className,
  label,
  testId = 'coverage-pill',
  align = 'start',
}: CoveragePillProps) {
  const percent = Math.round((brss.coverage_ratio ?? 0) * 100)
  const text = label ? label(percent) : `Coverage ${percent}%`
  const scanned = brss.coverage?.scanned_types ?? []
  const excluded = brss.coverage?.excluded_types ?? []
  const scannedInst = brss.coverage?.scanned_instance_count ?? 0
  const knownInst = brss.coverage?.known_instance_count ?? 0

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={className ?? 'inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur cursor-help focus:outline-none focus:ring-2 focus:ring-slate-400'}
          data-testid={testId}
        >
          {text}
          <span className="text-slate-400 text-[10px]">ⓘ</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80" align={align}>
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Scanner coverage
            </div>
            <p className="mt-1 text-xs text-slate-700 leading-snug">
              {percent}% of scannable resource types are in scope. The score ceiling is bounded at <strong>{brss.coverage_ceiling} / 100</strong> until more scanners ship.
            </p>
          </div>

          {scanned.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                Scanned ({scanned.length})
              </div>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
                {scanned.map(t => (
                  <li key={t} className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-emerald-500" />
                    {prettifyCoverageType(t)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {excluded.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                Not in scope ({excluded.length})
              </div>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
                {excluded.map(t => (
                  <li key={t} className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-amber-500" />
                    {prettifyCoverageType(t)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-slate-500 leading-snug">
                Risk in these types is not reflected in the score. Ship the matching scanner to raise coverage.
              </p>
            </div>
          )}

          {knownInst > 0 && (
            <div className="border-t pt-2 text-[10px] text-slate-500">
              {scannedInst} of {knownInst} resource instances scored
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
