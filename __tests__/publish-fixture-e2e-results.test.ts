import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const SCRIPT = join(process.cwd(), "scripts/publish-fixture-e2e-results.sh")
const dirs: string[] = []

function git(cwd: string, args: string[], allowFailure = false): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" })
  } catch (error) {
    if (allowFailure) return ""
    throw error
  }
}

function seedResultsBranch(root: string, runDir: string): string {
  const bare = join(root, "remote.git")
  const seed = join(root, "seed")
  git(root, ["init", "--bare", "-q", bare])
  mkdirSync(seed)
  git(seed, ["init", "-q"])
  git(seed, ["config", "user.email", "fixture-e2e@users.noreply.github.com"])
  git(seed, ["config", "user.name", "fixture-e2e"])
  git(seed, ["config", "commit.gpgsign", "false"])
  git(seed, ["checkout", "-q", "--orphan", "fixture-e2e-results"])
  mkdirSync(join(seed, runDir), { recursive: true })
  writeFileSync(join(seed, runDir, "existing.png"), "already-published")
  writeFileSync(join(seed, "vercel.json"), '{ "ignoreCommand": "exit 0" }\n')
  git(seed, ["add", "-A"])
  git(seed, ["commit", "-q", "-m", "prior run"])
  git(seed, ["push", "-q", bare, "HEAD:refs/heads/fixture-e2e-results"])
  return bare
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("fixture screenshot publish", () => {
  it("refuses checkout when the run directory is copied in before the results branch", () => {
    const root = mkdtempSync(join(tmpdir(), "fixture-publish-broken-"))
    dirs.push(root)
    const bare = seedResultsBranch(root, "runs/35943944649")
    const broken = join(root, "broken")
    mkdirSync(join(broken, "runs/35943944649"), { recursive: true })
    writeFileSync(join(broken, "runs/35943944649/existing.png"), "fresh-screenshot")
    git(broken, ["init", "-q"])
    git(broken, ["fetch", "-q", bare, "fixture-e2e-results"])
    expect(() => git(broken, ["checkout", "-q", "-b", "fixture-e2e-results", "FETCH_HEAD"])).toThrow(
      /untracked working tree files would be overwritten by checkout/,
    )
    expect(readFileSync(join(broken, "runs/35943944649/existing.png"), "utf8")).toBe("fresh-screenshot")
  })

  it("publishes a rerun onto a results branch that already has that run directory", () => {
    const root = mkdtempSync(join(tmpdir(), "fixture-publish-"))
    dirs.push(root)
    const bare = seedResultsBranch(root, "runs/35943944649")
    const workspace = join(root, "workspace")
    mkdirSync(join(workspace, "test-results/glance"), { recursive: true })
    writeFileSync(join(workspace, "test-results/glance/estate.png"), "fresh-screenshot")
    execFileSync("bash", [SCRIPT], {
      cwd: workspace,
      env: {
        ...process.env,
        RESULTS_REMOTE: bare,
        RESULTS_BRANCH: "fixture-e2e-results",
        RUN_DIR: "runs/35943944649",
        PUBLISH_ROOT: join(workspace, "publish"),
        SCREENSHOT_STAGE: join(workspace, "stage"),
        GITHUB_RUN_ID: "35943944649",
        GITHUB_SHA: "9269544db26e3309a6d41419fee2119ab1c7f4a6",
        GITHUB_REF_NAME: "cf01/lp-rc-20260924T0332Z",
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "ashtaralon/saferemediate-frontend",
      },
    })
    const published = join(root, "published")
    git(root, ["clone", "-q", "--branch", "fixture-e2e-results", bare, published])
    expect(readFileSync(join(published, "runs/35943944649/glance/estate.png"), "utf8")).toBe("fresh-screenshot")
    expect(readFileSync(join(published, "runs/35943944649/existing.png"), "utf8")).toBe("already-published")
    expect(readFileSync(join(published, "vercel.json"), "utf8")).toContain('"ignoreCommand": "exit 0"')
  })
})
