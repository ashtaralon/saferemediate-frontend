import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/freshness-banner", () => ({
  FreshnessBanner: () => null,
}))

import { Zoom0ExfilLensPanel } from "@/components/attack-paths-v2/zoom0-exfil-lens-panel"
import { ExfilViewV3 } from "@/components/attack-paths-v2/exfil-view-v3"
import { ExfilPathListColumn } from "@/components/attack-paths-v2/exfil-path-list-column"
import type {
  ExfilPayloadWithCoverage,
} from "@/components/attack-paths-v2/use-zoom0-exfil"

afterEach(cleanup)

describe("KMS exfiltration applicability", () => {
  function kmsPayload(): ExfilPayloadWithCoverage {
    const reason =
      "AWS KMS key material is non-exportable. Evaluate exfiltration on encrypted data stores."
    return {
      ok: true,
      jewel: {
        id: "arn:aws:kms:eu-west-1:1:key/test",
        name: "test-key",
        type: "KMSKey",
        classification: "restricted",
      },
      applicability: {
        state: "NOT_APPLICABLE",
        reason,
        impact_model: "KEY_ABUSE",
      },
      accessors: [],
      paths: [],
      egress_lanes: {
        network: [],
        identity: { coverage_state: "not_applicable", items: [] },
        data_propagation: { coverage_state: "not_applicable", items: [] },
      },
      destinations: [],
      observed_exfil: { available: false, not_wired_reason: reason },
      phase: "not_applicable",
      phase_note: reason,
    } satisfies ExfilPayloadWithCoverage
  }

  it("renders a typed not-applicable result in the compact lens", () => {
    const data = kmsPayload()

    render(
      <Zoom0ExfilLensPanel
        data={data}
        loading={false}
        error={null}
        retry={vi.fn()}
        selectedPathId={null}
        onSelectPath={vi.fn()}
      />,
    )

    expect(screen.getByTestId("zoom0-exfil-not-applicable")).toHaveTextContent(
      "AWS KMS key material cannot be exported",
    )
    expect(screen.getByTestId("zoom0-exfil-not-applicable")).toHaveTextContent(
      data.applicability?.reason ?? "",
    )
    expect(screen.queryByText(/No accessor-to-exit path/)).not.toBeInTheDocument()
  })

  it("renders a typed not-applicable result in the full Exfil view", () => {
    const data = kmsPayload()

    render(
      <ExfilViewV3
        systemName="testbed-webshop"
        jewel={{
          id: data.jewel.id,
          canonical_id: data.jewel.id,
          name: data.jewel.name,
          type: data.jewel.type,
          severity: "MEDIUM",
          path_count: 6,
          highest_risk_score: 43,
          is_internet_exposed: null,
          data_classification: "restricted",
          priority_score: 43,
        }}
        data={data}
        loading={false}
        error={null}
        retry={vi.fn()}
        retrying={false}
        attempt={0}
        selectedPathId={null}
        onSelectPath={vi.fn()}
      />,
    )

    expect(screen.getByTestId("exfil-not-applicable")).toHaveTextContent(
      "AWS KMS key material cannot be exported",
    )
    expect(screen.queryByText("Exfil view failed")).not.toBeInTheDocument()
  })

  it("does not describe KMS as an empty or unobserved exfil path list", () => {
    const reason = kmsPayload().applicability?.reason ?? ""

    render(
      <ExfilPathListColumn
        paths={[]}
        selectedPathId={null}
        onSelectPath={vi.fn()}
        jewelName="test-key"
        notApplicableReason={reason}
      />,
    )

    expect(screen.getByTestId("exfil-rail-not-applicable")).toHaveTextContent(reason)
    expect(screen.queryByText(/No exfil paths surfaced/)).not.toBeInTheDocument()
  })
})
