/**
 * S2 intake I2a: the browser reducer (lib/terraform-state-reducer.ts), contract S2-INTAKE-CONTRACT-2026-10-16 section 4.
 *
 * Every state is one Terraform 1.7.1 wrote (__tests__/fixtures/terraform-state, copied byte-identical from the backend with
 * PROVENANCE.txt); the expected reductions are the backend test's own (the reduction the backend I1 suite proves it
 * accepts). A negative control is ONE change to such a file's bytes. SENTINEL is a fake marker, never a real secret.
 */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  MAX_ENVELOPE_BYTES,
  REDUCTION,
  ReductionRefused,
  buildEnvelope,
  reduceTerraformState,
} from "@/lib/terraform-state-reducer"

const FIXTURES = path.join(__dirname, "fixtures", "terraform-state")
const SENTINEL = "REVIEW_FAKE_SECRET_I2A"
const enc = (text: string) => new TextEncoder().encode(text)
const file = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, name)))
const json = (name: string) => JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"))
const mutated = (name: string, change: (doc: any) => void) => {
  const doc = json(name)
  change(doc)
  return enc(JSON.stringify(doc))
}

async function refused(bytes: Uint8Array, code: string) {
  let caught: unknown
  try {
    await reduceTerraformState(bytes)
  } catch (e) {
    caught = e
  }
  expect(caught).toBeInstanceOf(ReductionRefused)
  expect((caught as ReductionRefused).code).toBe(code)
  expect((caught as Error).message).toBe(code)                   // value-free: the code, nothing from the file
  return caught as ReductionRefused
}

describe("the fixtures are the backend's, byte for byte", () => {
  it("matches PROVENANCE.txt", () => {
    const provenance = readFileSync(path.join(FIXTURES, "PROVENANCE.txt"), "utf8")
    for (const line of provenance.split("\n").filter((l) => l.startsWith("sha256 "))) {
      const [, digest, name] = line.split(" ")
      expect(createHash("sha256").update(file(name)).digest("hex")).toBe(digest)
    }
  })
})

describe("a real state reduces to exactly the backend's expected reduction", () => {
  it.each([
    ["aws_import.tfstate", "expected-reduced-aws_import.tfstate.json", "raw_state_v4"],
    ["aws_import.show.json", "expected-reduced-aws_import.show.json", "show_state_json"],
  ])("%s", async (name, expected, format) => {
    const reduction = await reduceTerraformState(file(name))
    expect(reduction.format).toBe(format)
    expect(JSON.parse(reduction.document)).toEqual(json(expected))
    expect(reduction.resourceCount).toBe(3)
    expect(reduction.byType).toEqual({ aws_s3_bucket: 1, aws_security_group: 1, aws_vpc: 1 })
    expect(reduction.omittedCount).toBe(0)
    expect(reduction.claimedSourceDigest).toBe("sha256:" + createHash("sha256").update(file(name)).digest("hex"))
    for (const detail of ["10.80.0.0/16", "DenyInsecureTransport", "cyntro-platform", "cloudtrail.amazonaws.com"]) {
      expect(readFileSync(path.join(FIXTURES, name), "utf8")).toContain(detail)   // Terraform DID record it
      expect(reduction.document).not.toContain(detail)                            // it never leaves the browser
    }
  })

  it("keeps every kept value byte-identical to the original token text", async () => {
    const original = readFileSync(path.join(FIXTURES, "aws_import.tfstate"), "utf8")
    const reduction = await reduceTerraformState(file("aws_import.tfstate"))
    for (const arn of JSON.parse(reduction.document).resources.map((r: any) => r.instances[0].attributes.arn)) {
      expect(original).toContain(JSON.stringify(arn))
      expect(reduction.document).toContain(JSON.stringify(arn))
    }
    const escaped = original.replace(":vpc/", ":vpc\\/")                 // ONE token written with a JSON escape (`\/`)
    expect(escaped).not.toBe(original)
    expect((await reduceTerraformState(enc(escaped))).document).toContain(":vpc\\/")   // sent exactly as written
  })
})

describe("states with nothing supported", () => {
  it.each(["basic.tfstate", "basic.show.json", "deposed.tfstate", "empty.show.json"])("%s is refused locally", async (name) => {
    await refused(file(name), "NO_SUPPORTED_RESOURCES")
  })
})

describe("strict validation runs on the WHOLE file BEFORE anything is dropped", () => {
  const original = () => readFileSync(path.join(FIXTURES, "aws_import.tfstate"), "utf8")
  it.each([
    ["duplicate top-level member", () => enc('{"version":3,' + original().trimStart().slice(1)), "DUPLICATE_KEY"],
    ["duplicate nested member", () => enc(original().replace('"schema_version": 1,', '"schema_version": 1, "schema_version": 0,')),
     "DUPLICATE_KEY"],
    ["NaN", () => enc(original().replace('"serial": 3', '"serial": NaN')), "NOT_JSON"],
    ["an overflowing number", () => enc(original().replace('"serial": 3', '"serial": 1e999')), "NONFINITE_NUMBER"],
    ["a BOM", () => new Uint8Array([0xef, 0xbb, 0xbf, ...file("aws_import.tfstate")]), "BOM"],
    ["invalid UTF-8", () => new Uint8Array([...enc(original()).slice(0, 20), 0xff, ...enc(original()).slice(20)]), "NOT_UTF8"],
    ["a lone surrogate escape", () => enc(original().replace('"name": "platform"', '"name": "\\ud800"')), "LONE_SURROGATE"],
    ["an unsafe serial", () => enc(original().replace('"serial": 3', '"serial": 9007199254740993')), "SERIAL_INVALID"],
    ["too deep", () => enc(original().replace('"outputs": {}', `"outputs": ${"[".repeat(70)}${"]".repeat(70)}`)),
     "DOCUMENT_TOO_DEEP"],
    ["state version 3", () => enc(original().replace('"version": 4', '"version": 3')), "UNSUPPORTED_STATE_VERSION"],
  ])("%s", async (_name, make, code) => {
    await refused(make(), code)
  })

  it("refuses a malformed sensitivity path on a resource the reduction would DROP", async () => {
    const bytes = mutated("basic.tfstate", (doc) => {
      doc.resources[1].instances[0].sensitive_attributes = [[{ type: "unknown", value: "input" }]]
    })
    await refused(bytes, "SENSITIVE_ATTRIBUTES_INVALID")
  })

  it("refuses a malformed show mask on a resource the reduction would DROP", async () => {
    const bytes = mutated("aws_import.show.json", (doc) => {
      doc.values.root_module.resources[0].sensitive_values = { id: false, tags: "true" }
    })
    await refused(bytes, "SENSITIVE_ATTRIBUTES_INVALID")
  })

  it.each([
    ["a show address inconsistent with its parts", (d: any) => { d.values.root_module.resources[0].address = "aws_vpc.other" },
     "ADDRESS_INCONSISTENT"],
    ["a show provider of one segment", (d: any) => { d.values.root_module.resources[0].provider_name = "aws" }, "PROVIDER_INVALID"],
    ["an unknown format major", (d: any) => { d.format_version = "2.0" }, "UNSUPPORTED_FORMAT_VERSION"],
  ])("%s", async (_name, change, code) => {
    await refused(mutated("aws_import.show.json", change), code)
  })

  it.each([
    ["a resource name with a dot", (d: any) => { d.resources[0].name = "evidence.extra" }, "RESOURCE_NAME_INVALID"],
    ["a non-AWS-identifier type", (d: any) => { d.resources[0].type = "1aws" }, "RESOURCE_TYPE_INVALID"],
    ["a template key", (d: any) => { d.resources[0].instances[0].index_key = "${x}" }, "INDEX_KEY_UNSUPPORTED"],
    ["a key over int64", (d: any) => { d.resources[0].instances[0].index_key = 9223372036854775808 }, "INDEX_KEY_INVALID"],
    ["a deposed key that is not 8 hex", (d: any) => { d.resources[0].instances[0].deposed = "zz" }, "DEPOSED_KEY_INVALID"],
    ["a lineage that is not a UUID", (d: any) => { d.lineage = "x" }, "LINEAGE_INVALID"],
    ["a legacy flatmap-only instance", (d: any) => { delete d.resources[0].instances[0].attributes; d.resources[0].instances[0].attributes_flat = {} },
     "LEGACY_FLATMAP_ATTRIBUTES"],
    ["a duplicate instance", (d: any) => { d.resources[0].instances.push({ ...d.resources[0].instances[0] }) }, "DUPLICATE_INSTANCE"],
  ])("%s", async (_name, change, code) => {
    await refused(mutated("aws_import.tfstate", change), code)
  })
})

describe("the reduction keeps marks fail-closed", () => {
  it("keeps a path on id and a whole-object path, and drops a path on a dropped attribute", async () => {
    const bytes = mutated("aws_import.tfstate", (doc) => {
      doc.resources[0].instances[0].sensitive_attributes = [[{ type: "get_attr", value: "id" }],
                                                           [{ type: "get_attr", value: "policy" }], []]
    })
    const kept = JSON.parse((await reduceTerraformState(bytes)).document).resources[0].instances[0].sensitive_attributes
    expect(kept).toEqual([[], [{ type: "get_attr", value: "id" }]])
  })

  it("keeps a root mask true and the id / arn marks of a show mask", async () => {
    const bytes = mutated("aws_import.show.json", (doc) => {
      doc.values.root_module.resources[0].sensitive_values = true
      doc.values.root_module.resources[1].sensitive_values = { arn: true, tags: {} }
    })
    const resources = JSON.parse((await reduceTerraformState(bytes)).document).values.root_module.resources
    expect(resources[0].sensitive_values).toBe(true)
    expect(resources[1].sensitive_values).toEqual({ arn: true })
    expect(resources[0].values).toEqual({})                                     // the marked values never travel
    expect(Object.keys(resources[1].values)).toEqual(["id"])
  })

  it("counts what it omits and keeps nothing of it", async () => {
    const bytes = mutated("aws_import.tfstate", (doc) => {
      doc.resources.push({ ...doc.resources[0], type: "aws_iam_role", name: "omitted" })
      doc.resources.push({ ...doc.resources[0], mode: "data", name: "read_only" })
    })
    const reduction = await reduceTerraformState(bytes)
    expect([reduction.resourceCount, reduction.omittedCount]).toEqual([3, 2])
    expect(reduction.document).not.toContain("omitted")
    expect(reduction.document).not.toContain("read_only")
  })
})

describe("SW111 (I2-R1): only an identifier STRING that is not marked leaves the browser", () => {
  /** The exact bytes that WOULD be uploaded (the reducer, then the envelope), and the reduced document parsed back. */
  async function outgoing(bytes: Uint8Array) {
    const reduction = await reduceTerraformState(bytes)
    const { body } = buildEnvelope({ requestId: "00000000-0000-4000-8000-000000000001", accountId: "178254216844",
                                     workspaceIdentity: "s3://platform-tfstate/platform.tfstate#default", reduction })
    return { reduction, body, doc: JSON.parse(reduction.document) }
  }
  const rawVpc = (doc: any) => doc.resources.find((r: any) => r.type === "aws_vpc").instances[0]
  const showVpc = (doc: any) => doc.values.root_module.resources.find((r: any) => r.type === "aws_vpc")

  it.each([
    ["an object id", "id", { password: SENTINEL }],
    ["an array arn", "arn", [SENTINEL]],
    ["a nested object arn", "arn", { inner: { token: SENTINEL } }],
    ["a number id", "id", 12345],
    ["a boolean id", "id", true],
  ])("raw: %s is withheld before upload", async (_name, attr, value) => {
    const { reduction, body, doc } = await outgoing(mutated("aws_import.tfstate", (d) => { rawVpc(d).attributes[attr] = value }))
    expect(body).not.toContain(SENTINEL)
    expect(body).not.toContain("password")
    expect(Object.keys(rawVpc(doc).attributes)).toEqual([attr === "id" ? "arn" : "id"])
    expect([reduction.resourceCount, reduction.withheldValueCount]).toEqual([3, 1])
  })

  it.each([
    ["an object id", "id", { password: SENTINEL }],
    ["an array arn", "arn", [SENTINEL]],
    ["a number id", "id", 12345],
  ])("show: %s is withheld before upload", async (_name, attr, value) => {
    const { reduction, body, doc } = await outgoing(mutated("aws_import.show.json", (d) => { showVpc(d).values[attr] = value }))
    expect(body).not.toContain(SENTINEL)
    expect(Object.keys(showVpc(doc).values)).toEqual([attr === "id" ? "arn" : "id"])
    expect(reduction.withheldValueCount).toBe(1)
  })

  it("raw: a value marked sensitive is withheld and its mark is sent", async () => {
    const { reduction, body, doc } = await outgoing(mutated("aws_import.tfstate", (d) => {
      rawVpc(d).attributes.id = `vpc-${SENTINEL}`
      rawVpc(d).sensitive_attributes = [[{ type: "get_attr", value: "id" }]]
    }))
    expect(body).not.toContain(SENTINEL)
    expect(Object.keys(rawVpc(doc).attributes)).toEqual(["arn"])
    expect(rawVpc(doc).sensitive_attributes).toEqual([[{ type: "get_attr", value: "id" }]])
    expect(reduction.withheldValueCount).toBe(1)
  })

  it("raw: a whole-object mark withholds both values and is sent", async () => {
    const { body, doc } = await outgoing(mutated("aws_import.tfstate", (d) => {
      Object.assign(rawVpc(d).attributes, { id: `vpc-${SENTINEL}`, arn: `arn:aws:ec2:eu-west-1:178254216844:vpc/${SENTINEL}` })
      rawVpc(d).sensitive_attributes = [[]]
    }))
    expect(body).not.toContain(SENTINEL)
    expect(rawVpc(doc).attributes).toEqual({})
    expect(rawVpc(doc).sensitive_attributes).toEqual([[]])
  })

  it.each([
    ["an index step's value", [{ type: "get_attr", value: "id" }, { type: "index", value: { password: SENTINEL } }]],
    ["a nested attribute name", [{ type: "get_attr", value: "arn" }, { type: "get_attr", value: SENTINEL }]],
  ])("raw: %s below a mark never travels; the mark is rebuilt", async (_name, path) => {
    const { body, doc } = await outgoing(mutated("aws_import.tfstate", (d) => { rawVpc(d).sensitive_attributes = [path] }))
    expect(body).not.toContain(SENTINEL)
    const name = (path[0] as { value: string }).value
    expect(rawVpc(doc).sensitive_attributes).toEqual([[{ type: "get_attr", value: name }]])
    expect(Object.keys(rawVpc(doc).attributes)).toEqual([name === "id" ? "arn" : "id"])   // marked below = marked
  })

  it("show: a value marked sensitive is withheld and its mark is sent", async () => {
    const { body, doc } = await outgoing(mutated("aws_import.show.json", (d) => {
      showVpc(d).values.id = `vpc-${SENTINEL}`
      showVpc(d).sensitive_values = { id: true, tags: {} }
    }))
    expect(body).not.toContain(SENTINEL)
    expect(Object.keys(showVpc(doc).values)).toEqual(["arn"])
    expect(showVpc(doc).sensitive_values).toEqual({ id: true })
  })

  it("show: a root mask true withholds both values and is sent", async () => {
    const { body, doc } = await outgoing(mutated("aws_import.show.json", (d) => {
      Object.assign(showVpc(d).values, { id: `vpc-${SENTINEL}`, arn: `arn:aws:ec2:eu-west-1:178254216844:vpc/${SENTINEL}` })
      showVpc(d).sensitive_values = true
    }))
    expect(body).not.toContain(SENTINEL)
    expect([showVpc(doc).values, showVpc(doc).sensitive_values]).toEqual([{}, true])
  })

  it("show: a nested mask's member names never travel; a true below marks the attribute", async () => {
    const { body, doc } = await outgoing(mutated("aws_import.show.json", (d) => {
      showVpc(d).sensitive_values = { id: { [SENTINEL]: true }, arn: { [`${SENTINEL}_2`]: false } }
    }))
    expect(body).not.toContain(SENTINEL)
    expect(showVpc(doc).sensitive_values).toEqual({ id: true })
    expect(Object.keys(showVpc(doc).values)).toEqual(["arn"])              // id is marked below; arn is not marked
  })

  it("the real states withhold nothing", async () => {
    for (const name of ["aws_import.tfstate", "aws_import.show.json"]) {
      expect((await reduceTerraformState(file(name))).withheldValueCount).toBe(0)
    }
  })
})

describe("SW112 (I2-R2): a wide mask inside the budgets is iterated, never spread into arguments", () => {
  const WIDE = 150000                                                   // the review's probe width (~0.9 MB of `false,`)
  const showVpc = (doc: any) => doc.values.root_module.resources.find((r: any) => r.type === "aws_vpc")
  const wideObject = (leaf: (k: number) => unknown) => Object.fromEntries(Array.from({ length: WIDE }, (_, k) => [`k${k}`, leaf(k)]))

  it.each([
    ["a wide array", () => Array(WIDE).fill(false)],
    ["a wide object", () => wideObject(() => false)],
  ])("%s on a dropped attribute is validated and reduced", async (_name, wide) => {
    const reduction = await reduceTerraformState(mutated("aws_import.show.json", (d) => { showVpc(d).sensitive_values = { tags: wide() } }))
    expect(reduction.resourceCount).toBe(3)
    expect(showVpc(JSON.parse(reduction.document)).sensitive_values).toEqual({})
    expect(reduction.withheldValueCount).toBe(0)
  })

  it.each([
    ["a wide array", () => [...Array(WIDE).fill(false), true]],
    ["a wide object", () => wideObject((k) => k === WIDE - 1)],
  ])("a true at the far end of %s below id still marks it: the id is withheld", async (_name, wide) => {
    const reduction = await reduceTerraformState(mutated("aws_import.show.json", (d) => {
      showVpc(d).values.id = `vpc-${SENTINEL}`
      showVpc(d).sensitive_values = { id: wide(), tags: Array(WIDE).fill(false) }
    }))
    expect(reduction.document).not.toContain(SENTINEL)
    expect(showVpc(JSON.parse(reduction.document)).sensitive_values).toEqual({ id: true })
    expect(Object.keys(showVpc(JSON.parse(reduction.document)).values)).toEqual(["arn"])
  })

  it.each([
    ["a wide array", () => [...Array(WIDE).fill(false), null]],
    ["a wide object", () => wideObject((k) => (k === WIDE - 1 ? "true" : false))],
  ])("a malformed leaf at the far end of %s is refused by its code, never a RangeError", async (_name, wide) => {
    await refused(mutated("aws_import.show.json", (d) => { showVpc(d).sensitive_values = { tags: wide() } }),
                  "SENSITIVE_ATTRIBUTES_INVALID")
  })
})

describe("the envelope is measured exactly, escaping included", () => {
  const args = async (label = "s3://platform-tfstate/platform.tfstate#default") => ({
    requestId: "00000000-0000-4000-8000-000000000001", accountId: "178254216844", workspaceIdentity: label,
    reduction: await reduceTerraformState(file("aws_import.tfstate")),
  })

  it("names the exact members and counts the escaped document", async () => {
    const a = await args()
    const { body, bytes } = buildEnvelope(a)
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(["account_id", "claimed_source_digest", "consent", "document", "format",
                                                          "reduction", "request_id", "workspace_identity"])
    expect(JSON.parse(body).reduction).toBe(REDUCTION)
    expect(bytes).toBe(new TextEncoder().encode(body).length)
    const quotes = a.reduction.document.split('"').length - 1
    expect(bytes).toBeGreaterThanOrEqual(a.reduction.document.length + quotes)     // every quote costs its escape
  })

  it("refuses locally one byte over the limit and passes exactly at it", async () => {
    const a = await args()
    const base = buildEnvelope(a).bytes
    const fill = (n: number) => ({ ...a, reduction: { ...a.reduction, document: a.reduction.document + " ".repeat(n) } })
    expect(buildEnvelope(fill(MAX_ENVELOPE_BYTES - base)).bytes).toBe(MAX_ENVELOPE_BYTES)
    expect(() => buildEnvelope(fill(MAX_ENVELOPE_BYTES - base + 1))).toThrow(ReductionRefused)
  })
})

describe("refusals carry no value", () => {
  it("a sentinel in a refused field never reaches the message", async () => {
    const error = await refused(mutated("aws_import.tfstate", (d) => { d.lineage = SENTINEL }), "LINEAGE_INVALID")
    expect(String(error) + JSON.stringify(error)).not.toContain(SENTINEL)
  })
})
