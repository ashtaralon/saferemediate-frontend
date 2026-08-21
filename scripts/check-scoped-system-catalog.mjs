import fs from "node:fs"
import path from "node:path"

const roots = ["app", "components", "lib"]
const extensions = new Set([".ts", ".tsx", ".js", ".jsx"])
const excluded = new Set([
  path.normalize("lib/scoped-system-catalog.ts"),
])

const checks = [
  {
    name: "direct unscoped systems-catalog fetch",
    pattern: /fetch\s*\(\s*(["'`])\/api\/proxy\/systems\1/g,
  },
  {
    name: "direct unscoped cached systems-catalog read",
    pattern: /useCachedFetch[\s\S]{0,180}?\(\s*(["'`])\/api\/proxy\/systems(?:\/with-families)?\1/g,
  },
  {
    name: "global systems cache key",
    pattern: /["'`]systems:all["'`]/g,
  },
  {
    name: "globally remembered system",
    pattern: /localStorage\.(?:getItem|setItem)\(\s*["'`]cyntro:lastSystem["'`]/g,
  },
]

function filesUnder(root) {
  if (!fs.existsSync(root)) return []
  const out = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(full))
    else if (extensions.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

const violations = []
for (const file of roots.flatMap(filesUnder)) {
  if (excluded.has(path.normalize(file))) continue
  const source = fs.readFileSync(file, "utf8")
  for (const check of checks) {
    check.pattern.lastIndex = 0
    for (const match of source.matchAll(check.pattern)) {
      const line = source.slice(0, match.index).split("\n").length
      violations.push(`${file}:${line}: ${check.name}`)
    }
  }
}

if (violations.length) {
  console.error("System catalog scope guard failed:\n" + violations.join("\n"))
  process.exit(1)
}

console.log("System catalog scope guard passed")
