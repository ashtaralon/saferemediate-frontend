import { BlastRadiusMap } from "@/components/attack-paths-v2/blast-radius-map"

/**
 * Standalone route for the composed Business System · Blast Radius Map, so the
 * full view is reachable (and preview-verifiable) without re-wiring the 3-column
 * attacker shell. Final integration as a view-mode/tab lands after visual review.
 *   /blast-radius-map/alon-prod
 */
export default async function BlastRadiusMapPage({
  params,
}: {
  params: Promise<{ system: string }>
}) {
  const { system } = await params
  return (
    <main className="min-h-screen bg-background text-foreground">
      <BlastRadiusMap systemName={decodeURIComponent(system)} />
    </main>
  )
}
