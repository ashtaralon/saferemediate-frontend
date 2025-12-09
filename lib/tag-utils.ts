/**
 * Tag Utilities for SafeRemediate
 *
 * Handles case-insensitive tag lookups and consistent tag writing.
 * The system accepts both "SystemName" and "systemname" when reading,
 * but uses consistent casing when writing tags.
 */

// Standard tag keys (used when WRITING tags)
export const TAG_KEYS = {
  SYSTEM_NAME: "SystemName",
  ENVIRONMENT: "Environment",
  MANAGED_BY: "ManagedBy",
  DISCOVERY_METHOD: "DiscoveryMethod",
  DISCOVERED_AT: "DiscoveredAt",
} as const

// All accepted variations for each tag (used when READING tags)
const TAG_VARIATIONS = {
  systemName: ["SystemName", "systemname", "systemName", "system_name", "SYSTEMNAME"],
  environment: ["Environment", "environment", "ENVIRONMENT", "env", "ENV"],
  managedBy: ["ManagedBy", "managedby", "managed_by", "MANAGEDBY"],
} as const

/**
 * Get a tag value with case-insensitive lookup
 * Checks multiple possible key variations
 */
export function getTag(
  obj: Record<string, any> | null | undefined,
  tagType: keyof typeof TAG_VARIATIONS
): string | undefined {
  if (!obj) return undefined

  const variations = TAG_VARIATIONS[tagType]
  for (const key of variations) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return String(obj[key])
    }
  }
  return undefined
}

/**
 * Get SystemName from a node object
 * Checks: node.SystemName, node.systemname, node.systemName,
 *         node.properties.SystemName, node.tags.SystemName, etc.
 */
export function getSystemName(node: Record<string, any> | null | undefined): string | undefined {
  if (!node) return undefined

  // Direct properties (all case variations)
  for (const key of TAG_VARIATIONS.systemName) {
    if (node[key] !== undefined && node[key] !== null) {
      return String(node[key])
    }
  }

  // Check nested properties object
  if (node.properties) {
    for (const key of TAG_VARIATIONS.systemName) {
      if (node.properties[key] !== undefined && node.properties[key] !== null) {
        return String(node.properties[key])
      }
    }
  }

  // Check nested tags object
  if (node.tags) {
    for (const key of TAG_VARIATIONS.systemName) {
      if (node.tags[key] !== undefined && node.tags[key] !== null) {
        return String(node.tags[key])
      }
    }
  }

  return undefined
}

/**
 * Get Environment from a node object
 * Checks all case variations and nested objects
 */
export function getEnvironment(node: Record<string, any> | null | undefined): string | undefined {
  if (!node) return undefined

  // Direct properties
  for (const key of TAG_VARIATIONS.environment) {
    if (node[key] !== undefined && node[key] !== null) {
      return String(node[key])
    }
  }

  // Check nested properties object
  if (node.properties) {
    for (const key of TAG_VARIATIONS.environment) {
      if (node.properties[key] !== undefined && node.properties[key] !== null) {
        return String(node.properties[key])
      }
    }
  }

  // Check nested tags object
  if (node.tags) {
    for (const key of TAG_VARIATIONS.environment) {
      if (node.tags[key] !== undefined && node.tags[key] !== null) {
        return String(node.tags[key])
      }
    }
  }

  return undefined
}

/**
 * Create a standardized tags object for writing
 * Always uses consistent casing (PascalCase for SystemName, Environment)
 */
export function createTags(params: {
  systemName: string
  environment: string
  managedBy?: string
  discoveryMethod?: string
  additionalTags?: Record<string, string>
}): Record<string, string> {
  const tags: Record<string, string> = {
    [TAG_KEYS.SYSTEM_NAME]: params.systemName,
    [TAG_KEYS.ENVIRONMENT]: params.environment,
  }

  if (params.managedBy) {
    tags[TAG_KEYS.MANAGED_BY] = params.managedBy
  }

  if (params.discoveryMethod) {
    tags[TAG_KEYS.DISCOVERY_METHOD] = params.discoveryMethod
  }

  if (params.additionalTags) {
    Object.assign(tags, params.additionalTags)
  }

  return tags
}

/**
 * Check if a node has the required mandatory tags
 */
export function hasMandatoryTags(node: Record<string, any> | null | undefined): boolean {
  return !!getSystemName(node) && !!getEnvironment(node)
}

/**
 * Get all tags from a node in a normalized format
 */
export function getNormalizedTags(node: Record<string, any> | null | undefined): Record<string, string> {
  const result: Record<string, string> = {}

  const systemName = getSystemName(node)
  const environment = getEnvironment(node)

  if (systemName) result[TAG_KEYS.SYSTEM_NAME] = systemName
  if (environment) result[TAG_KEYS.ENVIRONMENT] = environment

  // Copy other tags from node.tags if present
  if (node?.tags) {
    for (const [key, value] of Object.entries(node.tags)) {
      if (!result[key] && value !== undefined && value !== null) {
        result[key] = String(value)
      }
    }
  }

  return result
}
