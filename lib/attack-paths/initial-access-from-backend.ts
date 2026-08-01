/**
 * Backend ATT&CK Initial Access only. Missing → UNKNOWN (unavailable).
 * Never derive from node signals — delete-not-fallback (#480 shape).
 */

import type {
  IdentityAttackPath,
  InitialAccessCategory,
} from "@/components/identity-attack-paths/types"

export function initialAccessCategoryFromBackend(
  path: IdentityAttackPath,
): InitialAccessCategory {
  return path.initial_access?.category ?? "UNKNOWN"
}
