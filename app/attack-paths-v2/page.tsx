// Attack Paths v2 — redesigned per the 3-column information architecture
// from the 2026-05-21 design discussion:
//
//   ┌─ CROWN JEWELS ──┬─ PATHS GROUPED BY SOURCE ─┬─ PATH ANALYSIS ──┐
//   │  (left)         │  (center, source-type     │  (right, the     │
//   │                 │   collapsible groups)     │   embedded map + │
//   │                 │                           │   plane analysis +│
//   │                 │                           │   damage + fix)   │
//   └─────────────────┴───────────────────────────┴───────────────────┘
//
// Three URLs are deep-linkable:
//   /attack-paths-v2                                  → overview (jewel list)
//   /attack-paths-v2?jewel={id}                       → jewel selected
//   /attack-paths-v2?jewel={id}&path={path_id}        → path selected
//
// Coexists with the legacy /attack-paths route — operators can toggle
// between v1 and v2 via the sidebar nav until v2 is approved as
// canonical.

import { Suspense } from "react"
import { LightRouteIsland } from "@/components/attack-paths-v2/light-route-island"
import { AttackPathsV2Client } from "./attack-paths-v2-client"

export default function AttackPathsV2Page() {
  return (
    <Suspense fallback={null}>
      <LightRouteIsland>
        <AttackPathsV2Client />
      </LightRouteIsland>
    </Suspense>
  )
}
