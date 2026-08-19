import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = process.cwd()
const EXFIL = join(
  ROOT,
  "components/attack-paths-v2/exfil-view-v3.tsx",
)

describe("exfil observation honesty", () => {
  it("does not turn observed reads into a destination claim", () => {
    const code = readFileSync(EXFIL, "utf8")

    expect(code).toContain("This proves access to the crown jewel")
    expect(code).toContain("no external destination is resolved")
    expect(code).toContain("suppressEmptyNetworkBanner")
    expect(code).not.toContain("the data is actively moving")
    expect(code).not.toContain('gateHint = "IAM is the only gate')
  })
})
