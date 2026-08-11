import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  EnforcementJourneySummary,
  TransportJourneySummary,
} from "@/components/fixes/configuration-fix-journey"
import type { S3EnforcementPlan, S3VpcePlan } from "@/components/topology-v0-2/estate-operations"

function transportPlan(mode: S3VpcePlan["endpoint_mode"]): S3VpcePlan {
  return {
    readiness: "READY",
    operation_id: "op-1",
    operation_state: "READY_FOR_SIMULATION",
    operation_version: 1,
    blockers: [],
    bucket_name: "payments-data",
    vpc_id: "vpc-123",
    endpoint_mode: mode,
    existing_endpoint_id: mode === "CREATE_MANAGED" ? null : "vpce-existing",
    public_route_kinds: ["NAT_GATEWAY"],
    impact: {
      observed_consumers: 3,
      migrating_consumers: mode === "NO_CHANGE" ? 0 : 3,
      subnets: 2,
      route_tables: mode === "NO_CHANGE" ? 0 : 2,
      route_table_workloads: 3,
      s3_destinations: 1,
      permission_changes: 0,
      resource_replacements: 0,
    },
  }
}

function enforcementPlan(): S3EnforcementPlan {
  return {
    readiness: "BLOCKED",
    bucket_name: "payments-data",
    vpce_ids: ["vpce-reviewed"],
    enforcement_mode: "SINGLE_STAGE",
    exempt_principal_arns: [],
    canary_principal_arns: [],
    out_of_vpc_principals: [
      "arn:aws:iam::111122223333:role/batch",
      "arn:aws:iam::111122223333:role/inventory",
    ],
    blockers: [{ code: "OUT_OF_VPC_ACCESS_UNREVIEWED", message: "Review outside callers." }],
    impact: {
      observed_consumers: 4,
      protected_consumers: 2,
      public_consumers: 0,
      unknown_consumers: 0,
      exempt_principals: 0,
      vpc_endpoints: 1,
      policy_statements_added: 1,
    },
  }
}

describe("configuration fix journeys", () => {
  it("presents endpoint creation as a canary route change", () => {
    render(<TransportJourneySummary plan={transportPlan("CREATE_MANAGED")} />)
    expect(screen.getByText("Create a private S3 path")).toBeInTheDocument()
    expect(screen.getByText("New endpoint")).toBeInTheDocument()
    expect(screen.getByText(/Create the endpoint, move one route table/)).toBeInTheDocument()
  })

  it("presents an existing endpoint as reuse rather than creation", () => {
    render(<TransportJourneySummary plan={transportPlan("ADOPT_EXISTING")} />)
    expect(screen.getByText("Connect workloads to the existing private path")).toBeInTheDocument()
    expect(screen.getAllByText(/vpce-existing/).length).toBeGreaterThan(0)
    expect(screen.getByText("New endpoints").previousSibling).toHaveTextContent("0")
  })

  it("states clearly when no network mutation is needed", () => {
    render(<TransportJourneySummary plan={transportPlan("NO_CHANGE")} />)
    expect(screen.getByText("Private path already working")).toBeInTheDocument()
    expect(screen.getByText("No network change")).toBeInTheDocument()
    expect(screen.getByText(/Endpoint, route tables, IAM/)).toBeInTheDocument()
  })

  it("separates VPC public-path workloads from outside-VPC callers", () => {
    render(<EnforcementJourneySummary plan={enforcementPlan()} />)
    expect(screen.getByText(/2 callers access the bucket from outside the VPC/)).toBeInTheDocument()
    expect(screen.getByText("Outside-VPC callers").previousSibling).toHaveTextContent("2")
    expect(screen.getByText("VPC workloads public").previousSibling).toHaveTextContent("0")
    expect(screen.getByText("vpce-reviewed")).toBeInTheDocument()
  })

  it("uses singular grammar for one protected VPC workload", () => {
    const plan = enforcementPlan()
    plan.readiness = "READY"
    plan.blockers = []
    plan.out_of_vpc_principals = []
    plan.impact.protected_consumers = 1
    render(<EnforcementJourneySummary plan={plan} />)
    expect(screen.getByText(/1 VPC workload uses the reviewed endpoint/)).toBeInTheDocument()
  })
})
