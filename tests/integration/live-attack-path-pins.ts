/**
 * Live IAP pins for alon-prod attack-path / facade specs.
 * Refresh when IAP re-indexes display ids; attack_path_id (sha256) is stable.
 */
export const ALON_PROD = "alon-prod"
export const CYNTO_DEMO = "cyntro-demo"

/** IAP display id — use in ?path= URLs. */
export const ALON_LOGS_PATH_DISPLAY_ID = "path-8e64e734b0f6"
/** Materialized :AttackPath.id — use in /api/proxy/attack-map/{id}. */
export const ALON_LOGS_PATH_CANONICAL_ID =
  "432c6db135ff8b2af80a67e22ec466f2b4fd3a37512bffea62c73779ac199d42"
export const ALON_LOGS_JEWEL_ARN = "arn:aws:s3:::saferemediate-logs-745783559495"

/** Facade IAP fetch shape — must match attack-path proxy route. */
export const FACADE_IAP_QUERY = "?max_jewels=8&max_paths_per_jewel=8&enriched=true"
