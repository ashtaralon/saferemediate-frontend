// Display-name contract gate (machine-checkable — see backend
// docs/DISPLAY_NAME_CONTRACT.md). The graph model owns naming: one resolver,
// one writer, serializers project, and the FE consumes the projected
// `display_name` at exactly ONE ingestion point per surface
// (build-attacker-architecture's node loop). This gate fails the build when
// a PR quietly reintroduces a per-surface naming heuristic — the class of
// drift the contract exists to delete (operator directive, 2026-07-03:
// "we don't fix something specific; the model works the same for any system").
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOTS = ["components", "lib", "hooks", "app"]
const REPO = process.cwd()

// The single sanctioned ingestion point (+ its type declaration).
const DISPLAY_NAME_ALLOWLIST = new Set([
  "components/attack-paths-v2/build-attacker-architecture.ts",
])

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\./.test(entry)) yield p
  }
}

function scan(re: RegExp, allow?: Set<string>, roots: string[] = ROOTS): string[] {
  const hits: string[] = []
  for (const root of roots) {
    let stat
    try { stat = statSync(join(REPO, root)) } catch { continue }
    if (!stat.isDirectory()) continue
    for (const file of walk(join(REPO, root))) {
      const rel = relative(REPO, file)
      if (allow?.has(rel)) continue
      const src = readFileSync(file, "utf8")
      const lines = src.split("\n")
      lines.forEach((line, i) => {
        if (re.test(line) && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*")) {
          hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`)
        }
      })
    }
  }
  return hits
}

describe("display-name contract gate", () => {
  it("never reads the raw AWS Name tag directly (key_properties.Name / tags.Name)", () => {
    const hits = scan(/(?:key_properties|tags)\s*(?:\.|\[\s*['"])Name\b/)
    expect(hits, [
      "Raw Name-tag reads are forbidden — the graph model resolves naming",
      "(display_name, with provenance). Consume the projected field instead.",
      "Contract: saferemediate-backend/docs/DISPLAY_NAME_CONTRACT.md",
      ...hits,
    ].join("\n")).toEqual([])
  })

  it("resolves graph-node display_name at the single sanctioned ingestion point only", () => {
    // Scoped to the graph-canvas surfaces — other features have their own
    // unrelated display_name DTO fields (copilot results, SG analysis) that
    // are not part of the graph naming contract.
    const hits = scan(/\bdisplay_name\b/, DISPLAY_NAME_ALLOWLIST, [
      "components/attack-paths-v2",
      "components/dependency-map",
      "components/identity-attack-paths",
      "components/attack-map",
    ])
    expect(hits, [
      "display_name must be consumed ONCE per surface (the canvas ingestion",
      "loop in build-attacker-architecture.ts), then flow as resolved `name`.",
      "A new read is a per-surface naming heuristic — the drift this gate blocks.",
      "Contract: saferemediate-backend/docs/DISPLAY_NAME_CONTRACT.md",
      ...hits,
    ].join("\n")).toEqual([])
  })
})
