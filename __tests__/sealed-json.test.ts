// @vitest-environment node
import { describe, expect, it } from "vitest"
import { base64UrlDecode, base64UrlEncode, sealJson, unsealJson } from "@/lib/server/sealed-json"

const SECRET = "a-sealing-secret-that-is-long-enough-000"

describe("sealed JSON", () => {
  it("round-trips only under the same secret and purpose", async () => {
    const token = await sealJson({ v: 1, kind: "site" }, SECRET, "cyntro_site_session")
    expect(token.startsWith("v1.")).toBe(true)
    expect(await unsealJson(token, SECRET, "cyntro_site_session")).toEqual({ v: 1, kind: "site" })
    expect(await unsealJson(token, SECRET, "cyntro_operator_session")).toBeNull()      // another cookie's purpose
    expect(await unsealJson(token, `${SECRET}x`, "cyntro_site_session")).toBeNull()      // another secret
  })

  it("refuses tampering, truncation and anything that is not a v1 seal", async () => {
    const token = await sealJson({ exp: 1 }, SECRET, "p")
    const raw = base64UrlDecode(token.slice(3))
    raw[raw.length - 1] ^= 0x01
    expect(await unsealJson(`v1.${base64UrlEncode(raw)}`, SECRET, "p")).toBeNull()
    expect(await unsealJson(token.slice(0, -4), SECRET, "p")).toBeNull()
    for (const value of [undefined, "", "authenticated", "v2.abc", "v1.", "v1.!!!"]) {
      expect(await unsealJson(value, SECRET, "p")).toBeNull()
    }
  })

  it("never repeats a ciphertext for the same value", async () => {
    const [a, b] = await Promise.all([sealJson({ same: true }, SECRET, "p"), sealJson({ same: true }, SECRET, "p")])
    expect(a).not.toEqual(b)
  })
})
