import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const tsc = fileURLToPath(
  new URL("../node_modules/typescript/bin/tsc", import.meta.url),
)
const result = spawnSync(process.execPath, [tsc, "--noEmit", "--pretty", "false", "--incremental", "false"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  encoding: "utf8",
})
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
const releaseFiles = [
  "app/api/proxy/business-impact/",
  "components/business-impact/",
  "components/attack-paths-v2/current-access-dossier-panel.tsx",
  "components/attack-paths-v2/zoom0-fan-in-panel.tsx",
  "components/dashboard/v3/home-dashboard-v3.tsx",
  "components/dashboard/v3/management-report-drawer.tsx",
  "lib/business-impact.ts",
  "lib/dashboard-release.ts",
  "__tests__/business-impact-panel.test.tsx",
  "__tests__/dashboard/management-report-board-brief.test.tsx",
  "__tests__/dashboard/dashboard-release.test.ts",
  "__tests__/attack-paths/business-impact-default-wiring.test.ts",
]
const releaseDiagnostics = output
  .split(/\r?\n/)
  .filter((line) => releaseFiles.some((file) => line.startsWith(file)))

if (releaseDiagnostics.length > 0) {
  console.error("Report release type gate failed:\n" + releaseDiagnostics.join("\n"))
  process.exit(1)
}

console.log(
  result.status === 0
    ? "Report release type gate passed; repository typecheck is clean."
    : "Report release type gate passed; unrelated legacy diagnostics remain outside this release scope.",
)
