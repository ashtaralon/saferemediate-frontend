/** Fixed swimlane columns for the Attack Surface Map (no force-directed layout). */

export type SurfaceColumnId =
  | "entry_compute"
  | "firewalls"
  | "transit"
  | "identity"
  | "execution"
  | "crown_jewels"

export interface SurfaceColumnDef {
  id: SurfaceColumnId
  label: string
  /** Baseline X for nodes in this column. */
  x: number
}

export const SURFACE_COLUMNS: readonly SurfaceColumnDef[] = [
  { id: "entry_compute", label: "Entry & Compute", x: 100 },
  { id: "firewalls", label: "Firewalls", x: 400 },
  { id: "transit", label: "Transit & Gates", x: 700 },
  { id: "identity", label: "Identity & IAM", x: 1000 },
  { id: "execution", label: "App & Execution", x: 1150 },
  { id: "crown_jewels", label: "Crown Jewels", x: 1300 },
] as const

export const SURFACE_LAYOUT = {
  laneWidth: 260,
  cardWidth: 220,
  cardHeight: 76,
  cardGap: 14,
  laneHeader: 40,
  lanePadTop: 52,
  lanePadBottom: 36,
  canvasPadX: 24,
  canvasPadY: 20,
} as const

export function columnById(id: SurfaceColumnId): SurfaceColumnDef {
  const col = SURFACE_COLUMNS.find((c) => c.id === id)
  if (!col) throw new Error(`Unknown surface column: ${id}`)
  return col
}
