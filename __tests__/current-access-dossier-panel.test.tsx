import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CurrentAccessDossierPanel } from "@/components/attack-paths-v2/current-access-dossier-panel"
import { buildCurrentAccessDossier } from "@/lib/attack-paths/build-current-access-dossier"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function s3Dossier() {
  return buildCurrentAccessDossier({
    path_id: "path-1",
    source: "app-role",
    source_kind: "IAMRole",
    identity: "arn:aws:iam::1:role/app-role",
    identity_name: "app-role",
    damage: ["read"],
    score: 60,
    severity: "HIGH",
    confidence: "configured",
    identity_gate: "OPEN_CONFIG",
    route_gate: "UNKNOWN",
    data_plane_gate: "UNKNOWN",
    hop_count: 2,
    hops_load_state: "ready",
    hops: [
      {
        node_id: "arn:aws:iam::1:role/app-role",
        node_type: "IAMRole",
        name: "app-role",
        plane: "identity",
        security_groups: [],
        is_crown_jewel: false,
      },
      {
        node_id: "arn:aws:s3:::customer-data",
        node_type: "S3Bucket",
        name: "customer-data",
        plane: "data",
        security_groups: [],
        is_crown_jewel: true,
        edge_type_from_prev: "ACCESSES_RESOURCE",
      },
    ],
  } as ConvergencePath)!
}

describe("CurrentAccessDossierPanel exact data scope", () => {
  it("treats a typed 404 as missing projected child evidence, not an app error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ code: "SCOPE_EVIDENCE_NOT_FOUND" }),
    }))

    render(
      <CurrentAccessDossierPanel
        dossier={s3Dossier()}
        jewelName="customer-data"
        jewelType="S3Bucket"
        systemName="payments-prod"
      />,
    )

    expect(await screen.findByText(/Object-level evidence has not been projected into Neptune/i)).toBeInTheDocument()
    expect(screen.queryByText(/Evidence endpoint returned/i)).not.toBeInTheDocument()
  })

  it("shows a human retryable boundary when exact scope is temporarily unavailable", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ code: "SCOPE_EVIDENCE_UNAVAILABLE" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ children: [] }),
      })
    vi.stubGlobal("fetch", fetchMock)

    render(
      <CurrentAccessDossierPanel
        dossier={s3Dossier()}
        jewelName="customer-data"
        jewelType="S3Bucket"
        systemName="payments-prod"
      />,
    )

    expect(await screen.findByText(/Exact object-level Neptune evidence is temporarily unavailable/i)).toBeInTheDocument()
    expect(screen.queryByText(/Evidence endpoint returned/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Retry exact scope/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/Object-level evidence has not been projected into Neptune/i)).toBeInTheDocument()
  })
})
