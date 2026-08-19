/**
 * Defensive normalizers for topology-risk payloads.
 * Stale localStorage or partial API responses must not crash the canvas.
 */
import type { IamRoleRollup, VpcTopology } from "./types"

export function normalizeIamRole(role: IamRoleRollup): IamRoleRollup {
  return {
    ...role,
    workload_ids: Array.isArray(role.workload_ids) ? role.workload_ids : [],
    attachment_modes: Array.isArray(role.attachment_modes) ? role.attachment_modes : [],
  }
}

const EMPTY_EDGES: VpcTopology["edges"] = { igws: [], nat_gws: [], vpces: [] }

export function normalizeVpcTopology(vt: VpcTopology | null | undefined): VpcTopology {
  if (!vt) {
    return {
      region: null,
      account_id: null,
      vpc_id: null,
      azs: [],
      subnets: [],
      route_tables: [],
      effective_routes: [],
      edge_ingress_paths: [],
      edges: EMPTY_EDGES,
      unknown_subnet_count: 0,
      security_groups: [],
      iam_roles: [],
    }
  }
  const edges = vt.edges ?? EMPTY_EDGES
  return {
    ...vt,
    azs: vt.azs ?? [],
    subnets: (vt.subnets ?? []).map(subnet => ({
      ...subnet,
      effective_routes: Array.isArray(subnet.effective_routes) ? subnet.effective_routes : [],
    })),
    route_tables: vt.route_tables ?? [],
    effective_routes: vt.effective_routes ?? [],
    edge_ingress_paths: Array.isArray(vt.edge_ingress_paths) ? vt.edge_ingress_paths : [],
    edges: {
      igws: edges.igws ?? [],
      nat_gws: edges.nat_gws ?? [],
      vpces: edges.vpces ?? [],
    },
    security_groups: vt.security_groups ?? [],
    iam_roles: (vt.iam_roles ?? []).map(normalizeIamRole),
  }
}
