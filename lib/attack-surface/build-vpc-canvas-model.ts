/**
 * Maps live SystemArchitecture → the VPC canvas diagram model.
 */

import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"

export interface VpcCanvasModel {
  vpcLabel: string
  attacker: { name: string; detail: string } | null
  igw: { name: string; id: string } | null
  subnet: { name: string; cidr: string } | null
  dataSubnetLabel: string
  appServer: { name: string; id: string; alert?: string } | null
  securityGroup: { name: string; id: string } | null
  routeTable: { name: string; detail: string } | null
  nacl: { id: string } | null
  iamRole: { name: string; alert?: string; label: string } | null
  crownJewel: { name: string; arn: string } | null
  attackLabels: { ingress: string; exfil: string }
}

function onPath(id: string, arch: SystemArchitecture, path: IdentityAttackPath): boolean {
  if (arch.onPathNodeIds?.has(id)) return true
  return (path.nodes ?? []).some((n) => n.id === id)
}

function pickOnPath<T extends { id: string }>(
  items: T[],
  arch: SystemArchitecture,
  path: IdentityAttackPath,
): T | undefined {
  return items.find((i) => onPath(i.id, arch, path)) ?? items[0]
}

export function buildVpcCanvasModel(
  architecture: SystemArchitecture,
  path: IdentityAttackPath,
): VpcCanvasModel | null {
  const compute = pickOnPath(architecture.computeServices, architecture, path)
  const jewel =
    architecture.resources.find((r) => r.isCrownJewel) ??
    architecture.resources.find((r) => r.type === "storage" || r.type === "database")

  if (!compute && !jewel) return null

  const subnet =
    architecture.subnets.find((s) => compute && s.connectedComputeIds?.includes(compute.id)) ??
    pickOnPath(architecture.subnets, architecture, path)

  const sg = pickOnPath(architecture.securityGroups, architecture, path)
  const nacl = pickOnPath(architecture.nacls, architecture, path)
  const role = pickOnPath(architecture.iamRoles, architecture, path)
  const igw = architecture.egressGateways.find((g) => g.kind === "InternetGateway")

  const entry = architecture.entryPoints?.[0] ?? architecture.principals?.[0]
  const unusedPerms = role
    ? role.gapCount ?? Math.max(0, role.totalCount - role.usedCount)
    : 0

  const vpcName =
    architecture.vpcGroups?.[0]?.vpcName ??
    architecture.workloadNetwork?.vpc_name ??
    architecture.workloadNetwork?.vpc_id ??
    "VPC"

  return {
    vpcLabel: vpcName,
    attacker: entry
      ? {
          name: entry.type === "internet" ? "ATTACKER (External)" : entry.shortName || entry.name,
          detail: entry.type === "internet" ? "AWS CLI / Compromised Creds" : "Compromised API Credentials",
        }
      : { name: "ATTACKER (External)", detail: "AWS CLI / Compromised Creds" },
    igw: igw ? { name: igw.shortName || igw.name, id: igw.id } : null,
    subnet: subnet
      ? {
          name: subnet.shortName || subnet.name,
          cidr: subnet.cidrBlock ?? subnet.id,
        }
      : null,
    dataSubnetLabel: jewel ? "Data Subnet (Private)" : "Data Subnet (Private)",
    appServer: compute
      ? {
          name: compute.shortName || compute.name,
          id: compute.instanceId ?? compute.id,
          alert: onPath(compute.id, architecture, path) ? "SSRF (IMDSv1) Detected" : undefined,
        }
      : null,
    securityGroup: sg ? { name: sg.shortName || sg.name, id: sg.id } : null,
    routeTable: subnet?.routeTableId
      ? {
          name: subnet.routeTableId,
          detail:
            typeof subnet.routeTableCount === "number"
              ? `${subnet.routeTableCount} routes`
              : "routes",
        }
      : null,
    nacl: nacl ? { id: nacl.shortName || nacl.id } : null,
    iamRole: role
      ? {
          name: role.shortName || role.name,
          label: "IAM Role",
          alert: unusedPerms > 0 ? `${unusedPerms} Unused Perms` : undefined,
        }
      : null,
    crownJewel: jewel
      ? { name: jewel.shortName || jewel.name, arn: jewel.id }
      : null,
    attackLabels: {
      ingress: "ATTACK PATH: SSRF Credentials Exfil",
      exfil: "Access & Exfiltration (s3:GetObject)",
    },
  }
}

export const VPC_CANVAS_SIZE = { width: 1200, height: 850 } as const
