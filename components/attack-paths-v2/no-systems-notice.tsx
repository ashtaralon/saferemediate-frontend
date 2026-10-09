"use client"

/**
 * What Attack Paths says when its systems catalogue lists none (D10). It used to say "Run an AWS sync from the dashboard to
 * populate this list" everywhere -- on a customer-resident install there is no sync (/api/proxy/sync/capabilities answers
 * 503), so the one action it named did not exist.
 *
 * Now the copy follows what this deployment can do, read from the same capability map the refresh controls read
 * (hooks/use-sync-capabilities.ts, lib/sync-surfaces.ts): a refresh is mentioned only when the inventory lane is CONNECTED;
 * unknown or unavailable means it is not mentioned. Adding a system is always named, because the System Boundary wizard
 * (Systems > Add System) is how a system comes to exist. A catalogue that could not be read says that, never "none".
 */
import { useSyncCapabilities } from "@/hooks/use-sync-capabilities"
import { SYNC_SURFACES, surfaceCapability } from "@/lib/sync-surfaces"

export const SYSTEMS_HREF = "/?section=systems"

export function NoSystemsNotice({ catalogFailure }: { catalogFailure: string | null }) {
  const { capabilities } = useSyncCapabilities()
  if (catalogFailure) {
    return (
      <div className="text-xs text-muted-foreground" data-testid="attack-paths-no-systems">
        The systems list could not be read ({catalogFailure}), so no system can be opened here.{" "}
        <a href={SYSTEMS_HREF} className="underline hover:text-foreground">Open Systems</a>
      </div>
    )
  }
  const canRefreshInventory = surfaceCapability(SYNC_SURFACES.inventory, capabilities) === "CONNECTED"
  return (
    <div className="text-xs text-muted-foreground" data-testid="attack-paths-no-systems">
      {canRefreshInventory
        ? "No systems in this scope yet. Open Systems to refresh inventory, or choose Add System there to declare one from an account's inventory."
        : "No systems in this scope yet. A system is declared from an account's inventory: open Systems and choose Add System."}{" "}
      <a href={SYSTEMS_HREF} className="underline hover:text-foreground">Open Systems</a>
    </div>
  )
}
