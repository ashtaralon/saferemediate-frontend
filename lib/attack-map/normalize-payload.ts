/**
 * Thin normalization before slot-mapper — maps backend node_type labels
 * to the canonical set slot-mapper classifies on. Does not alter geometry logic.
 */
import type { AttackMapPayload, MovementHop } from "./slot-mapper"

const TYPE_ALIASES: Record<string, string> = {
  LambdaFunction: "Lambda",
  RDSInstance: "RDS",
  DynamoDBTable: "DynamoDBTable",
  ECSTask: "ECSTask",
}

function normalizeHop(hop: MovementHop): MovementHop {
  const node_type = TYPE_ALIASES[hop.node_type] ?? hop.node_type
  if (node_type === hop.node_type) return hop
  return { ...hop, node_type }
}

export function normalizeAttackMapPayload(payload: AttackMapPayload): AttackMapPayload {
  return {
    ...payload,
    movement_chain: payload.movement_chain.map(normalizeHop),
  }
}
