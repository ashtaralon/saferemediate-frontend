/// <reference types="vitest/globals" />

import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ReadinessBadges } from "@/components/inventory/readiness-badges"

afterEach(cleanup)

const inventoryReadiness = {
  resource_id: "arn:aws:lambda:eu-west-1:111122223333:function:daily",
  neo4j_label: "LambdaFunction",
  inventory: true,
  config_collected: false,
  evidence_collected: false,
  remediation_ready: false,
  max_outcome: "BLOCK",
  surface_id: "inventory:LambdaFunction",
  missing: ["config:collected_at"],
}

describe("ReadinessBadges", () => {
  it("does not present unsupported inventory evidence or remediation as failures", () => {
    render(<ReadinessBadges readiness={inventoryReadiness} />)

    expect(screen.getByText(/Configuration trust:/)).toBeInTheDocument()
    expect(screen.getByText("Evidence collected · not scored")).toBeInTheDocument()
    expect(screen.getByText("Remediation ready · not scored")).toBeInTheDocument()
  })

  it("describes missing collector provenance without claiming AWS config is absent", () => {
    render(<ReadinessBadges readiness={inventoryReadiness} />)

    expect(screen.getByText(/collection provenance is missing or stale/)).toBeInTheDocument()
    expect(screen.queryByText(/Configuration not fully collected/)).not.toBeInTheDocument()
  })
})
