import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { fromCaughtError, relayBackendError } from "@/lib/server/proxy-error"
export const dynamic = "force-dynamic"

const backendUrl = getBackendBaseUrl()

function resourceType(id: string): string {
  return id.startsWith("i-")
    ? "EC2Instance"
    : id.startsWith("vpc-")
      ? "VPC"
      : id.startsWith("subnet-")
        ? "Subnet"
        : id.startsWith("sg-")
          ? "SecurityGroup"
          : id.startsWith("rtb-")
            ? "RouteTable"
            : id.startsWith("igw-")
              ? "InternetGateway"
              : id.startsWith("nat-")
                ? "NatGateway"
                : "Unknown"
}

type BackendRow = { resource_id?: string; proposed_system?: string; error?: string; reason?: string }

/**
 * AWS SystemName tagging passthrough. Two rules this proxy used to break:
 *  - the backend's answer is the answer: counts and every resource's outcome come from
 *    its `results.success / failed / skipped` lists. This proxy used to mark every
 *    requested resource successful and report `taggedCount: tagged_count || resources.length`,
 *    so a backend `tagged_count: 0, failed: 1` became one "tagged" resource and success.
 *  - a refusal is relayed typed (relayBackendError): the write is contained
 *    (`aws_system_tag_write`, 409 off_boundary_mutation_refused) and the caller shows why.
 * Only the SystemName key is written by this route; other tag keys are not supported here.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { systemName, resourceIds } = body
    const resources = (Array.isArray(resourceIds) ? resourceIds : []).map((id: string) => ({ id, type: resourceType(id) }))

    const response = await fetch(`${backendUrl}/api/auto-tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_name: systemName, resources, dry_run: body?.dryRun === true }),
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) return relayBackendError(response)

    const data = await response.json()
    const results = data?.results ?? {}
    const rows = (key: string): BackendRow[] => (Array.isArray(results[key]) ? results[key] : [])
    const outcomes = [
      ...rows("success").map((r) => ({ resourceId: r.resource_id, success: true, systemName: r.proposed_system })),
      ...rows("failed").map((r) => ({ resourceId: r.resource_id, success: false, error: r.error ?? "failed" })),
      ...rows("skipped").map((r) => ({ resourceId: r.resource_id, success: false, skipped: true, reason: r.reason ?? "skipped" })),
    ]
    const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null)
    const failed = count(data?.failed_count)
    const tagged = count(data?.tagged_count)
    return Response.json({
      // Success only when the backend reports no failure and at least one resource tagged.
      success: failed === 0 && (tagged ?? 0) > 0,
      dryRun: data?.dry_run === true,
      taggedCount: tagged,
      failedCount: failed,
      skippedCount: count(data?.skipped_count),
      results: outcomes,
    })
  } catch (error) {
    return fromCaughtError(error)
  }
}
