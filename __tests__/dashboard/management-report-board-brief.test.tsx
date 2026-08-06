import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  ManagementReportDrawer,
  type ManagementReportContext,
  type ManagementReportSnapshot,
} from "@/components/dashboard/v3/management-report-drawer"

afterEach(cleanup)

const SNAPSHOT: ManagementReportSnapshot = {
  metrics: {
    systems: 8,
    systemsPartial: false,
    systemsRequiringAttention: 3,
    reachableCrownJewels: 4,
    internetExposedJewels: 2,
    viableAttackPaths: 11,
    proposedChanges: 5,
    heldChanges: 2,
  },
  systems: [
    {
      name: "Payments production",
      environment: "production",
      score: 38,
      resourceCount: 47,
      critical: 3,
      high: 7,
      weakestPlane: "privilege",
    },
  ],
  crownJewels: [
    {
      id: "arn:aws:s3:::payments-ledger",
      name: "payments-ledger",
      type: "S3Bucket",
      severity: "CRITICAL",
      pathCount: 4,
      riskScore: 88,
      internetExposed: true,
      dataClassification: "Restricted",
      systemName: "Payments production",
    },
  ],
  candidates: [
    {
      resourceType: "IAMRole",
      resourceId: "payments-writer",
      system: "Payments production",
      unusedCount: 18,
      totalPermissions: 24,
      severity: "HIGH",
      canAutoApply: true,
      blockReason: null,
    },
  ],
  evidence: {
    confidence: 82,
    accounts: 2,
    healthy: 6,
    degraded: 1,
    missing: 1,
    total: 8,
  },
  outcomes: {
    windowDays: 7,
    permissionsRemoved: 61,
    events: 5,
    rollbacks: 1,
    periodStart: "2026-07-30",
    periodEnd: "2026-08-05",
    byDay: [
      { date: "2026-08-04", permissionsRemoved: 21, events: 2 },
      { date: "2026-08-05", permissionsRemoved: 40, events: 3 },
    ],
  },
}

function reading(snapshot: ManagementReportSnapshot | null = SNAPSHOT): ManagementReportContext {
  return {
    scope: "8 discovered business systems",
    snapshot,
    sources: [
      { label: "Business systems", state: "READY", cachedAt: Date.now() },
      { label: "Attack paths", state: "READY", cachedAt: Date.now() },
      { label: "Proposed changes", state: "READY", cachedAt: Date.now() },
      { label: "Evidence health", state: "READY", cachedAt: Date.now() },
      { label: "Verified outcomes", state: "READY", cachedAt: Date.now() },
    ],
  }
}

describe("Management report board brief", () => {
  it("turns the executive snapshot into risk, damage, progress, and decisions", () => {
    render(<ManagementReportDrawer open onClose={() => {}} report={reading()} />)
    const text = document.body.textContent ?? ""

    expect(text).toMatch(/2 crown jewels are reachable from an external entry point/i)
    expect(text).toMatch(/Payments production/i)
    expect(text).toMatch(/Sensitive-data disclosure/i)
    expect(text).toMatch(/61 permissions removed/i)
    expect(text).toMatch(/Authorize staged execution/i)
    expect(text).toMatch(/Print \/ save PDF/i)
  })

  it("never turns unknown path metrics into an all-clear", () => {
    const unknown: ManagementReportSnapshot = {
      ...SNAPSHOT,
      metrics: {
        ...SNAPSHOT.metrics,
        reachableCrownJewels: null,
        internetExposedJewels: null,
        viableAttackPaths: null,
      },
      crownJewels: [],
    }
    render(<ManagementReportDrawer open onClose={() => {}} report={reading(unknown)} />)
    const text = document.body.textContent ?? ""

    expect(text).toMatch(/Crown-jewel exposure cannot be confirmed/i)
    expect(text).toMatch(/Complete attack-path analysis before accepting crown-jewel risk/i)
    expect(text).not.toMatch(/No viable route to a crown jewel was reported/i)
  })
})
