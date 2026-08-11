"use client"

import { CheckCircle2, Route, ShieldAlert } from "lucide-react"
import type { S3EnforcementPlan, S3VpcePlan } from "@/components/topology-v0-2/estate-operations"
import { S3CallerInventory } from "./s3-caller-inventory"

interface Fact {
  label: string
  value: string | number
  emphasis?: "default" | "warning"
}

function routeLabel(routeKinds: string[] = []) {
  const normalized = routeKinds.map((value) => value.toUpperCase())
  if (normalized.some((value) => value.includes("NAT"))) return "a NAT gateway"
  if (normalized.some((value) => value.includes("IGW") || value.includes("INTERNET"))) return "an internet gateway"
  return "the current public S3 route"
}

function JourneySummary({
  status,
  title,
  summary,
  facts,
  change,
  untouched,
  tone = "default",
  testId,
}: {
  status: string
  title: string
  summary: string
  facts: Fact[]
  change: string
  untouched: string
  tone?: "default" | "warning" | "complete"
  testId: string
}) {
  const warning = tone === "warning"
  const complete = tone === "complete"
  const accent = warning ? "#B45309" : "#0E8B7A"
  const background = warning ? "#FFF7ED" : complete ? "#F0FDFA" : "#FFFFFF"
  const border = warning ? "#FED7AA" : complete ? "#9FE8DC" : "#B9DED8"
  const Icon = warning ? ShieldAlert : complete ? CheckCircle2 : Route

  return (
    <section className="overflow-hidden rounded-2xl border" style={{ borderColor: border, background }} data-testid={testId}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-xl p-2" style={{ background: warning ? "#FFEDD5" : "#DDF8F3", color: accent }}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>{status}</div>
            <h3 className="mt-1 text-base font-bold text-slate-900">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-700">{summary}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="rounded-xl border bg-white px-3 py-2.5" style={{ borderColor: "#DDE3E8" }}>
              <div className="break-words text-sm font-bold" style={{ color: fact.emphasis === "warning" ? "#B45309" : "#1A2330" }}>{fact.value}</div>
              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">{fact.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 border-t bg-white px-4 py-3 text-[11px] leading-5 text-slate-600 md:grid-cols-2" style={{ borderColor: "#E2E8F0" }}>
        <div><strong className="text-slate-800">Change:</strong> {change}</div>
        <div><strong className="text-slate-800">Not touched:</strong> {untouched}</div>
      </div>
    </section>
  )
}

export function TransportJourneySummary({ plan }: { plan: S3VpcePlan }) {
  const mode = plan.endpoint_mode ?? "CREATE_MANAGED"
  const consumers = plan.impact.migrating_consumers ?? plan.impact.observed_consumers
  const routeTables = plan.impact.route_tables
  const endpoint = plan.existing_endpoint_id ?? "Not created yet"

  if (mode === "NO_CHANGE") {
    return (
      <JourneySummary
        status="No network change"
        title="Private path already working"
        summary={`The reviewed workloads already reach S3 through ${plan.existing_endpoint_id ?? "an S3 Gateway endpoint"}. Creating or associating another endpoint would add change without benefit.`}
        facts={[
          { label: "Workloads moving", value: 0 },
          { label: "Endpoint in use", value: endpoint },
          { label: "Route changes", value: 0 },
          { label: "AWS changes", value: 0 },
        ]}
        change="Keep monitoring the endpoint and fresh S3 traffic."
        untouched="Endpoint, route tables, IAM, applications, and bucket policy."
        tone="complete"
        testId="transport-journey-no-change"
      />
    )
  }

  if (mode === "ADOPT_EXISTING") {
    return (
      <JourneySummary
        status={plan.readiness === "READY" ? "Existing endpoint found" : "Blocked before rollout"}
        title="Connect workloads to the existing private path"
        summary={`${consumers} reviewed bucket consumer${consumers === 1 ? "" : "s"} still use ${routeLabel(plan.public_route_kinds)}. Cyntro will reuse ${endpoint} and add only the reviewed route-table associations.`}
        facts={[
          { label: "Consumers moving", value: consumers },
          { label: "Endpoint reused", value: endpoint },
          { label: "Route tables", value: routeTables },
          { label: "New endpoints", value: 0 },
        ]}
        change="Associate one route table first, verify live S3 traffic, then expand."
        untouched="The customer endpoint itself, IAM, applications, and bucket policy."
        tone={plan.readiness === "READY" ? "default" : "warning"}
        testId="transport-journey-adopt"
      />
    )
  }

  return (
    <JourneySummary
      status={plan.readiness === "READY" ? "No eligible endpoint found" : "Blocked before creation"}
      title="Create a private S3 path"
      summary={`${consumers} reviewed bucket consumer${consumers === 1 ? "" : "s"} still use ${routeLabel(plan.public_route_kinds)}. Cyntro will create one S3 Gateway endpoint and move one route table first.`}
      facts={[
        { label: "Consumers moving", value: consumers },
        { label: "New endpoint", value: 1 },
        { label: "Route tables", value: routeTables },
        { label: "First rollout", value: "Canary" },
      ]}
      change="Create the endpoint, move one route table, verify live S3 traffic, then expand."
      untouched="IAM, applications, security groups, and bucket policy."
      tone={plan.readiness === "READY" ? "default" : "warning"}
      testId="transport-journey-create"
    />
  )
}

export function EnforcementJourneySummary({ plan }: { plan: S3EnforcementPlan }) {
  const outsideVpc = plan.impact.out_of_vpc_consumers
    ?? plan.caller_summaries?.filter((caller) => caller.path_status === "OUTSIDE_VPC").length
    ?? plan.out_of_vpc_principals?.length
    ?? 0
  const unsupportedLambda = plan.impact.unsupported_lambda_consumers
    ?? plan.caller_summaries?.filter((caller) => caller.scope_status === "OUT_OF_SCOPE").length
    ?? 0
  const exemptedLambda = plan.impact.exempted_lambda_consumers
    ?? plan.caller_summaries?.filter((caller) => caller.scope_status === "EXEMPTED").length
    ?? 0
  const protectedConsumers = plan.impact.protected_consumers
  const publicConsumers = plan.impact.public_consumers
  const unknownConsumers = plan.impact.unknown_consumers
  const alreadyEnforced = plan.blockers.some((blocker) => blocker.code === "ENFORCEMENT_ALREADY_PRESENT")
  const noProof = plan.blockers.some((blocker) => blocker.code === "NO_OBSERVED_CONSUMERS" || blocker.code === "NO_PRIVATE_PATH_PROOF")
  const callerEvidenceBlocked = plan.blockers.some((blocker) =>
    blocker.code === "AFFECTED_PRINCIPAL_SCOPE_INCOMPLETE"
    || blocker.code === "CONFIGURED_PRINCIPAL_UNOBSERVED"
  )

  let status = plan.readiness === "READY" ? "Ready for safety check" : "Decision required"
  let title = plan.readiness === "READY" ? "Require the proven private path" : "Resolve safety blockers before enforcement"
  let summary = `${protectedConsumers} VPC workload${protectedConsumers === 1 ? " uses" : "s use"} the reviewed endpoint. Cyntro can now review one bucket-policy rule that requires this path for object access.`
  let tone: "default" | "warning" | "complete" = plan.readiness === "READY" ? "default" : "warning"
  let change = "Add one bucket-policy rule requiring object requests to use the reviewed endpoint."

  if (alreadyEnforced) {
    status = "No policy change"
    title = "Private-path enforcement is already present"
    summary = "The reviewed bucket-policy condition already requires the private endpoint. Cyntro will leave the policy unchanged."
    change = "No bucket-policy change is proposed."
    tone = "complete"
  } else if (noProof) {
    status = "No enforceable path"
    title = "Nothing proven to enforce yet"
    summary = "Cyntro does not have fresh proof of a private path for this bucket. No bucket-policy change is proposed."
    change = "No bucket-policy change is proposed."
    tone = "complete"
  } else if (callerEvidenceBlocked) {
    status = "Multiple safety checks required"
    title = "Resolve caller scope and evidence before enforcement"
    summary = `${protectedConsumers} VPC workload${protectedConsumers === 1 ? " uses" : "s use"} the reviewed endpoint.${unsupportedLambda > 0 ? ` ${unsupportedLambda} Lambda caller${unsupportedLambda === 1 ? " also needs" : "s also need"} an exact execution-role decision.` : ""} Caller inventory or private-path evidence is still incomplete; review every blocker below before enforcement.`
    change = "Next step: resolve every caller decision and evidence gap shown below. No bucket-policy change is proposed yet."
  } else if (publicConsumers > 0) {
    status = "Migration required"
    title = `Move ${publicConsumers} VPC workload${publicConsumers === 1 ? "" : "s"} to the private path`
    summary = `${publicConsumers} VPC workload${publicConsumers === 1 ? " still uses" : "s still use"} a public S3 path. Enforcing now could break that traffic; complete the network migration first.`
    change = "Next step: migrate and verify those workloads. No bucket-policy change is proposed yet."
  } else if (unsupportedLambda > 0) {
    status = "Caller review required"
    title = `Review ${unsupportedLambda} Lambda caller${unsupportedLambda === 1 ? "" : "s"} before enforcement`
    summary = `${protectedConsumers} VPC workload${protectedConsumers === 1 ? " uses" : "s use"} the reviewed endpoint. ${unsupportedLambda} Lambda caller${unsupportedLambda === 1 ? " needs" : "s need"} an exact execution-role exemption or removal of bucket access before enforcement.`
    change = "Next step: approve each exact Lambda execution-role exemption or remove its bucket access. No bucket-policy change is proposed yet."
  } else if (exemptedLambda > 0) {
    summary = `${protectedConsumers} VPC workload${protectedConsumers === 1 ? " uses" : "s use"} the reviewed endpoint. ${exemptedLambda} Lambda caller${exemptedLambda === 1 ? " remains" : "s remain"} outside the VPC and ${exemptedLambda === 1 ? "keeps" : "keep"} access through exact reviewed execution-role exemptions.`
    change = "Add one bucket-policy rule requiring the reviewed endpoint, except for the exact approved Lambda execution roles."
  } else if (outsideVpc > 0) {
    status = "Caller review required"
    title = `Review ${outsideVpc} outside-VPC caller${outsideVpc === 1 ? "" : "s"} before enforcement`
    summary = `${protectedConsumers} VPC workload${protectedConsumers === 1 ? " uses" : "s use"} the reviewed endpoint. ${outsideVpc} caller${outsideVpc === 1 ? " accesses" : "s access"} the bucket from outside the VPC and must be reviewed before enforcement.`
    change = "Next step: review each outside-VPC caller and decide whether to exempt it or remove access. No bucket-policy change is proposed yet."
  } else if (unknownConsumers > 0) {
    status = "Evidence refresh required"
    title = "Refresh caller evidence before enforcement"
    summary = `Cyntro cannot prove the network path for ${unknownConsumers} caller${unknownConsumers === 1 ? "" : "s"}. Refresh the evidence before deciding whether to enforce.`
    change = "Next step: refresh caller-path evidence. No bucket-policy change is proposed yet."
  }

  return (
    <div className="space-y-3">
      <JourneySummary
        status={status}
        title={title}
        summary={summary}
        facts={[
          { label: "Private VPC workloads", value: protectedConsumers },
          { label: "Outside-VPC callers", value: outsideVpc, emphasis: outsideVpc ? "warning" : "default" },
          {
            label: "Reviewed endpoints",
            value: plan.vpce_ids.length === 1 ? plan.vpce_ids[0] : plan.impact.vpc_endpoints,
          },
          { label: "VPC workloads public", value: publicConsumers, emphasis: publicConsumers ? "warning" : "default" },
        ]}
        change={change}
        untouched="IAM permissions, route tables, application configuration, and bucket administration."
        tone={tone}
        testId="enforcement-journey-summary"
      />
      {plan.caller_summaries?.length ? <S3CallerInventory callers={plan.caller_summaries} /> : null}
    </div>
  )
}
