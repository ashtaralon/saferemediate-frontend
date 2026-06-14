// friendly-names — the shared resolver that keeps the map spine and the lateral
// header from leaking opaque AWS IAM ids (AROA…/AIDA…/AKIA…/ASIA…). One resolver,
// used by both surfaces, so they never drift (the map-fixed-but-lateral-leaked
// regression). BE-8.

import { describe, it, expect } from "vitest"
import {
  isOpaqueIamId,
  friendlyResourceName,
} from "@/components/attack-paths-v2/friendly-names"

describe("isOpaqueIamId", () => {
  it("flags opaque IAM unique ids", () => {
    expect(isOpaqueIamId("AROA23JBKAVDQCMGEX66T")).toBe(true)
    expect(isOpaqueIamId("AIDAABCDEFGH1234567")).toBe(true)
    expect(isOpaqueIamId("AKIAABCDEFGH1234567")).toBe(true)
    expect(isOpaqueIamId("ASIAABCDEFGH1234567")).toBe(true)
    expect(isOpaqueIamId("  AROA23JBKAVDQCMGEX66T  ")).toBe(true) // trimmed
  })

  it("does not flag human names or empties", () => {
    expect(isOpaqueIamId("alon-demo-ec2-role")).toBe(false)
    expect(isOpaqueIamId("AROA")).toBe(false) // too short, no body
    expect(isOpaqueIamId("")).toBe(false)
    expect(isOpaqueIamId(null)).toBe(false)
    expect(isOpaqueIamId(undefined)).toBe(false)
  })
})

describe("friendlyResourceName", () => {
  it("extracts the last segment of an ARN", () => {
    expect(
      friendlyResourceName("arn:aws:iam::745783559495:role/alon-demo-ec2-role"),
    ).toBe("alon-demo-ec2-role")
  })

  it("takes the second half of a ':::' snapshot id", () => {
    expect(friendlyResourceName("system:::cyntro-web-server")).toBe("cyntro-web-server")
  })

  it("maps opaque IAM ids to a readable type", () => {
    expect(friendlyResourceName("AROA23JBKAVDQCMGEX66T", "IAMUser")).toBe("IAM user")
    expect(friendlyResourceName("AKIAABCDEFGH1234567", "AccessKey")).toBe("access key")
    expect(friendlyResourceName("ASIAABCDEFGH1234567", "STSSession")).toBe(
      "assumed-role session",
    )
    // Unknown type → generic assumed role, never the AROA itself.
    const out = friendlyResourceName("AROA23JBKAVDQCMGEX66T")
    expect(out).toBe("assumed role")
    expect(out).not.toContain("AROA")
  })

  it("returns plain names unchanged", () => {
    expect(friendlyResourceName("cyntro-demo-pivot-role")).toBe("cyntro-demo-pivot-role")
  })

  it("falls back to the type (or 'resource') for empty input", () => {
    expect(friendlyResourceName("", "IAMRole")).toBe("IAMRole")
    expect(friendlyResourceName(null)).toBe("resource")
    expect(friendlyResourceName(undefined)).toBe("resource")
  })
})
