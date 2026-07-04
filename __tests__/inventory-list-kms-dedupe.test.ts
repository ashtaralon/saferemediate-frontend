import { describe, expect, it } from "vitest"
import { dedupeKmsListRows } from "@/lib/inventory-list"

// Shapes mirror the real graph condition (BE-19 label twins): one canonical
// ARN-keyed node written by a stub writer (thin — name is just the key-id
// echoed back, no key_state) plus a legacy bare-key-id node holding the
// collector's rich fields.
const KEY_ID = "c3e064e4-af2d-447c-8287-0a893807df30"
const KEY_ARN = `arn:aws:kms:eu-west-1:745783559495:key/${KEY_ID}`

const thinArnKeyed = {
  id: KEY_ARN,
  arn: KEY_ARN,
  key_id: KEY_ID,
  name: KEY_ID,
  key_state: null,
  key_manager: null,
  region: "eu-west-1",
}

const richUuidKeyed = {
  id: KEY_ID,
  arn: KEY_ID,
  key_id: KEY_ID,
  name: "cyntro-demo-cmk",
  key_state: "Enabled",
  key_manager: "CUSTOMER",
  region: "eu-west-1",
}

describe("dedupeKmsListRows", () => {
  it("collapses a twin pair into one row: ARN id + best fields across twins", () => {
    const out = dedupeKmsListRows([thinArnKeyed, richUuidKeyed])
    expect(out).toHaveLength(1)
    const row = out[0]
    // Identity from the canonical ARN-keyed twin — what the inspector resolves.
    expect(row.id).toBe(KEY_ARN)
    // Display fields from whichever twin actually has them.
    expect(row.name).toBe("cyntro-demo-cmk")
    expect(row.key_state).toBe("Enabled")
    expect(row.key_manager).toBe("CUSTOMER")
  })

  it("keeps untwinned rows intact and separate", () => {
    const other = {
      id: "arn:aws:kms:eu-west-1:745783559495:key/ff8c42fd-c0c4-40e9-9ceb-06951e58be21",
      arn: "arn:aws:kms:eu-west-1:745783559495:key/ff8c42fd-c0c4-40e9-9ceb-06951e58be21",
      key_id: "ff8c42fd-c0c4-40e9-9ceb-06951e58be21",
      name: "aws/lambda",
      key_state: "Enabled",
      key_manager: "AWS",
      region: "eu-west-1",
    }
    const out = dedupeKmsListRows([thinArnKeyed, richUuidKeyed, other])
    expect(out).toHaveLength(2)
    expect(out.map((r) => r.name).sort()).toEqual(["aws/lambda", "cyntro-demo-cmk"])
  })

  it("uses the twin's real ARN when only the legacy row exists", () => {
    // Legacy-only key: uuid-keyed node whose arn property carries the real ARN.
    const legacyOnly = {
      id: "9307a972-4694-4970-b401-904df2a73be3",
      arn: "arn:aws:kms:eu-west-1:745783559495:key/9307a972-4694-4970-b401-904df2a73be3",
      key_id: "9307a972-4694-4970-b401-904df2a73be3",
      name: "aws/acm",
      key_state: "Enabled",
      key_manager: "AWS",
      region: "eu-west-1",
    }
    const out = dedupeKmsListRows([legacyOnly])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe(legacyOnly.arn)
    expect(out[0].name).toBe("aws/acm")
  })

  it("drops rows with no identity handle at all", () => {
    expect(dedupeKmsListRows([{ name: "ghost" } as any])).toHaveLength(0)
  })
})
