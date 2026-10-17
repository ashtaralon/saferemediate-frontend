/**
 * lib/content-hash.ts: the backend's canonical content hash, computed synchronously. The SHA-256 is checked against Node's own
 * (every padding boundary, multi-block, non-ASCII), and the canonical JSON against the hash the BACKEND produced for a document
 * it served (a real level-3 setup capture, pinned to its backend commit).
 */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { canonicalJson, contentHash, sha256Bytes } from "@/lib/content-hash"

const node = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

describe("the canonical content hash, computed synchronously", () => {
  it("is SHA-256: equal to Node's at every padding boundary, across blocks and for non-ASCII text", () => {
    for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 1000, 70_000]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 0xff)
      expect(sha256Bytes(bytes), `length ${n}`).toBe(node(bytes))
    }
    expect(sha256Bytes(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    const text = new TextEncoder().encode("eu-west-1 · ünïcödé · 東京 · 🛡")
    expect(sha256Bytes(text)).toBe(node(text))
  })

  it("is Python's sort_keys / compact / ensure_ascii=False JSON, and only for what that JSON states exactly", () => {
    expect(canonicalJson({ b: [1, null, true], a: { d: "x", c: "é" } })).toBe('{"a":{"c":"é","d":"x"},"b":[1,null,true]}')
    expect(canonicalJson("line\nbreak \"quoted\" \\ tab\t")).toBe(JSON.stringify("line\nbreak \"quoted\" \\ tab\t"))
    for (const bad of [1.5, Number.NaN, Number.POSITIVE_INFINITY, undefined, () => 1, new Date(0)]) {
      expect(() => canonicalJson(bad), String(bad)).toThrow(TypeError)
    }
  })

  it("names the document the BACKEND served exactly as the backend hashed it", () => {
    const file = path.join(__dirname, "fixtures", "system-boundary-setup-captures-v3", "read_draft.json")
    const served = JSON.parse(readFileSync(file, "utf8")).body.requirement_profile
    expect(contentHash(served.document)).toBe(served.hash)
    const changed = structuredClone(served.document)
    changed.subjects[0].evidence.source = "vpc_flow"
    expect(contentHash(changed)).not.toBe(served.hash)
  })
})
