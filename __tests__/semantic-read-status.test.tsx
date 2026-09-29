import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SemanticReadStatus } from "@/components/semantic-read-status"

describe("SemanticReadStatus", () => {
  it("shows the generation the API returned", () => {
    render(
      <SemanticReadStatus
        payload={{
          semantic_status: "populated",
          graph_version: "inventory.resource_state.v1/4/run-a",
        }}
      />,
    )
    expect(screen.getByTestId("semantic-read-status-value")).toHaveTextContent("Populated")
    expect(screen.getByTestId("semantic-read-generation")).toHaveTextContent(
      "inventory.resource_state.v1/4/run-a",
    )
  })

  it("shows not recorded without inventing a version", () => {
    render(
      <SemanticReadStatus
        payload={{ semantic_status: "not_recorded", graph_version: null, source_generation: null }}
      />,
    )
    expect(screen.getByTestId("semantic-read-status-value")).toHaveTextContent("Not recorded")
    expect(screen.queryByTestId("semantic-read-generation")).toBeNull()
  })

  it("renders nothing when the API did not send a serving status", () => {
    const { container } = render(<SemanticReadStatus payload={{ nodes: [] }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
