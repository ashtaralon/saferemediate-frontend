import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

// The frontend reads graph data only through the backend API. It connects to no graph database
// directly -- neither Neo4j nor Neptune.
//
// A path denylist cannot prove that: the two routes that DID query Neo4j directly were never on
// the old list, and passed it. So this guards the only ways a frontend could learn where a
// database is. A literal host in source, or an environment variable, must each be on an EXPLICIT
// allowlist; anything new fails until it is reviewed and added, and a database-shaped name or host
// fails even if someone adds it.

const SOURCE_ROOTS = ["app", "lib", "components", "hooks", "middleware.ts", "instrumentation.ts", "next.config.js"]
const SOURCE_EXT = /\.(ts|tsx|js|mjs)$/

const ALLOWED_ENV = new Set([
  "AWS_ACCOUNT_ID", "BACKEND_URL", "BACKEND_URL_OVERRIDE", "CYNTRO_ANALYST_ALLOWED_SYSTEMS",
  "CYNTRO_APPROVAL_PROXY_SECRET", "CYNTRO_DEPLOYMENT_MODE", "CYNTRO_SERVICE_TOKEN",
  "CYNTRO_SITE_SESSION_SECRET", "CYNTRO_SYNC_BACKEND_URL", "GITHUB_SHA", "NEXT_DIST_DIR",
  "NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_BACKEND_URL", "NEXT_PUBLIC_DASHBOARD_V2", "NEXT_PUBLIC_DASHBOARD_V3",
  "NEXT_PUBLIC_DEPENDENCY_MAP_V2", "NEXT_PUBLIC_DEPLOYMENT_VERSION", "NEXT_RUNTIME", "NODE_ENV",
  "SAFE_REMEDIATE_API_BASE", "SITE_PASSWORD", "SNAPSHOT_PROXY_TIMEOUT_MS", "SOURCE_VERSION",
  "TOPOLOGY_RISK_PROXY_TIMEOUT_MS", "VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA", "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
])
// process.env[<expression>] can read any name; each such site is pinned to the constant it uses.
const ALLOWED_DYNAMIC_ENV_READS: Record<string, string> = {
  "lib/server/copilot-scope.ts": "COPILOT_ALLOWED_SYSTEMS_ENV",
}
const ALLOWED_HOSTS = new Set([
  "127.0.0.1", "localhost", "cyntro.local", "api.saferemediate.com", "cyntro-c1.onrender.com",
  "saferemediate-backend-f.onrender.com", "console.aws.amazon.com", "s3.console.aws.amazon.com",
  "github.com", "thesvg.org", "www.w3.org",
])

const DATABASE_NAME = /NEO4J|NEPTUNE|GREMLIN|BOLT|AURA|GRAPH_?DB|CYPHER/i
const DATABASE_HOST = /neo4j|neptune|aura|graphdb|gremlin/i
const DATABASE_MARKERS: [RegExp, string][] = [
  [/\b(bolt|neo4j|neo4j\+s|neo4j\+ssc|bolt\+s):\/\//, "a graph-database connection scheme"],
  [/\/db\/[A-Za-z0-9_-]+\/tx\b/, "the Neo4j HTTP transaction endpoint"],
  [/[:/]7474\b|[:/]7687\b|[:/]8182\b/, "a graph-database port"],
  [/\/(openCypher|gremlin|sparql)\b/, "a Neptune query endpoint"],
  [/neptune-db:|\.neptune\.amazonaws\.com/, "a Neptune endpoint or IAM action"],
]
const DATABASE_PACKAGES = /^(neo4j-driver.*|gremlin.*|@aws-sdk\/client-neptune.*|neptune.*|@neo4j\/.*)$/

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (p: string) => {
    const s = statSync(p)
    if (s.isDirectory()) {
      if (/(^|\/)(node_modules|__tests__|\.next)$/.test(p)) return
      for (const e of readdirSync(p)) walk(join(p, e))
    } else if (SOURCE_EXT.test(p)) {
      out.push(p)
    }
  }
  for (const r of SOURCE_ROOTS) if (existsSync(join(root, r))) walk(join(root, r))
  return out
}

const files = sourceFiles()
const rel = (p: string) => relative(root, p)

describe("frontend connects to no graph database directly", () => {
  it("scans a real source tree (positive control for every zero below)", () => {
    expect(files.length).toBeGreaterThan(500)
    expect(files.some((f) => rel(f) === "app/api/proxy/identities/data-access/[name]/route.ts")).toBe(true)
  })

  it("reads only allowlisted environment variables, none database-shaped", () => {
    const seen = new Map<string, string>()
    for (const f of files) {
      const text = readFileSync(f, "utf8")
      // process.env.X, and env.X on an injected Env object (lib/server/site-session.ts and friends).
      for (const m of text.matchAll(/(?<![\w.])(?:process\.)?env\.([A-Z][A-Z0-9_]+)/g)) seen.set(m[1], rel(f))
    }
    expect(seen.size).toBeGreaterThan(10)
    for (const [name, where] of seen) {
      expect(DATABASE_NAME.test(name), `${name} read in ${where}`).toBe(false)
      expect(ALLOWED_ENV.has(name), `${name} read in ${where} is not on the reviewed allowlist`).toBe(true)
    }
  })

  it("reads process.env dynamically only where the name is pinned", () => {
    for (const f of files) {
      const text = readFileSync(f, "utf8")
      for (const m of text.matchAll(/process\.env\[\s*([^\]]+?)\s*\]/g)) {
        expect(ALLOWED_DYNAMIC_ENV_READS[rel(f)], `dynamic env read in ${rel(f)}`).toBe(m[1])
      }
    }
  })

  it("names only allowlisted hosts, none a database", () => {
    const hosts = new Map<string, string>()
    for (const f of [...files, ...sourceFilesUnder("public", /\.(html|js|json|svg)$/)]) {
      for (const m of readFileSync(f, "utf8").matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) {
        hosts.set(m[1].toLowerCase(), rel(f))
      }
    }
    expect(hosts.size).toBeGreaterThan(3)
    for (const [host, where] of hosts) {
      expect(DATABASE_HOST.test(host), `${host} in ${where}`).toBe(false)
      expect(ALLOWED_HOSTS.has(host), `${host} in ${where} is not on the reviewed allowlist`).toBe(true)
    }
  })

  it("contains no graph-database scheme, endpoint or port", () => {
    for (const f of files) {
      const text = readFileSync(f, "utf8")
      for (const [pattern, what] of DATABASE_MARKERS) {
        expect(pattern.test(text), `${what} in ${rel(f)}`).toBe(false)
      }
    }
  })

  it("depends on no graph-database driver or SDK", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies })
    expect(deps.length).toBeGreaterThan(10)
    expect(deps.filter((d) => DATABASE_PACKAGES.test(d))).toEqual([])
  })

  it("does not expose the retired direct Neo4j routes or view", () => {
    for (const path of [
      "app/api/neo4j/query/route.ts",
      "app/api/neo4j/graph/route.ts",
      "app/api/proxy/neo4j/query/route.ts",
      "components/dependency-map/neo4j-data-view.tsx",
      "app/api/proxy/decision-coverage/resource/[neo4jLabel]/[resourceId]/route.ts",
    ]) {
      expect(existsSync(join(root, path)), path).toBe(false)
    }
  })

  it("loads the dependency data view through the Neptune path", () => {
    const source = readFileSync(join(root, "components/dependency-map-tab.tsx"), "utf8")
    expect(source).toContain("./dependency-map/neptune-data-view")
    expect(source).not.toContain("./dependency-map/neo4j-data-view")
  })
})

function sourceFilesUnder(dir: string, ext: RegExp): string[] {
  const out: string[] = []
  const walk = (p: string) => {
    if (!existsSync(p)) return
    const s = statSync(p)
    if (s.isDirectory()) for (const e of readdirSync(p)) walk(join(p, e))
    else if (ext.test(p)) out.push(p)
  }
  walk(join(root, dir))
  return out
}
