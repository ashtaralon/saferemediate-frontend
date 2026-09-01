/// <reference types="vitest/globals" />

import React from "react"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { DependenciesTab, minimumViewsFor } from "@/components/inventory/dependencies-tab"
import type { Dependency, DependenciesPayload, DossierSection } from "@/lib/resource-dossier-types"

const UID = "aws:ec2:eu-west-1:123456789012:instance/i-123"

function row(overrides: Partial<Dependency>): Dependency {
  return {
    direction: "DOWNSTREAM",
    basis_class: "STRUCTURAL",
    freshness: "UNKNOWN",
    relationship: "SECURED_BY",
    resource_canonical_resource_uid: UID,
    evidence_refs: [],
    source_generation_refs: [],
    ...overrides,
  }
}

function section(
  ledger: Dependency[],
  overrides: Partial<DossierSection<DependenciesPayload>> = {},
): DossierSection<DependenciesPayload> {
  return {
    serve_state: "PARTIAL" as const,
    payload: {
      ledger,
      counts_by_basis: {
        OBSERVED: ledger.filter(item => item.basis_class === "OBSERVED").length,
        CONFIGURED: ledger.filter(item => item.basis_class === "CONFIGURED").length,
        STRUCTURAL: ledger.filter(item => item.basis_class === "STRUCTURAL").length,
      },
    },
    coverage: null,
    notes: null,
    ...overrides,
  }
}

afterEach(cleanup)

describe("Dependencies tab (§6.2)", () => {
  it("splits by perspective instead of printing the raw edge direction", () => {
    render(<DependenciesTab section={section([
      row({ relationship: "SECURED_BY", direction: "DOWNSTREAM", target_arn: "arn:aws:ec2:eu-west-1:123456789012:security-group/sg-1", target_type: "SecurityGroup" }),
      row({ relationship: "TRUSTS", direction: "DOWNSTREAM", basis_class: "CONFIGURED", target_arn: "arn:aws:iam::123456789012:role/caller", target_type: "IAMRole" }),
    ])} />)

    expect(screen.getByRole("heading", { name: /^Uses/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Used by/ })).toBeInTheDocument()
    expect(screen.getByText("protected by")).toBeInTheDocument()
    expect(screen.getByText("trusts")).toBeInTheDocument()
    expect(screen.queryByText(/DOWNSTREAM|UPSTREAM/)).not.toBeInTheDocument()
  })

  it("renders one pair row and collapses a legacy spelling of the same attachment", () => {
    const sg = { target_arn: "arn:aws:ec2:eu-west-1:123456789012:security-group/sg-1", target_type: "SecurityGroup" }
    render(<DependenciesTab section={section([
      row({ relationship: "SECURED_BY", ...sg }),
      row({ relationship: "HAS_SECURITY_GROUP", ...sg }),
    ])} />)

    expect(screen.getAllByText("protected by")).toHaveLength(1)
    expect(screen.getByText(/Also stored as HAS_SECURITY_GROUP/)).toBeInTheDocument()
    // One counterparty, counted once.
    expect(screen.getByRole("heading", { name: "Uses (1)" })).toBeInTheDocument()
  })

  it("shows an unregistered relationship untyped and reports it as a boundary", () => {
    render(<DependenciesTab section={section([
      row({ relationship: "ResourcePolicyGrant", direction: "UPSTREAM", principal_arn: "arn:aws:iam::123456789012:role/orders-reader" }),
    ])} />)

    expect(screen.getByText("(unregistered relationship)")).toBeInTheDocument()
    const boundaries = screen.getByRole("region", { name: "Unknowns and boundaries" })
    expect(within(boundaries).getByText(/ResourcePolicyGrant/)).toBeInTheDocument()
  })

  it("refuses to give a §6.3 generic relationship a dependency label", () => {
    render(<DependenciesTab section={section([
      row({ relationship: "ASSOCIATED_WITH", target_display_name: "some-thing", target_type: "VPC" }),
    ])} />)

    expect(screen.getByText("(generic relationship)")).toBeInTheDocument()
    const boundaries = screen.getByRole("region", { name: "Unknowns and boundaries" })
    expect(within(boundaries).getByText(/carry no dependency meaning/)).toBeInTheDocument()
  })

  it("paginates a high-degree resource without dropping consumers", () => {
    const ledger = Array.from({ length: 23 }, (_, index) => row({
      relationship: "PROTECTS",
      direction: "DOWNSTREAM",
      target_arn: `arn:aws:ec2:eu-west-1:123456789012:instance/i-${String(index).padStart(3, "0")}`,
      target_type: "EC2Instance",
    }))
    render(<DependenciesTab section={section(ledger)} />)

    expect(screen.getByText("Showing 10 of 23. Nothing is dropped.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Show 10 more/ }))
    expect(screen.getByText("Showing 20 of 23. Nothing is dropped.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Show 3 more/ }))
    expect(screen.queryByText(/Showing \d+ of 23/)).not.toBeInTheDocument()
  })

  it("keeps an empty ledger an absence of evidence, not an absence of dependencies", () => {
    render(<DependenciesTab section={section([])} />)
    expect(screen.getByText(/No dependency assertions are available/)).toBeInTheDocument()
    expect(screen.getByText(/not proof that dependencies do not exist/)).toBeInTheDocument()
  })

  it("states the fields the dependency API does not supply rather than defaulting them", () => {
    render(<DependenciesTab section={section([])} resourceType="SecurityGroup" />)
    const boundaries = screen.getByRole("region", { name: "Unknowns and boundaries" })
    expect(within(boundaries).getByText(/Activation context, attribution profile/)).toBeInTheDocument()
    expect(within(boundaries).getByText(/Referenced-SG rules/)).toBeInTheDocument()
  })

  it("finds the §6.4 family through every type spelling the graph carries", () => {
    // §3.3 measured SecurityGroup, AWS::EC2::SecurityGroup and ec2:security-group
    // coexisting; an exact-string lookup silently drops the coverage note.
    for (const spelling of ["SecurityGroup", "AWS::EC2::SecurityGroup", "ec2:security-group"]) {
      expect(minimumViewsFor(spelling), spelling).not.toBeNull()
    }
    expect(minimumViewsFor("S3Bucket")).toBeNull()
    expect(minimumViewsFor(null)).toBeNull()
  })

  it("withholds a derived row that arrives without its derivation (§5.5)", () => {
    render(<DependenciesTab section={section([
      row({ relationship: "CAN_REACH", target_arn: "arn:aws:s3:::orders-data", target_type: "S3Bucket" }),
    ])} />)

    expect(screen.getByText(/withheld rather than shown as direct attachments/)).toBeInTheDocument()
    expect(screen.queryByText("S3 bucket · orders-data")).not.toBeInTheDocument()
  })
})
