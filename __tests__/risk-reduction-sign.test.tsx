/// <reference types="vitest/globals" />

import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { DamageAwarePathCard } from "@/components/attack-paths-v2/damage-aware-path-card"
import { HardeningPanel } from "@/components/attack-paths-v2/hardening-panel"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"

afterEach(() => {
  cleanup()
})

const basePath = {
  path_id: "test-path",
  nodes: [],
  edges: [],
  risk_reduction: {
    current_score: 80,
    achievable_score: 68,
    top_actions: [
      {
        action: "Remove unused s3:DeleteObject",
        impact: -12,
        node_name: "demo-role",
        plane: "iam" as const,
      },
    ],
    by_plane: {
      iam: {
        actions: [
          {
            action: "Remove unused s3:DeleteObject",
            impact: -12,
            node_name: "demo-role",
            plane: "iam" as const,
          },
        ],
        action_count: 1,
        achievable_score: 68,
        delta: -12,
      },
      network: {
        actions: [],
        action_count: 0,
        achievable_score: 80,
        delta: 0,
      },
      data: {
        actions: [],
        action_count: 0,
        achievable_score: 80,
        delta: 0,
      },
    },
  },
} as unknown as IdentityAttackPath

describe("risk reduction sign normalization", () => {
  it("damage-aware-path-card renders a single minus for negative impact", () => {
    const { container } = render(
      <DamageAwarePathCard
        path={basePath}
        jewel={null}
        systemName="alon-prod"
        scope={null}
      />,
    )
    expect(container.textContent).toContain("−12 path score")
    expect(container.textContent).not.toContain("−-12")
  })

  it("hardening-panel renders a single minus for negative bucket delta", () => {
    const { container } = render(
      <HardeningPanel path={basePath} systemName="alon-prod" defaultCollapsed={false} />,
    )
    expect(container.textContent).toContain("−12 pts")
    expect(container.textContent).not.toContain("−-12")
  })

  it("hardening-panel hides reduction when impact is zero", () => {
    const zeroPath = {
      ...basePath,
      risk_reduction: {
        ...basePath.risk_reduction!,
        top_actions: [{ action: "No-op", impact: 0, plane: "iam" as const }],
        by_plane: {
          iam: {
            actions: [{ action: "No-op", impact: 0, plane: "iam" as const }],
            action_count: 1,
            achievable_score: 80,
            delta: 0,
          },
        },
      },
    } as unknown as IdentityAttackPath

    const { container } = render(
      <HardeningPanel path={zeroPath} systemName="alon-prod" defaultCollapsed={false} />,
    )
    expect(container.textContent).not.toMatch(/−\d+ pts/)
  })
})
