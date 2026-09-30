/**
 * The hosted deployment's backends -- the ONE place their addresses are written.
 *
 * A customer-resident image (Dockerfile.customer-pilot) must reach nothing Cyntro operates, so
 * `scripts/prepare-customer-image.mjs` rewrites this module before the build to export `null`
 * for every entry, and the build then greps its own output for these hosts and fails on a hit.
 * Every resolver that has a hosted fallback reads it from here; none writes an address of its own.
 */
export type HostedDefaults = {
  /** The tenant-scoped serving surface that owns the durable Attack Path snapshots (C1). */
  readonly c1Backend: string
  /** The legacy shared backend; suspended, kept for the hosts that still name it. */
  readonly legacyBackend: string
  /** The backend that owns the certified Inspector -> projector -> Neptune refresh lane. */
  readonly neptuneRefreshBackend: string
}

export const HOSTED_DEFAULTS: HostedDefaults | null = {
  c1Backend: "https://cyntro-c1.onrender.com",
  legacyBackend: "https://cyntro-c1.onrender.com",
  neptuneRefreshBackend: "https://saferemediate-backend-f.onrender.com",
}
