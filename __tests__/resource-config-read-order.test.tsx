/// <reference types="vitest/globals" />

import React from "react"
import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ResourceConfigTab } from "@/components/inventory/resource-config-tab"

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("ResourceConfigTab read ordering", () => {
  it("does not request or advertise readiness for an unsupported resource type", async () => {
    const calls: string[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      calls.push(String(input))
      return Promise.resolve(jsonResponse({
        resource_type: "EC2",
        supported: true,
        current: { title: "Target group", source: "Neo4j", properties: { port: 80 } },
      }))
    })

    render(
      <ResourceConfigTab
        resourceId="i-0123456789abcdef0"
        resourceType="EC2"
        systemName="test-system"
      />,
    )

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toContain("/api/proxy/inspector/")
    expect(document.body).not.toHaveTextContent("Readiness check unavailable")
  })

  it("finishes Inspector before starting readiness and secondary enrichment", async () => {
    const calls: string[] = []
    let finishInspector: ((response: Response) => void) | undefined
    const onPrimarySettled = vi.fn()

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("/api/proxy/inspector/")) {
        return new Promise<Response>((resolve) => {
          finishInspector = resolve
        })
      }
      return Promise.resolve(jsonResponse({
        resource_id: "arn:aws:lambda:eu-west-1:123:function:worker",
        neo4j_label: "LambdaFunction",
        inventory: true,
        config_collected: true,
        evidence_collected: false,
        remediation_ready: false,
        max_outcome: "BLOCK",
      }))
    })

    render(
      <ResourceConfigTab
        resourceId="arn:aws:lambda:eu-west-1:123:function:worker"
        resourceType="Lambda"
        systemName="test-system"
        onPrimarySettled={onPrimarySettled}
      />,
    )

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toContain("/api/proxy/inspector/")
    expect(onPrimarySettled).not.toHaveBeenCalled()

    finishInspector?.(jsonResponse({ supported: false, message: "No Lambda configuration fields." }))

    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]).toContain("/api/proxy/decision-coverage/resource/LambdaFunction/")
    await waitFor(() => expect(onPrimarySettled).toHaveBeenCalledTimes(1))
  })
})
