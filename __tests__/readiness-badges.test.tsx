/// <reference types="vitest/globals" />

import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ReadinessBadges } from "@/components/inventory/readiness-badges"

afterEach(cleanup)

describe("ReadinessBadges", () => {
  it("does not present unsupported inventory evidence or remediation as failures", () => {
    render(
      <ReadinessBadges
        readiness={{
          resource_id: "arn:aws:lambda:eu-west-1:111122223333:function:monthly",
          neo4j_label: "LambdaFunction",
          inventory: true,
          config_collected: true,
          evidence_collected: false,
          remediation_ready: false,
          max_outcome: "INVESTIGATE",
          surface_id: "inventory:LambdaFunction",
        }}
      />,
    )

    expect(screen.getByText(/Inspection state:/)).toBeInTheDocument()
    expect(screen.getByText("Evidence collected · not scored")).toBeInTheDocument()
    expect(screen.getByText("Remediation ready · not scored")).toBeInTheDocument()
  })
})
