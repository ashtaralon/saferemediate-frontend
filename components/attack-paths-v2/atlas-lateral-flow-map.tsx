"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"
import type {
  NodeType,
  ModeledMoveNode,
  SecurityCheckpoint,
  ServiceNode,
  SystemArchitecture,
} from "@/components/dependency-map/traffic-flow-map"
import type { CanvasEdge, CanvasRelationshipType } from "@/lib/types/attack-canvas"
import type {
  AtlasFootholdCandidate,
  AtlasLateralChain,
  AtlasLateralResponse,
} from "./use-atlas-lateral"

const TrafficFlowMap = dynamic(
  () => import("@/components/dependency-map/traffic-flow-map"),
  { ssr: false },
)

function short(value: string, max = 42): string {
  const tail = value.split(/[/:]/).filter(Boolean).pop() ?? value
  return tail.length > max ? `${tail.slice(0, max - 1)}…` : tail
}

function workloadNodeType(type: string): NodeType {
  if (type === "LambdaFunction") return "lambda"
  if (type === "APIGateway") return "api_gateway"
  if (type === "LoadBalancer") return "load_balancer"
  return "compute"
}

function jewelNodeType(type: string): NodeType {
  const normalized = type.toLowerCase()
  if (normalized.includes("dynamodb")) return "dynamodb"
  if (normalized.includes("rds") || normalized.includes("database")) return "database"
  if (normalized.includes("kms")) return "kms"
  if (normalized.includes("secret")) return "secret"
  return "storage"
}

function edge(
  source: string,
  relationship: CanvasRelationshipType,
  target: string,
  evidenceIds: string[],
): CanvasEdge {
  return {
    id: `${source}|${relationship}|${target}`,
    source_aws_id: source,
    target_aws_id: target,
    relationship,
    observed: false,
    hit_count: null,
    bytes: null,
    first_seen: null,
    last_seen: null,
    port: null,
    protocol: null,
    inferred: true,
    inferred_reason: evidenceIds.length
      ? `ATLAS replay transition · evidence ${evidenceIds.map(short).join(", ")}`
      : "ATLAS replay transition — modeled, not observed traffic",
  }
}

/**
 * Project a replay-validated ATLAS chain into the canonical TrafficFlowMap
 * contract. State-delta arrays are already typed by the model, so this adapter
 * does not infer infrastructure from resource names. Modeled transitions stay
 * dashed/unobserved and carry their ATLAS evidence ids.
 */
export function buildAtlasLateralArchitecture(
  chain: AtlasLateralChain,
  foothold: AtlasFootholdCandidate,
  jewelName: string,
  jewelId = jewelName,
  jewelType = "S3Bucket",
): SystemArchitecture {
  const computeServices: ServiceNode[] = [
    {
      id: foothold.workload_id,
      name: foothold.workload_name,
      shortName: short(foothold.workload_id),
      type: workloadNodeType(foothold.workload_type),
      instanceId: foothold.workload_id,
    },
  ]
  const iamRoles: SecurityCheckpoint[] = []
  const modeledMoves: ModeledMoveNode[] = []
  const resources: ServiceNode[] = []
  const edges: CanvasEdge[] = []
  const onPathNodeIds = new Set<string>([foothold.workload_id])
  const seenCompute = new Set([foothold.workload_id])
  const seenRoles = new Set<string>()
  const seenResources = new Set<string>()

  let previousId = foothold.workload_id
  chain.steps.forEach((step, index) => {
    const stepId = `atlas-step:${chain.chain_id}:${step.step_index}`
    const capturedIdentity = step.state_delta.added_captured_identities[0]
    const accessibleResource = step.state_delta.added_accessible_resources[0]
    const compromisedWorkload = step.state_delta.added_compromised_workloads[0]
    const syntheticNode = step.state_delta.added_synthetic_nodes[0]
    const outcome =
      capturedIdentity ??
      accessibleResource ??
      compromisedWorkload ??
      syntheticNode ??
      "State transition"
    const category: ModeledMoveNode["category"] = capturedIdentity
      ? "identity"
      : accessibleResource
        ? "data"
        : "movement"
    modeledMoves.push({
      id: stepId,
      name: step.primitive_id.replaceAll("_", " "),
      shortName: step.primitive_id.replaceAll("_", " "),
      type: "api_call",
      awsServiceType: "ATLASPrimitive",
      instanceId: `Move ${index + 1}${step.edge_evidence_ids.length ? ` · evidence ${step.edge_evidence_ids.map(short).join(", ")}` : ""}`,
      moveIndex: index + 1,
      primitiveId: step.primitive_id,
      category,
      outcome,
      evidenceIds: step.edge_evidence_ids,
    })
    onPathNodeIds.add(stepId)
    edges.push(edge(previousId, "RUNTIME_CALLS", stepId, step.edge_evidence_ids))

    for (const workloadId of step.state_delta.added_compromised_workloads) {
      if (!seenCompute.has(workloadId)) {
        seenCompute.add(workloadId)
        computeServices.push({
          id: workloadId,
          name: short(workloadId),
          shortName: "Compromised workload",
          type: "compute",
        })
      }
      onPathNodeIds.add(workloadId)
    }

    for (const identityId of step.state_delta.added_captured_identities) {
      if (!seenRoles.has(identityId)) {
        seenRoles.add(identityId)
        iamRoles.push({
          id: identityId,
          type: "iam_role",
          name: short(identityId),
          shortName: "Captured identity",
          usedCount: 0,
          totalCount: null,
          gapCount: 0,
          connectedSources: [foothold.workload_id],
          connectedTargets: [stepId],
          onPath: true,
        })
      }
      onPathNodeIds.add(identityId)
    }

    for (const resourceId of step.state_delta.added_accessible_resources) {
      if (resourceId !== jewelId && resourceId !== jewelName && !seenResources.has(resourceId)) {
        seenResources.add(resourceId)
        resources.push({
          id: resourceId,
          name: short(resourceId),
          shortName: "Accessible resource",
          type: "storage",
        })
      }
      onPathNodeIds.add(resourceId)
    }
    previousId = stepId
  })

  resources.push({
    id: jewelId,
    name: jewelName,
    shortName: short(jewelId),
    type: jewelNodeType(jewelType),
    awsServiceType: jewelType,
    isCrownJewel: true,
  })
  onPathNodeIds.add(jewelId)
  edges.push(
    edge(
      previousId,
      "ACCESSES_RESOURCE",
      jewelId,
      chain.steps.at(-1)?.edge_evidence_ids ?? [],
    ),
  )

  return {
    computeServices,
    resources,
    modeledMoves,
    subnets: [],
    securityGroups: [],
    nacls: [],
    iamRoles,
    instanceProfiles: [],
    iamPolicies: [],
    vpcEndpoints: [],
    egressGateways: [],
    flows: [],
    edges,
    totalBytes: 0,
    totalConnections: 0,
    totalGaps: 0,
    structuralFallbackUsed: true,
    metricsBasis: "cloudtrail",
    networkPosture: {
      settled: false,
      reason: "ATLAS replay does not return subnet, route-table, SG or NACL checkpoints for this modeled chain.",
    },
    onPathNodeIds,
    onPathEdgeIds: new Set(edges.map((item) => item.id)),
  }
}

export function AtlasLateralFlowMap({
  selectedFoothold,
  response,
  jewelName,
  jewelId,
  jewelType,
  systemName,
}: {
  selectedFoothold: AtlasFootholdCandidate
  response: AtlasLateralResponse
  jewelName: string
  jewelId?: string
  jewelType?: string
  systemName?: string
}) {
  const [chainIndex, setChainIndex] = useState(0)
  useEffect(() => setChainIndex(0), [response.graph_snapshot_id, selectedFoothold.workload_id])
  const chain = response.chains[chainIndex] ?? response.chains[0]
  const architecture = useMemo(
    () =>
      chain
        ? buildAtlasLateralArchitecture(
            chain,
            selectedFoothold,
            jewelName,
            jewelId,
            jewelType,
          )
        : null,
    [chain, selectedFoothold, jewelName, jewelId, jewelType],
  )
  if (!chain || !architecture) return null

  return (
    <div className="flex min-h-[640px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#0b1828]" data-testid="atlas-interactive-flow-map">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-[#102236] px-3 py-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Replay-validated attack chains">
          {response.chains.map((item, index) => (
            <button
              key={item.chain_id}
              type="button"
              role="tab"
              aria-selected={index === chainIndex}
              onClick={() => setChainIndex(index)}
              className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold ${index === chainIndex ? "border-red-400 bg-red-500/15 text-red-200" : "border-slate-600 bg-slate-800/60 text-slate-300 hover:border-slate-400"}`}
            >
              Chain {index + 1} · {item.steps.length} moves
            </button>
          ))}
        </div>
        <div className="font-mono text-[9px] text-slate-400">
          feasibility {Math.round(chain.feasibility_score * 100)}% · cost {chain.total_cost} · modeled transitions are dashed
        </div>
      </div>
      <div className="min-h-[580px] flex-1">
        <TrafficFlowMap
          key={`atlas-tfm-${chain.chain_id}`}
          systemName={systemName ?? ""}
          architectureOverride={architecture}
          observedMode={false}
          suppressSyntheticApiCalls
          titleOverride="Lateral Movement Map"
          innerTitleOverride={`Attack chain ${chainIndex + 1} · ${chain.steps.length} moves`}
          innerSubtitleOverride={`${selectedFoothold.workload_name} → ${jewelName} · replay validated · modeled, not observed`}
          pathBadgeOverride={`${selectedFoothold.workload_name} → ${jewelName}`}
          defaultShowVPCBoundaries={false}
        />
      </div>
      {chain.assumptions_consumed.length ? (
        <div className="border-t border-slate-700 bg-[#102236] px-3 py-2 text-[9px] text-slate-400">
          Assumptions: {chain.assumptions_consumed.join(" · ").replaceAll("_", " ")}
        </div>
      ) : null}
    </div>
  )
}
