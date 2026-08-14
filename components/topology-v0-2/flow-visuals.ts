import type { TrafficEdge, TrafficEdgeClass } from "./types"

export const FLOW_COLOR_BY_CLASS: Record<TrafficEdgeClass, string> = {
  internal: "#0E8B7A",
  edge_service: "#7E57C2",
  vpce: "#3B82F6",
  egress: "#F59E0B",
  database: "#2E73B8",
}

export const FLOW_ALERT_COLOR = "#DC2626"

export const FLOW_LEGEND_ITEMS: Array<{
  key: TrafficEdgeClass | "alert"
  label: string
  color: string
}> = [
  { key: "internal", label: "Service call", color: FLOW_COLOR_BY_CLASS.internal },
  { key: "edge_service", label: "AWS data service", color: FLOW_COLOR_BY_CLASS.edge_service },
  { key: "vpce", label: "VPC endpoint", color: FLOW_COLOR_BY_CLASS.vpce },
  { key: "egress", label: "Internet egress", color: FLOW_COLOR_BY_CLASS.egress },
  { key: "database", label: "Database", color: FLOW_COLOR_BY_CLASS.database },
  { key: "alert", label: "Exposure / attack", color: FLOW_ALERT_COLOR },
]

export function flowStroke(edge: Pick<TrafficEdge, "edge_class" | "flow_highlight" | "is_exposed">): string {
  if (edge.flow_highlight === "attack_path" || edge.is_exposed) return FLOW_ALERT_COLOR
  return FLOW_COLOR_BY_CLASS[edge.edge_class ?? "internal"]
}

