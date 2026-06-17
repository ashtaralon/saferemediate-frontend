/** Backend GET /api/topology/{system}?shape=full response (#183). */

export interface TopologyDensityApi {
  tile_capacity_per_group: number
  jewel_column_capacity: number
  jewel_column_count_max: number
}

export interface TopologySubnetApi {
  subnet_id: string
  name?: string | null
  cidr?: string | null
  az: string
  vpc_id: string
  is_public: boolean
  nacl_id?: string | null
  route_table_id?: string | null
}

export interface TopologyGroupApi {
  group_id: string
  group_kind: "asg" | "sg_cluster" | "subnet_raw"
  name?: string | null
  vpc_id: string
  subnet_id: string
  az: string
  member_count: number
}

export interface TopologyResourceApi {
  node_id: string
  node_type: string
  name?: string | null
  vpc_id: string
  subnet_id: string
  az: string
  group_id: string
  group_kind: "asg" | "sg_cluster" | "subnet_raw"
  security_groups?: string[]
  is_public?: boolean
}

export interface TopologyJewelApi {
  node_id: string
  node_type: string
  name?: string | null
  column_index: number
  row_index: number
}

export interface TopologySnapshotFullApi {
  system_name: string
  topology_version: string
  schema_version: string
  vpcs: Array<{ vpc_id: string; name?: string | null; region?: string | null }>
  subnets: TopologySubnetApi[]
  resources: TopologyResourceApi[]
  groups: TopologyGroupApi[]
  crown_jewels: TopologyJewelApi[]
  density: TopologyDensityApi
}
