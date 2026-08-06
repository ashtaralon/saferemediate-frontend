import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = process.cwd()

describe("default Attack Paths V2 business-impact wiring", () => {
  it("renders BIQ in the mounted Current Access dossier instead of only the legacy panel", () => {
    const fanInSource = readFileSync(
      join(ROOT, "components/attack-paths-v2/zoom0-fan-in-panel.tsx"),
      "utf8",
    )
    const dossierSource = readFileSync(
      join(ROOT, "components/attack-paths-v2/current-access-dossier-panel.tsx"),
      "utf8",
    )

    expect(fanInSource).toContain("businessImpact={")
    expect(fanInSource).toContain("<BusinessImpactPanel")
    expect(fanInSource).toContain("pathId={pinPathId}")
    expect(dossierSource).toContain('data-testid="current-access-business-impact"')
  })
})
