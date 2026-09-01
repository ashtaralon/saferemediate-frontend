/// <reference types="vitest/globals" />

import React from "react"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { DependenciesTab, minimumViewsFor } from "@/components/inventory/dependencies-tab"
import {
  emptyDependenciesResponse,
  type DependencyApiFact,
  type DependencyApiPair,
  type ResourceDependenciesResponse,
} from "@/lib/resource-dependencies"

function fact(overrides: Partial<DependencyApiFact> = {}): DependencyApiFact {
  return {
    registered: true,
    generic: false,
    label: "protected by",
    perspective: "USES",
    mechanism: "M01",
    mechanism_label: "Network attachment and interface policy",
    capability: "network policy",
    canonical_relationship: "SECURED_BY",
    raw_relationship: "SECURED_BY",
    fact_id: "dependency:1",
    basis_class: "STRUCTURAL",
    freshness: "UNKNOWN",
    actions: [],
    observation_days: null,
    first_seen: null,
    last_seen: null,
    via_vpce: null,
    evidence_refs: [],
    source_generation_refs: [],
    aliases_collapsed: [],
    ...overrides,
  }
}

function pair(overrides: Partial<DependencyApiPair> = {}): DependencyApiPair {
  return {
    pair_key: "USES::arn:aws:ec2:eu-west-1:123456789012:security-group/sg-1",
    perspective: "USES",
    counterparty: {
      identity: "arn:aws:ec2:eu-west-1:123456789012:security-group/sg-1",
      label: "sg-1",
      type: "SecurityGroup",
      account_id: "123456789012",
      region: "eu-west-1",
      scope: "IN_ACCOUNT",
    },
    facts: [fact()],
    ...overrides,
  }
}

function payload(rows: DependencyApiPair[], extra: Partial<ResourceDependenciesResponse> = {}): ResourceDependenciesResponse {
  const by_perspective = { USES: 0, USED_BY: 0, PEER: 0 as const }
  for (const row of rows) by_perspective[row.perspective] += 1
  const unregistered: Record<string, number> = {}
  let unresolved = 0
  for (const row of rows) {
    if (!row.counterparty.identity) unresolved += 1
    for (const item of row.facts) {
      if (!item.registered) {
        unregistered[item.raw_relationship] = (unregistered[item.raw_relationship] || 0) + 1
      }
    }
  }
  return emptyDependenciesResponse({
    page: { rows, returned: rows.length, total: rows.length, offset: 0, next_cursor: null },
    counts: {
      by_perspective,
      external_counterparties: 0,
      unresolved_counterparties: unresolved,
      unregistered_relationships: unregistered,
      excluded: extra.counts?.excluded ?? {},
      ledger_rows_read: rows.length,
      completeness: "COMPLETE",
      matching_filters: rows.length,
      all_perspectives: rows.length,
    },
    ...extra,
  })
}

afterEach(cleanup)

describe("Dependencies tab (§6.2) — DE-305 payload", () => {
  it("splits by perspective instead of printing the raw edge direction", () => {
    render(<DependenciesTab payload={payload([
      pair(),
      pair({
        pair_key: "USED_BY::arn:aws:iam::123456789012:role/caller",
        perspective: "USED_BY",
        counterparty: {
          identity: "arn:aws:iam::123456789012:role/caller",
          label: "caller",
          type: "IAMRole",
          account_id: "123456789012",
          region: null,
          scope: "IN_ACCOUNT",
        },
        facts: [fact({
          label: "trusts",
          perspective: "USED_BY",
          mechanism: "M05",
          mechanism_label: "Authorization",
          capability: "effective authorization",
          canonical_relationship: "TRUSTS",
          raw_relationship: "TRUSTS",
          basis_class: "CONFIGURED",
        })],
      }),
    ])} />)

    expect(screen.getByRole("heading", { name: /^Uses/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Used by/ })).toBeInTheDocument()
    expect(screen.getByText("protected by")).toBeInTheDocument()
    expect(screen.getByText("trusts")).toBeInTheDocument()
    expect(screen.queryByText(/DOWNSTREAM|UPSTREAM/)).not.toBeInTheDocument()
  })

  it("renders one pair row and discloses a collapsed legacy spelling from the server", () => {
    render(<DependenciesTab payload={payload([
      pair({
        facts: [fact({ aliases_collapsed: ["HAS_SECURITY_GROUP"] })],
      }),
    ])} />)

    expect(screen.getAllByText("protected by")).toHaveLength(1)
    expect(screen.getByText(/Also stored as HAS_SECURITY_GROUP/)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Uses (1)" })).toBeInTheDocument()
  })

  it("shows an unregistered relationship untyped and reports it as a boundary", () => {
    render(<DependenciesTab payload={payload([
      pair({
        pair_key: "USED_BY::arn:aws:iam::123456789012:role/orders-reader",
        perspective: "USED_BY",
        counterparty: {
          identity: "arn:aws:iam::123456789012:role/orders-reader",
          label: "arn:aws:iam::123456789012:role/orders-reader",
          type: "IAMRole",
          account_id: "123456789012",
          region: null,
          scope: "IN_ACCOUNT",
        },
        facts: [fact({
          registered: false,
          generic: false,
          label: "ResourcePolicyGrant",
          perspective: "USED_BY",
          mechanism: null,
          mechanism_label: null,
          capability: null,
          canonical_relationship: "ResourcePolicyGrant",
          raw_relationship: "ResourcePolicyGrant",
          basis_class: "CONFIGURED",
        })],
      }),
    ])} />)

    expect(screen.getByText("(unregistered relationship)")).toBeInTheDocument()
    const boundaries = screen.getByRole("region", { name: "Unknowns and boundaries" })
    expect(within(boundaries).getByText(/ResourcePolicyGrant/)).toBeInTheDocument()
  })

  it("refuses to give a §6.3 generic relationship a dependency label", () => {
    render(<DependenciesTab payload={payload([
      pair({
        pair_key: "PEER::some-thing",
        perspective: "PEER",
        counterparty: {
          identity: null,
          label: "some-thing",
          type: "VPC",
          account_id: null,
          region: null,
          scope: "UNKNOWN",
        },
        facts: [fact({
          generic: true,
          label: "associated with",
          perspective: "PEER",
          canonical_relationship: "ASSOCIATED_WITH",
          raw_relationship: "ASSOCIATED_WITH",
        })],
      }),
    ])} />)

    expect(screen.getByText("(generic relationship)")).toBeInTheDocument()
    const boundaries = screen.getByRole("region", { name: "Unknowns and boundaries" })
    expect(within(boundaries).getByText(/carry no dependency meaning/)).toBeInTheDocument()
  })

  it("paginates a high-degree resource without dropping consumers", () => {
    const rows = Array.from({ length: 23 }, (_, index) => pair({
      pair_key: `USED_BY::arn:aws:ec2:eu-west-1:123456789012:instance/i-${String(index).padStart(3, "0")}`,
      perspective: "USED_BY",
      counterparty: {
        identity: `arn:aws:ec2:eu-west-1:123456789012:instance/i-${String(index).padStart(3, "0")}`,
        label: `i-${String(index).padStart(3, "0")}`,
        type: "EC2Instance",
        account_id: "123456789012",
        region: "eu-west-1",
        scope: "IN_ACCOUNT",
      },
      facts: [fact({
        label: "protects",
        perspective: "USED_BY",
        canonical_relationship: "PROTECTS",
        raw_relationship: "PROTECTS",
        fact_id: `dependency:${index}`,
      })],
    }))
    render(<DependenciesTab payload={payload(rows)} />)

    expect(screen.getByText("Showing 10 of 23. Nothing is dropped.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Show 10 more/ }))
    expect(screen.getByText("Showing 20 of 23. Nothing is dropped.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Show 3 more/ }))
    expect(screen.queryByText(/Showing \d+ of 23/)).not.toBeInTheDocument()
  })

  it("keeps an empty ledger an absence of evidence, not an absence of dependencies", () => {
    render(<DependenciesTab payload={payload([])} />)
    expect(screen.getByText(/No dependency assertions are available/)).toBeInTheDocument()
    expect(screen.getByText(/not proof that dependencies do not exist/)).toBeInTheDocument()
  })

  it("states remaining unavailable fields rather than defaulting them", () => {
    render(<DependenciesTab payload={payload([])} resourceType="SecurityGroup" />)
    const boundaries = screen.getByRole("region", { name: "Unknowns and boundaries" })
    expect(within(boundaries).getByText(/Activation context, attribution profile/)).toBeInTheDocument()
    expect(within(boundaries).getByText(/Completeness for this response: COMPLETE/)).toBeInTheDocument()
    expect(within(boundaries).getByText(/Referenced-SG rules/)).toBeInTheDocument()
  })

  it("finds the §6.4 family through every type spelling the graph carries", () => {
    for (const spelling of ["SecurityGroup", "AWS::EC2::SecurityGroup", "ec2:security-group"]) {
      expect(minimumViewsFor(spelling), spelling).not.toBeNull()
    }
    expect(minimumViewsFor("S3Bucket")).toBeNull()
    expect(minimumViewsFor(null)).toBeNull()
  })

  it("withholds a derived row that arrives without its derivation (§5.5)", () => {
    render(<DependenciesTab payload={payload([], {
      counts: {
        by_perspective: { USES: 0, USED_BY: 0, PEER: 0 },
        external_counterparties: 0,
        unresolved_counterparties: 0,
        unregistered_relationships: {},
        excluded: { derived_without_derivation: 1 },
        ledger_rows_read: 1,
        completeness: "COMPLETE",
        matching_filters: 0,
        all_perspectives: 0,
      },
    })} />)

    expect(screen.getByText(/withheld because they had no derivation/)).toBeInTheDocument()
    expect(screen.queryByText("S3 bucket · orders-data")).not.toBeInTheDocument()
  })
})
