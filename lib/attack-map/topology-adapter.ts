/**
 * Adapts #183 TopologySnapshotFull API → slot-mapper TopologySnapshot geometry.
 * Pure, deterministic — same API payload → same boxes every time.
 */
import type { DensityRules, GroupBox, SubnetBox, TopologySnapshot } from "./slot-mapper"
import type { TopologyGroupApi, TopologySnapshotFullApi } from "./api-types"

const TILE_W = 48
const TILE_H = 32
const TILE_GAP = 8
const TILES_PER_ROW = 4
const SUBNET_PAD = 12
const GROUP_PAD = 8
const AZ_GAP = 28
const SUBNET_GAP = 16
const VPC_PAD = 32
const JEWEL_COL_STEP = 108
const JEWEL_ROW_H = TILE_H + TILE_GAP + 6

export function densityFromApi(
  api: TopologySnapshotFullApi["density"],
): DensityRules {
  return {
    jewel_column_capacity: api.jewel_column_capacity,
    tile_w: TILE_W,
    tile_h: TILE_H,
    tile_gap: TILE_GAP,
    tiles_per_row: TILES_PER_ROW,
  }
}

function groupBoxSize(memberCount: number, capacity: number, density: DensityRules): { w: number; h: number } {
  const cap = Math.max(capacity, memberCount, 1)
  const rows = Math.ceil(cap / density.tiles_per_row)
  const w = density.tiles_per_row * (density.tile_w + density.tile_gap) + GROUP_PAD * 2
  const h = rows * (density.tile_h + density.tile_gap) + GROUP_PAD * 2
  return { w, h }
}

/** Build slot-mapper topology geometry from the flat #183 full snapshot. */
export function adaptTopologyFull(api: TopologySnapshotFullApi): TopologySnapshot {
  const density = densityFromApi(api.density)
  const tileCap = api.density.tile_capacity_per_group

  const groupsBySubnet = new Map<string, TopologyGroupApi[]>()
  for (const g of api.groups) {
    const list = groupsBySubnet.get(g.subnet_id) ?? []
    list.push(g)
    groupsBySubnet.set(g.subnet_id, list)
  }
  for (const list of groupsBySubnet.values()) {
    list.sort((a, b) => a.group_id.localeCompare(b.group_id))
  }

  const subnetsByAz = new Map<string, TopologySnapshotFullApi["subnets"]>()
  for (const s of api.subnets) {
    const list = subnetsByAz.get(s.az) ?? []
    list.push(s)
    subnetsByAz.set(s.az, list)
  }
  const azOrder = [...subnetsByAz.keys()].sort()

  const subnetBoxes: Record<string, SubnetBox> = {}
  const groupBoxes: Record<string, GroupBox> = {}

  let contentW = 0
  let contentH = 0
  let xCursor = VPC_PAD

  for (const az of azOrder) {
    const subnets = (subnetsByAz.get(az) ?? []).sort((a, b) =>
      a.subnet_id.localeCompare(b.subnet_id),
    )
    let azW = 0
    let azH = 0
    let yStack = VPC_PAD
    for (const sub of subnets) {
      const groups = groupsBySubnet.get(sub.subnet_id) ?? []
      let subW = 160
      let subH = SUBNET_PAD * 2 + 24
      let gy = SUBNET_PAD + 20

      for (const g of groups) {
        const cap = Math.max(tileCap, g.member_count)
        const { w, h } = groupBoxSize(g.member_count, cap, density)
        subW = Math.max(subW, w + SUBNET_PAD * 2)
        groupBoxes[g.group_id] = {
          id: g.group_id,
          subnet_id: sub.subnet_id,
          kind: g.group_kind,
          capacity: cap,
          x: 0,
          y: 0,
          w,
          h,
        }
        subH = gy + h + GROUP_PAD
        gy += h + GROUP_PAD
      }

      subnetBoxes[sub.subnet_id] = {
        id: sub.subnet_id,
        az: sub.az,
        kind: sub.is_public ? "public" : "private",
        x: 0,
        y: 0,
        w: subW,
        h: subH,
      }
      azW = Math.max(azW, subW)
      yStack += subH + SUBNET_GAP
    }

    azH = yStack - VPC_PAD - SUBNET_GAP

    for (const sub of subnets) {
      const box = subnetBoxes[sub.subnet_id]
      // y assigned in second pass below
      box.x = xCursor + (azW - box.w) / 2
    }

    let yAssign = VPC_PAD
    for (const sub of subnets) {
      const box = subnetBoxes[sub.subnet_id]
      box.y = yAssign
      const groups = groupsBySubnet.get(sub.subnet_id) ?? []
      let gy = box.y + SUBNET_PAD + 20
      for (const g of groups) {
        const gb = groupBoxes[g.group_id]
        gb.x = box.x + SUBNET_PAD
        gb.y = gy
        gy += gb.h + GROUP_PAD
      }
      yAssign += box.h + SUBNET_GAP
    }

    contentW = xCursor + azW - VPC_PAD
    xCursor += azW + AZ_GAP
    contentH = Math.max(contentH, azH)
  }

  const jewelCols = api.density.jewel_column_count_max
  const jewelAreaW = jewelCols * JEWEL_COL_STEP + 40
  const vpcW = Math.max(contentW + VPC_PAD, 320)
  const vpcH = Math.max(contentH + VPC_PAD, 240)

  const vpc = { x: 40, y: 80, w: vpcW, h: vpcH }
  const jewelX = vpc.x + vpc.w + 24

  const membership: TopologySnapshot["membership"] = {}
  for (const r of api.resources) {
    membership[r.node_id] = {
      subnet_id: r.subnet_id,
      az: r.az,
      group_id: r.group_id,
    }
  }
  for (const j of api.crown_jewels) {
    membership[j.node_id] = membership[j.node_id] ?? {}
  }

  return {
    system: api.system_name,
    vpc,
    subnets: subnetBoxes,
    groups: groupBoxes,
    membership,
    crown_jewel_column: {
      x: jewelX,
      top_y: vpc.y + 36,
      row_height: JEWEL_ROW_H,
      col_step: JEWEL_COL_STEP,
      capacity: api.density.jewel_column_capacity,
      max_columns: api.density.jewel_column_count_max,
    },
    drift_lane: {
      x: vpc.x,
      y: vpc.y + vpc.h + 48,
      w: vpc.w,
      h: 96,
    },
    orphan_lane: {
      x: vpc.x + vpc.w + 16,
      y: vpc.y + vpc.h + 48,
      w: jewelAreaW,
      h: 96,
    },
    external_slots: {
      internet: { x: vpc.x + vpc.w / 2 - 24, y: vpc.y - 56 },
      onprem: { x: vpc.x + vpc.w / 2 - 120, y: vpc.y - 56 },
      open_cidr: { x: vpc.x + vpc.w / 2 + 72, y: vpc.y - 56 },
    },
  }
}
