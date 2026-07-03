import type {
  IdentityAttackPath,
  CrownJewelSummary,
  PathNodeDetail,
} from "@/components/identity-attack-paths/types"
import type { TrafficFlowMapPathFilter } from "@/components/dependency-map/traffic-flow-map"

/** Build TrafficFlowMap pathFilter for one attack path — includes path spine nodes
 *  plus forward infra fan-out (SG, NACL, policies, profiles) so lane columns
 *  show compute → subnet → route → SG → NACL → egress → identity → resources. */
export function buildTrafficFlowPathFilter(
  path: IdentityAttackPath,
  jewel?: CrownJewelSummary | null,
): TrafficFlowMapPathFilter {
  const idSet = new Set<string>()
  const pathNodes: Array<{ id: string; name: string; type: string; tier?: string; lane?: string }> = []
  const pathEdges: TrafficFlowMapPathFilter["pathEdges"] = []
  const edgeSet = new Set<string>()
  const crownJewelIds: string[] = []
  const seenNameType = new Set<string>()
  const nameTypeKey = (n: { name?: string; type?: string }) =>
    `${(n.name || "").toLowerCase()}|${(n.type || "").toLowerCase()}`

  const FORWARD_BUCKETS: Array<keyof NonNullable<PathNodeDetail["infra_context"]>> = [
    "iam_policies",
    "instance_profiles",
    "kms_keys",
    "bucket_policies",
    "load_balancers",
    "target_groups",
    "log_groups",
    "monitors",
  ]
  const COMPUTE_TYPES = /ec2|lambda|fargate|ecs|instance/i
  // A forward-infra bucket sometimes enumerates the COMPUTE INSTANCES on the
  // REVERSE side of the relationship instead of a forward gate: an ALB node's
  // `load_balancers` lists its target EC2s, an InstanceProfile node's
  // `instance_profiles` lists the instances bound to it, `target_groups` lists
  // members. Pulling those into the spine makes every workload behind the same
  // ALB / profile a bright on-path step — the bug where a single EC2→S3 path
  // rendered ~4 EC2 cards at full prominence (i-0aa spine + i-0ee same-role +
  // i-009a/i-0d41 arbitrary neighbors). Forward infra is a network/identity
  // gate (SG, NACL, policy, profile, KMS, ENI), never a sibling workload. So
  // drop workload neighbors from the fan-out; the true spine workload still
  // enters via `path.nodes` above. `instance` is intentionally ABSENT from
  // WORKLOAD_NEIGHBOR so a legitimately-forward InstanceProfile card
  // (id `arn:…:instance-profile/…`) still passes; a workload is matched by an
  // ec2/lambda/fargate/ecs type or a bare `i-…` instance id.
  const WORKLOAD_NEIGHBOR = /ec2|lambda|fargate|ecs/i
  const isBareInstanceId = (id: string) => /^i-[0-9a-f]{6,}$/i.test(id)

  for (const n of path.nodes ?? []) {
    const ntKey = nameTypeKey(n)
    if (!idSet.has(n.id) && !seenNameType.has(ntKey)) {
      idSet.add(n.id)
      seenNameType.add(ntKey)
      pathNodes.push({
        id: n.id,
        name: n.name,
        type: n.type,
        tier: n.tier,
        lane: n.lane,
      })
    }
    if (n.tier === "crown_jewel") crownJewelIds.push(n.id)

    const isContainer = /vpc|subnet|securitygroup|nacl|networkacl/i.test(n.type || "")
    if (isContainer) continue
    const ic = n.infra_context
    if (!ic) continue

    const buckets: Array<keyof NonNullable<PathNodeDetail["infra_context"]>> = [...FORWARD_BUCKETS]
    if (COMPUTE_TYPES.test(n.type || "")) {
      buckets.push("security_groups", "nacls")
    }

    for (const bucket of buckets) {
      const neighbors = ic[bucket]
      if (!Array.isArray(neighbors)) continue
      for (const nb of neighbors.slice(0, 5)) {
        if (!nb?.id) continue
        // Never pull a sibling workload into the spine via a reverse-direction
        // bucket (ALB targets, profile-bound instances) — that is the "4 EC2
        // cards" bug. The path's true workload already entered via path.nodes.
        if (WORKLOAD_NEIGHBOR.test(nb.type || "") || isBareInstanceId(nb.id)) continue
        const nbKey = nameTypeKey(nb)
        if (idSet.has(nb.id) || seenNameType.has(nbKey)) continue
        idSet.add(nb.id)
        seenNameType.add(nbKey)
        pathNodes.push({
          id: nb.id,
          name: nb.name || nb.id,
          type: nb.type || "",
        })
      }
    }
  }

  for (const e of path.edges ?? []) {
    const k = `${e.source}->${e.target}|${e.type ?? ""}`
    if (edgeSet.has(k)) continue
    edgeSet.add(k)
    idSet.add(e.source)
    idSet.add(e.target)
    pathEdges!.push({
      source: e.source,
      target: e.target,
      type: e.type,
      label: e.label,
      port: e.port,
      protocol: e.protocol,
      bytes: e.traffic_bytes,
      hits: e.hit_count,
      is_observed: e.is_observed,
    })
  }

  if (jewel?.id && !crownJewelIds.includes(jewel.id)) {
    crownJewelIds.push(jewel.id)
    if (!idSet.has(jewel.id)) {
      idSet.add(jewel.id)
      pathNodes.push({
        id: jewel.id,
        name: jewel.name,
        type: jewel.type ?? "S3Bucket",
      })
    }
  }

  const jewelName = jewel?.name ?? pathNodes.find((n) => n.tier === "crown_jewel")?.name
  return {
    nodeIds: [...idSet],
    pathNodes,
    pathEdges,
    crownJewelIds: crownJewelIds.length ? crownJewelIds : undefined,
    jewelName,
    pathLabel: jewelName ? `Path → ${jewelName}` : `Path ${path.id}`,
  }
}
