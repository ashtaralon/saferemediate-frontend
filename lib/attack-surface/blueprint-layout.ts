/**
 * 1:1 geometric coordinates from the multilevel Attack Surface blueprint.
 * Primary on-path nodes claim fixed slots; overflow stacks vertically (+150px).
 */

export type AwsNodeType =
  | "EXTERNAL"
  | "GATEWAY"
  | "COMPUTE"
  | "SECURITY_GROUP"
  | "NACL"
  | "SUBNET"
  | "ROUTE_TABLE"
  | "IAM_ROLE"
  | "INSTANCE_PROFILE"
  | "IAM_POLICY"
  | "STORAGE"
  | "VPCE"
  | "EXECUTION"

export type BlueprintSlot =
  | "attacker"
  | "igw"
  | "compute"
  | "security_group"
  | "nacl"
  | "subnet"
  | "route_table"
  | "iam_role"
  | "instance_profile"
  | "crown_jewel"
  | "execution"

export const BLUEPRINT_COORDS: Record<BlueprintSlot, { x: number; y: number }> = {
  attacker: { x: 700, y: 10 },
  igw: { x: 700, y: 140 },
  compute: { x: 150, y: 280 },
  security_group: { x: 450, y: 280 },
  nacl: { x: 450, y: 420 },
  subnet: { x: 750, y: 280 },
  route_table: { x: 750, y: 420 },
  iam_role: { x: 1080, y: 280 },
  instance_profile: { x: 1080, y: 420 },
  crown_jewel: { x: 1420, y: 260 },
  execution: { x: 1150, y: 420 },
}

export const BLUEPRINT_CANVAS = {
  width: 1720,
  height: 640,
  padX: 32,
  padY: 24,
  stackOffsetY: 150,
  cardWidth: 240,
  cardHeight: 88,
  jewelSize: 180,
} as const

export function blueprintPosition(slot: BlueprintSlot, index: number): { x: number; y: number } {
  const base = BLUEPRINT_COORDS[slot]
  return { x: base.x, y: base.y + index * BLUEPRINT_CANVAS.stackOffsetY }
}

export function nodeDimensions(awsType: AwsNodeType, isCrownJewel?: boolean): { width: number; height: number } {
  if (isCrownJewel || awsType === "STORAGE") {
    return { width: BLUEPRINT_CANVAS.jewelSize, height: BLUEPRINT_CANVAS.jewelSize }
  }
  return { width: BLUEPRINT_CANVAS.cardWidth, height: BLUEPRINT_CANVAS.cardHeight }
}
