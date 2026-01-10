// lib/edge-types.ts
// Centralized edge type definitions and utilities

/**
 * Edge types that represent actual observed traffic (from VPC Flow Logs, CloudTrail, etc.)
 * These edges should be visually marked as "active" in the graph
 */
export const ACTIVE_EDGE_TYPES = ['ACTUAL_TRAFFIC', 'ACTUAL_API_CALL'] as const;

/**
 * All known edge types in the system
 */
export const EDGE_TYPES = {
  // Actual traffic (observed)
  ACTUAL_TRAFFIC: 'ACTUAL_TRAFFIC',       // From VPC Flow Logs
  ACTUAL_API_CALL: 'ACTUAL_API_CALL',     // From CloudTrail

  // Permissions (configured)
  ALLOWED: 'ALLOWED',                      // Security Group rules
  HAS_ROLE: 'HAS_ROLE',                   // IAM role attachment
  HAS_POLICY: 'HAS_POLICY',               // IAM policy attachment
  ASSUMES_ROLE: 'ASSUMES_ROLE',           // Cross-account/service role assumption
  INVOKES: 'INVOKES',                     // Lambda/service invocation
} as const;

export type EdgeType = typeof EDGE_TYPES[keyof typeof EDGE_TYPES];
export type ActiveEdgeType = typeof ACTIVE_EDGE_TYPES[number];

/**
 * Check if an edge type represents actual observed traffic
 */
export function isActiveEdgeType(edgeType?: string | null): boolean {
  if (!edgeType) return false;
  return ACTIVE_EDGE_TYPES.includes(edgeType as ActiveEdgeType);
}

/**
 * Get normalized edge type from edge object (handles field name inconsistencies)
 */
export function getEdgeType(edge: { type?: string; edge_type?: string; relationship_type?: string }): string {
  return edge.type || edge.edge_type || edge.relationship_type || '';
}

/**
 * Check if edge should be marked as used/active
 */
export function isEdgeActive(edge: {
  type?: string;
  edge_type?: string;
  is_used?: boolean;
  isActive?: boolean;
}): boolean {
  // Explicit is_used/isActive takes precedence
  if (edge.is_used === true || edge.isActive === true) return true;

  // Otherwise, check if it's an active edge type
  const edgeType = edge.type || edge.edge_type || '';
  return isActiveEdgeType(edgeType);
}
