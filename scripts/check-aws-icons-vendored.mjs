// Every icon slug the topology catalog names has a file under public/aws-icons/, or this fails by
// name. The customer-resident image serves the icons itself (nothing reaches thesvg.org from a
// closed VPC); scripts/vendor-aws-icons.sh is what fetches them, on the connected side, once.
import {readFile, readdir} from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const catalog = await readFile(path.join(root, "components/topology-v0-2/aws-architecture-icons.ts"), "utf8")
const slugs = [...new Set([...catalog.matchAll(/^\s*slug:\s*"([a-z0-9-]+)"/gm)].map((m) => m[1]))].sort()
if (slugs.length === 0) throw new Error("no icon slug found in the catalog; the pattern no longer matches")
let present = new Set()
try {
  present = new Set((await readdir(path.join(root, "public/aws-icons"))).filter((n) => n.endsWith(".svg")).map((n) => n.slice(0, -4)))
} catch {
  present = new Set()
}
const missing = slugs.filter((slug) => !present.has(slug))
if (missing.length) {
  console.error(`public/aws-icons/ is missing ${missing.length} of ${slugs.length} catalog icons (run scripts/vendor-aws-icons.sh on a connected workstation):`)
  for (const slug of missing) console.error(`  ${slug}.svg`)
  process.exit(1)
}
console.log(`public/aws-icons/: every one of the ${slugs.length} catalog icons is present`)
