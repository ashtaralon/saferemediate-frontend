/**
 * S1b (SW-S1B-20261013-02, option A): this frontend pairs with save envelope levels 2 and 3 exactly, and sends a plural
 * create only at 3. The level-3 compatibility example is the backend's frozen fixture, byte for byte
 * (saferemediate-backend tests/fixtures/system_boundary_save/plural_create_example.json, pinned there by the same sha256).
 * The capability captures are the backend harness's real answers (tests/cyntro_data/test_system_boundary_wizard_captures.py).
 */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import declaration from "@/lib/release-contract.json"
import { parseCapabilityResponse, pluralCreateOffered } from "@/lib/system-boundary-capability"

const fixture = (...parts: string[]) => readFileSync(path.join(__dirname, "fixtures", ...parts))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const capture = (name: string): any => JSON.parse(fixture("system-boundary-captures", `${name}.json`).toString("utf8"))
const EXAMPLE_SHA256 = "aed031dd7af3f6b58c6ae59b92ab072016974f89626d9b4f19def68b16db5cd4"

describe("the level-3 compatibility example", () => {
  const raw = fixture("system-boundary-save", "plural_create_example.json")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const example: any = JSON.parse(raw.toString("utf8"))

  it("is the backend's frozen example, byte for byte, at the level this frontend accepts", () => {
    expect(createHash("sha256").update(raw).digest("hex")).toBe(EXAMPLE_SHA256)
    expect(example._provenance.level).toBe(declaration.accepts.system_boundary_save)
  })

  it("is a plural create: `deployments` XOR `deployment`, every entry new, every binding naming one of them", () => {
    const body = example.body
    expect(Object.keys(body).sort()).toEqual(["bindings", "deployments", "system"])
    expect(body.system.mode).toBe("new")
    const keys = body.deployments.map((d: { deployment_key: string }) => d.deployment_key)
    expect(keys).toEqual(["prod", "staging"])
    expect(body.deployments.every((d: { mode: string }) => d.mode === "new")).toBe(true)
    expect(body.bindings.every((b: { deployment_key: string }) => keys.includes(b.deployment_key))).toBe(true)
    expect(new Set(body.deployments.flatMap((d: { scopes: { account_id: string }[] }) => d.scopes.map((s) => s.account_id))).size).toBe(1)
  })
})

describe("the compatibility matrix at the capability reader", () => {
  const enabled = capture("capability_enabled")
  it("the real level-3 answer is enabled and offers the plural create", () => {
    expect(enabled.body.save_envelope_level).toBe(3)
    const parsed = parseCapabilityResponse(enabled.status, enabled.body)
    expect(parsed.kind).toBe("enabled")
    expect(pluralCreateOffered(parsed)).toBe(true)
  })
  it("a level-2 backend is enabled, single shape only; a disabled one offers nothing", () => {
    const two = parseCapabilityResponse(200, { ...enabled.body, save_envelope_level: 2 })
    expect(two.kind).toBe("enabled")
    expect(pluralCreateOffered(two)).toBe(false)
    const off = capture("capability")
    expect(pluralCreateOffered(parseCapabilityResponse(off.status, off.body))).toBe(false)
  })
  it("any other level -- older, newer, unknown, not an integer -- is not this build's", () => {
    for (const level of [1, 4, 99, 0, 2.5, "3", null]) {
      const parsed = parseCapabilityResponse(200, { ...enabled.body, save_envelope_level: level })
      expect(parsed.kind, String(level)).not.toBe("enabled")
      expect(pluralCreateOffered(parsed)).toBe(false)
    }
  })
})
