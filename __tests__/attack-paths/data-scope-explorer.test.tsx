/// <reference types="vitest/globals" />

import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DataScopeExplorer } from "@/components/attack-paths-v2/current-access-dossier-panel"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("DataScopeExplorer", () => {
  it("shows exact S3 object evidence immediately and keeps the prefix collapsible", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        children: [{
          id: "arn:aws:s3:::bucket/catalog/",
          name: "catalog/",
          type: "S3Prefix",
          metric_label: "1019 access events",
          evidence_state: "observed",
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        children: [{
          id: "arn:aws:s3:::bucket/catalog/items.json",
          name: "catalog/items.json",
          type: "S3Object",
          operations: ["REST.GET.OBJECT"],
          evidence_state: "observed",
        }],
      }), { status: 200 }))

    render(
      <DataScopeExplorer
        resourceId="arn:aws:s3:::bucket"
        resourceType="S3"
        systemName="testbed-webshop"
      />,
    )

    expect(await screen.findByText("catalog/items.json")).toBeInTheDocument()
    expect(screen.getByText("REST.GET.OBJECT")).toBeInTheDocument()

    const prefix = screen.getByTestId("scope-row-arn:aws:s3:::bucket/catalog/")
    expect(prefix).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(prefix)
    await waitFor(() => expect(prefix).toHaveAttribute("aria-expanded", "false"))
    expect(screen.queryByText("catalog/items.json")).not.toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toContain("resource_id=arn%3Aaws%3As3%3A%3A%3Abucket")
    expect(fetchMock.mock.calls[1]?.[0]).toContain("resource_id=arn%3Aaws%3As3%3A%3A%3Abucket%2Fcatalog%2F")
  })
})
