/**
 * S2 intake (Option B, Alon's choice): the BROWSER half of a Terraform state upload -- strict validation, then reduction, of the
 * file a person chose. Contract: agent-coordinator S2-INTAKE-CONTRACT-2026-10-16 (sections 3-4); the server half is
 * saferemediate-backend unified/system_boundary_terraform_intake.py, which RE-CHECKS everything here (a direct client can
 * skip this code). No React, no network: the file never leaves this module.
 *
 * Order (contract section 4):
 *  1. the bytes are refused before parsing when over MAX_FILE_BYTES, carrying a BOM, or not UTF-8;
 *  2. a STRICT, LOSSLESS tokenizer -- never JSON.parse, which collapses duplicate members and normalizes numbers -- refuses
 *     duplicate members, non-finite numbers, lone surrogates and the server's structural budgets;
 *  3. the WHOLE document is validated with the server's grammar (format, header, address, provider, keys, the sensitivity
 *     structure of EVERY instance) BEFORE anything is dropped: a malformed original is refused, never laundered into an
 *     acceptable reduced one. Where this side is stricter than the server (ASCII identifiers), it refuses more, never less;
 *  4. only then the reduction: the managed AWS VPC / security-group / S3 bucket instances, their id / arn and the marks on
 *     those two, and the state header -- every kept value copied from the ORIGINAL token text. Sensitivity is fail-closed:
 *     a whole-object path (``[]``) or a root mask ``true`` stays, a mark on a kept attribute stays.
 *     (SW111) An id / arn is sent only when it is a STRING that is NOT marked: a marked one is withheld while its mark is
 *     sent, and an object / array / number / boolean is never sent. The marks are REBUILT (``[]``, ``[{get_attr, id|arn}]``,
 *     ``{id: true}``), never copied, so no nested step, index value or mask member name travels.
 * Names, keys, ids and ARNs are kept exactly as written and may hold anything the workspace put there: nothing here makes an
 * upload secret-free. Every refusal is a fixed code -- never a value, a member name or a path from the file.
 */

export const MAX_FILE_BYTES = 32 * 1024 * 1024
/** The backend's MAX_BODY_BYTES: the WHOLE UTF-8 request envelope, the document's string escaping included. */
export const MAX_ENVELOPE_BYTES = 1024 * 1024
export const MAX_DEPTH = 64
export const MAX_CONTAINERS = 2000000
export const MAX_INSTANCES = 50000
export const REDUCTION = "client_supported_types/v1"
export const CONSENT_VERSION = "terraform_reduced_upload_consent/v1"
export const SUPPORTED_TYPES: readonly string[] = ["aws_vpc", "aws_security_group", "aws_s3_bucket"]
export const AWS_PROVIDER_SOURCES: readonly string[] = ["registry.terraform.io/hashicorp/aws", "hashicorp/aws"]
export type StateFormat = "raw_state_v4" | "show_state_json"

/** A refusal by fixed code; ``message`` is the code itself -- nothing from the file. */
export class ReductionRefused extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
    this.name = "ReductionRefused"
  }
}
function refuse(code: string): never {
  throw new ReductionRefused(code)
}

// ── a strict, lossless JSON parse ───────────────────────────────────────────────────────────────────────────────

type JString = { t: "s"; value: string; raw: string }
type JNumber = { t: "n"; raw: string }
type JLiteral = { t: "l"; raw: "true" | "false" | "null" }
type JArray = { t: "a"; items: JNode[] }
type JObject = { t: "o"; members: { key: string; value: JNode }[] }
type JNode = JString | JNumber | JLiteral | JArray | JObject

class Parser {
  private i = 0
  private containers = 0
  constructor(private readonly text: string) {}

  parse(): JNode {
    const value = this.value(1)
    this.ws()
    if (this.i !== this.text.length) refuse("NOT_JSON")
    return value
  }

  private ws(): void {
    while (this.i < this.text.length) {
      const c = this.text.charCodeAt(this.i)
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) this.i++
      else break
    }
  }

  private value(depth: number): JNode {
    this.ws()
    const c = this.text[this.i]
    if (c === "{" || c === "[") {
      if (depth > MAX_DEPTH) refuse("DOCUMENT_TOO_DEEP")
      if (++this.containers > MAX_CONTAINERS) refuse("DOCUMENT_TOO_COMPLEX")
      return c === "{" ? this.object(depth) : this.array(depth)
    }
    if (c === '"') return this.string()
    if (c === "t" || c === "f" || c === "n") return this.literal()
    return this.number()
  }

  private object(depth: number): JObject {
    this.i++
    const members: { key: string; value: JNode }[] = []
    const seen = new Set<string>()
    this.ws()
    if (this.text[this.i] === "}") {
      this.i++
      return { t: "o", members }
    }
    for (;;) {
      this.ws()
      if (this.text[this.i] !== '"') refuse("NOT_JSON")
      const key = this.string().value
      if (seen.has(key)) refuse("DUPLICATE_KEY")
      seen.add(key)
      this.ws()
      if (this.text[this.i] !== ":") refuse("NOT_JSON")
      this.i++
      members.push({ key, value: this.value(depth + 1) })
      this.ws()
      const c = this.text[this.i++]
      if (c === "}") return { t: "o", members }
      if (c !== ",") refuse("NOT_JSON")
    }
  }

  private array(depth: number): JArray {
    this.i++
    const items: JNode[] = []
    this.ws()
    if (this.text[this.i] === "]") {
      this.i++
      return { t: "a", items }
    }
    for (;;) {
      items.push(this.value(depth + 1))
      this.ws()
      const c = this.text[this.i++]
      if (c === "]") return { t: "a", items }
      if (c !== ",") refuse("NOT_JSON")
    }
  }

  private string(): JString {
    const start = this.i
    this.i++
    let out = ""
    for (;;) {
      if (this.i >= this.text.length) refuse("NOT_JSON")
      const c = this.text.charCodeAt(this.i)
      if (c === 0x22) {
        this.i++
        break
      }
      if (c < 0x20) refuse("NOT_JSON")
      if (c === 0x5c) {
        const e = this.text[this.i + 1]
        const simple: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" }
        if (e in simple) {
          out += simple[e]
          this.i += 2
          continue
        }
        if (e !== "u") refuse("NOT_JSON")
        const hex = this.text.slice(this.i + 2, this.i + 6)
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) refuse("NOT_JSON")
        out += String.fromCharCode(parseInt(hex, 16))
        this.i += 6
        continue
      }
      out += this.text[this.i]
      this.i++
    }
    for (let k = 0; k < out.length; k++) {           // a lone surrogate, raw or escaped, is not text
      const u = out.charCodeAt(k)
      if (u >= 0xd800 && u <= 0xdbff) {
        const next = out.charCodeAt(k + 1)
        if (!(next >= 0xdc00 && next <= 0xdfff)) refuse("LONE_SURROGATE")
        k++
      } else if (u >= 0xdc00 && u <= 0xdfff) refuse("LONE_SURROGATE")
    }
    return { t: "s", value: out, raw: this.text.slice(start, this.i) }
  }

  private literal(): JLiteral {
    for (const raw of ["true", "false", "null"] as const) {
      if (this.text.startsWith(raw, this.i)) {
        this.i += raw.length
        return { t: "l", raw }
      }
    }
    return refuse("NOT_JSON")                         // NaN / Infinity are not JSON: refused here, by name
  }

  private number(): JNumber {
    const match = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(this.text.slice(this.i, this.i + 400))
    if (!match || match[0] === "" || match[0] === "-") refuse("NOT_JSON")
    const raw = match[0]
    if (!Number.isFinite(Number(raw))) refuse("NONFINITE_NUMBER")
    this.i += raw.length
    return { t: "n", raw }
  }
}

/** The strictly decoded document of ``bytes`` (contract section 4, steps 1-2). */
export function parseStrict(bytes: Uint8Array): JObject {
  if (bytes.length > MAX_FILE_BYTES) refuse("FILE_TOO_LARGE")
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) refuse("BOM")
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return refuse("NOT_UTF8")
  }
  if (!text.replace(/[ \t\n\r]/g, "")) refuse("EMPTY_INPUT")
  const node = new Parser(text).parse()
  if (node.t !== "o") refuse("NOT_AN_OBJECT")
  return node
}

// ── node access ─────────────────────────────────────────────────────────────────────────────────────────────────

function member(o: JObject, key: string): JNode | undefined {
  return o.members.find((m) => m.key === key)?.value
}
const isObj = (n: JNode | undefined): n is JObject => n?.t === "o"
const isArr = (n: JNode | undefined): n is JArray => n?.t === "a"
const isStr = (n: JNode | undefined): n is JString => n?.t === "s"
const isNull = (n: JNode | undefined): boolean => n === undefined || (n.t === "l" && n.raw === "null")
function str(n: JNode | undefined): string | null {
  return isStr(n) ? n.value : null
}
/** A non-negative integer token: digits only (no sign, fraction or exponent), at most ``digits`` long. */
function uintRaw(n: JNode | undefined, digits: number): string | null {
  return n?.t === "n" && /^(0|[1-9][0-9]*)$/.test(n.raw) && n.raw.length <= digits ? n.raw : null
}
const INT64_MAX = "9223372036854775807"
function withinInt64(raw: string): boolean {
  return raw.length < 19 || (raw.length === 19 && raw <= INT64_MAX)
}
function safeUint(n: JNode | undefined): boolean {
  const raw = uintRaw(n, 16)
  return raw !== null && Number(raw) <= Number.MAX_SAFE_INTEGER
}

// ── the server's grammar (cyntro_data/iac/state_document.py), on the whole document ─────────────────────────────

const IDENT = /^[A-Za-z_][A-Za-z0-9_-]*$/           // ASCII: stricter than the server's Unicode identifiers -- refuses more
const LINEAGE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const TF_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const DEPOSED = /^[0-9a-f]{8}$/
const PROVIDER_SOURCE = /^[^\s"/[\]]+(?:\/[^\s"/[\]]+){1,2}$/
const FORMAT = /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/

function plainKey(value: string): boolean {
  for (let k = 0; k < value.length; k++) {
    const c = value.charCodeAt(k)
    if (c < 0x20 || c > 0x7e || c === 0x22 || c === 0x5c) return false
  }
  return !value.includes("${") && !value.includes("%{")
}
type Key = { int: string } | { str: string } | null
/** An instance key: absent, a non-negative int64, or a plain string; anything else refuses. */
function keyOf(n: JNode | undefined): Key {
  if (isNull(n)) return null
  if (isStr(n)) return plainKey(n.value) ? { str: n.value } : refuse("INDEX_KEY_UNSUPPORTED")
  const raw = uintRaw(n, 19)
  if (raw === null || !withinInt64(raw)) refuse("INDEX_KEY_INVALID")
  return { int: raw }
}
function renderKey(key: Key): string {
  if (key === null) return ""
  return "int" in key ? `[${key.int}]` : `[${JSON.stringify(key.str)}]`
}

type Step = { name: string; key: Key }
const MODULE_STEP = /^module\.([A-Za-z_][A-Za-z0-9_-]*)(?:\[(0|[1-9][0-9]{0,18}|"[^"\\]*")\])?/
/** The steps of a complete module path (``module.a["k"].module.b[0]``), every character consumed, or null. */
function moduleSteps(text: string): Step[] | null {
  if (!text) return null
  const steps: Step[] = []
  let rest = text
  for (;;) {
    const m = MODULE_STEP.exec(rest)
    if (!m) return null
    let key: Key = null
    if (m[2] !== undefined) {
      if (m[2].startsWith('"')) {
        const k = m[2].slice(1, -1)
        if (!plainKey(k)) return null
        key = { str: k }
      } else {
        if (!withinInt64(m[2])) return null
        key = { int: m[2] }
      }
    }
    steps.push({ name: m[1], key })
    rest = rest.slice(m[0].length)
    if (rest === "") return steps
    if (!rest.startsWith(".")) return null
    rest = rest.slice(1)
  }
}
function renderSteps(steps: Step[]): string {
  return steps.map((s) => `module.${s.name}${renderKey(s.key)}`).join(".")
}
function address(steps: Step[], mode: string, type: string, name: string, key: Key): string {
  const parts = steps.length ? [renderSteps(steps)] : []
  if (mode === "data") parts.push("data")
  parts.push(`${type}.${name}`)
  return parts.join(".") + renderKey(key)
}
/** ``[module path.]provider["<source>"][.<alias>]`` -> the source, or a refusal. */
function rawProvider(n: JNode | undefined): string {
  const text = str(n)
  const m = text === null ? null : /^(?:(.+)\.)?provider\["([^"]*)"\](?:\.([A-Za-z_][A-Za-z0-9_-]*))?$/.exec(text)
  if (!m || !PROVIDER_SOURCE.test(m[2]) || (m[1] !== undefined && moduleSteps(m[1]) === null)) refuse("PROVIDER_INVALID")
  return m[2]
}

/** Raw-state sensitivity (``state_document.raw_sensitive``): the WHOLE structure, every step; absent = none. */
function validateRawSensitivity(paths: JNode | undefined): void {
  if (paths === undefined) return
  if (!isArr(paths)) refuse("SENSITIVE_ATTRIBUTES_INVALID")
  for (const path of paths.items) {
    if (!isArr(path)) refuse("SENSITIVE_ATTRIBUTES_INVALID")
    path.items.forEach((step, position) => {
      if (!isObj(step) || step.members.length !== 2 || !member(step, "type") || !member(step, "value")) {
        refuse("SENSITIVE_ATTRIBUTES_INVALID")
      }
      const kind = str(member(step, "type"))
      if (kind === "get_attr") {
        if (!str(member(step, "value"))) refuse("SENSITIVE_ATTRIBUTES_INVALID")
      } else if (!(kind === "index" && position > 0)) refuse("SENSITIVE_ATTRIBUTES_INVALID")
    })
  }
}
/** Show-state mask (``state_document.mask_sensitive``): required; a boolean, or an object whose every leaf is a boolean. */
function validateMask(mask: JNode | undefined): void {
  if (mask === undefined) refuse("SENSITIVE_ATTRIBUTES_INVALID")
  if (mask.t === "l" && mask.raw !== "null") return
  if (!isObj(mask)) refuse("SENSITIVE_ATTRIBUTES_INVALID")
  const stack: JNode[] = [mask]
  while (stack.length) {
    const node = stack.pop() as JNode
    if (node.t === "o" || node.t === "a") pushChildren(stack, node)
    else if (!(node.t === "l" && node.raw !== "null")) refuse("SENSITIVE_ATTRIBUTES_INVALID")
  }
}
/** (SW112) One push per child: never ``push(...children)``, whose argument count is bounded by the engine's call stack (a
 *  valid 150k-element mask, inside every document budget, raised an untyped RangeError). Only the document budgets bound it. */
function pushChildren(stack: JNode[], node: JObject | JArray): void {
  if (node.t === "o") for (const m of node.members) stack.push(m.value)
  else for (const item of node.items) stack.push(item)
}

// ── reduction ───────────────────────────────────────────────────────────────────────────────────────────────────

const supported = (mode: string, type: string, source: string): boolean =>
  mode === "managed" && SUPPORTED_TYPES.includes(type) && AWS_PROVIDER_SOURCES.includes(source)

function pick(o: JObject, keys: readonly string[]): JObject {
  return { t: "o", members: o.members.filter((m) => keys.includes(m.key)) }
}

/** The only attributes ever sent (``state_document.RETAINED_ATTRIBUTES``). */
const IDENTITY: readonly string[] = ["id", "arn"]
/** What an instance's marks say (``state_document.raw_sensitive`` / ``mask_sensitive``): the whole object, and which
 *  top-level attributes. Read only from a structure already validated. */
type Marks = { whole: boolean; marked: Set<string> }

function rawMarks(paths: JNode | undefined): Marks {
  const marks: Marks = { whole: false, marked: new Set() }
  for (const path of isArr(paths) ? paths.items : []) {
    const steps = (path as JArray).items
    if (steps.length === 0) marks.whole = true
    else marks.marked.add(str(member(steps[0] as JObject, "value")) as string)   // a mark below an attribute marks it all
  }
  return marks
}
/** ``state_document._marks``: a ``true`` at or anywhere below ``node``. */
function marksBelow(node: JNode): boolean {
  const stack: JNode[] = [node]
  while (stack.length) {
    const n = stack.pop() as JNode
    if (n.t === "l" && n.raw === "true") return true
    if (n.t === "o" || n.t === "a") pushChildren(stack, n)
  }
  return false
}
function maskMarks(mask: JNode): Marks {
  if (mask.t === "l") return { whole: mask.raw === "true", marked: new Set() }
  const marked = new Set(IDENTITY.filter((name) => {
    const below = member(mask as JObject, name)
    return below !== undefined && marksBelow(below)
  }))
  return { whole: false, marked }
}

/** (SW111) The identity values that may LEAVE the browser (``state_document.retain_identity``): an id / arn that is a
 *  STRING and is NOT marked. A marked value is withheld -- its mark is still sent, so the server sees it was marked -- and
 *  an object, array, number or boolean is never sent at all; each such withheld value is counted. ``null`` is absence. */
function identityOut(attributes: JObject, marks: Marks, c: Counter): JObject {
  const out: JObject = { t: "o", members: [] }
  for (const m of attributes.members) {
    if (!IDENTITY.includes(m.key) || isNull(m.value)) continue
    if (isStr(m.value) && !marks.whole && !marks.marked.has(m.key)) out.members.push(m)
    else c.withheld++
  }
  return out
}
const text = (value: string): JString => ({ t: "s", value, raw: JSON.stringify(value) })
const TRUE: JLiteral = { t: "l", raw: "true" }
/** The marks as SENT, rebuilt -- never copied: ``[]`` for the whole object, then ``[{get_attr, id|arn}]`` per marked
 *  identity attribute. A deeper step (an index value, a nested name) or a mark on a dropped attribute never travels. */
function rawMarksOut(marks: Marks): JArray {
  const items: JNode[] = marks.whole ? [{ t: "a", items: [] }] : []
  for (const name of IDENTITY.filter((n) => marks.marked.has(n))) {
    items.push({ t: "a", items: [{ t: "o", members: [{ key: "type", value: text("get_attr") }, { key: "value", value: text(name) }] }] })
  }
  return { t: "a", items }
}
/** The show mask as SENT: a bare boolean kept, else ``{id: true}`` / ``{arn: true}`` for the marked ones -- no nested
 *  structure (its member names are the workspace's) ever travels. */
function maskOut(mask: JNode, marks: Marks): JNode {
  if (mask.t === "l") return mask
  return { t: "o", members: IDENTITY.filter((n) => marks.marked.has(n)).map((key) => ({ key, value: TRUE })) }
}
function serialize(n: JNode): string {
  switch (n.t) {
    case "s":
      return n.raw                                     // the ORIGINAL token text: kept values are byte-identical
    case "n":
      return n.raw
    case "l":
      return n.raw
    case "a":
      return `[${n.items.map(serialize).join(",")}]`
    case "o":
      return `{${n.members.map((m) => `${JSON.stringify(m.key)}:${serialize(m.value)}`).join(",")}}`
  }
}

export type Reduction = {
  format: StateFormat
  /** The reduced document, as the exact text to send (``document`` of the envelope). */
  document: string
  /** Instances kept, per Terraform type. */
  resourceCount: number
  byType: Record<string, number>
  /** Instances in the file that are NOT kept (other kinds, data sources, other providers). */
  omittedCount: number
  /** id / arn values of KEPT instances that are not sent: marked sensitive (the mark is sent), or not a string. */
  withheldValueCount: number
  /** sha256 of the ORIGINAL file bytes -- sent as a claim, never authority. */
  claimedSourceDigest: string
}

type Counter = { kept: number; omitted: number; withheld: number; byType: Record<string, number>; instances: number }
function counted(c: Counter, type: string, kept: boolean): void {
  if (++c.instances > MAX_INSTANCES) refuse("TOO_MANY_INSTANCES")
  if (kept) {
    c.kept++
    c.byType[type] = (c.byType[type] ?? 0) + 1
  } else c.omitted++
}

function reduceRaw(doc: JObject, c: Counter): JObject {
  const version = member(doc, "version")
  if (!(version?.t === "n" && version.raw === "4")) refuse("UNSUPPORTED_STATE_VERSION")
  if (!safeUint(member(doc, "serial"))) refuse("SERIAL_INVALID")
  if (!LINEAGE.test(str(member(doc, "lineage")) ?? "")) refuse("LINEAGE_INVALID")
  const tfVersion = member(doc, "terraform_version")
  if (tfVersion !== undefined && !TF_VERSION.test(str(tfVersion) ?? "")) refuse("TERRAFORM_VERSION_INVALID")
  const resources = member(doc, "resources") ?? { t: "a", items: [] }
  if (!isArr(resources)) refuse("RESOURCES_INVALID")
  const kept: JObject[] = []
  const seen = new Set<string>()
  for (const resource of resources.items) {
    if (!isObj(resource)) refuse("RESOURCE_INVALID")
    const mode = str(member(resource, "mode"))
    if (mode !== "managed" && mode !== "data") refuse("UNSUPPORTED_RESOURCE_MODE")
    const type = str(member(resource, "type"))
    const name = str(member(resource, "name"))
    if (type === null || !IDENT.test(type)) refuse("RESOURCE_TYPE_INVALID")
    if (name === null || !IDENT.test(name)) refuse("RESOURCE_NAME_INVALID")
    const moduleNode = member(resource, "module")
    const steps = moduleNode === undefined || isNull(moduleNode) ? [] : moduleSteps(str(moduleNode) ?? "")
    if (steps === null) refuse("MODULE_ADDRESS_INVALID")
    const source = rawProvider(member(resource, "provider"))
    const instances = member(resource, "instances") ?? { t: "a", items: [] }
    if (!isArr(instances)) refuse("INSTANCES_INVALID")
    const keep = supported(mode, type, source)
    const reducedInstances: JNode[] = []
    for (const inst of instances.items) {
      if (!isObj(inst)) refuse("INSTANCE_INVALID")
      const attributes = member(inst, "attributes")
      if (isNull(attributes) && member(inst, "attributes_flat") !== undefined) refuse("LEGACY_FLATMAP_ATTRIBUTES")
      if (!isObj(attributes)) refuse("ATTRIBUTES_INVALID")
      const key = keyOf(member(inst, "index_key"))
      const deposed = member(inst, "deposed")
      if (deposed !== undefined && !isNull(deposed) && !DEPOSED.test(str(deposed) ?? "")) refuse("DEPOSED_KEY_INVALID")
      const status = member(inst, "status")
      if (status !== undefined && !isNull(status) && str(status) !== "tainted") refuse("INSTANCE_STATUS_INVALID")
      const schema = member(inst, "schema_version")
      if (schema !== undefined && !isNull(schema) && !safeUint(schema)) refuse("SCHEMA_VERSION_INVALID")
      const identity = `${address(steps, mode, type, name, key)}#${str(deposed) ?? ""}`
      if (seen.has(identity)) refuse("DUPLICATE_INSTANCE")
      seen.add(identity)
      const paths = member(inst, "sensitive_attributes")
      validateRawSensitivity(paths)                     // EVERY instance's, the dropped ones' included
      counted(c, type, keep)
      if (!keep) continue
      const out = pick(inst, ["schema_version", "index_key", "deposed", "status"])
      const marks = rawMarks(paths)
      out.members.push({ key: "attributes", value: identityOut(attributes, marks, c) })
      if (isArr(paths)) out.members.push({ key: "sensitive_attributes", value: rawMarksOut(marks) })
      reducedInstances.push(out)
    }
    if (keep) {
      const out = pick(resource, ["module", "mode", "type", "name", "provider"])
      out.members.push({ key: "instances", value: { t: "a", items: reducedInstances } })
      kept.push(out)
    }
  }
  const header = pick(doc, ["version", "terraform_version", "serial", "lineage"])
  header.members.push({ key: "resources", value: { t: "a", items: kept } })
  return header
}

function reduceShowModule(module: JObject, steps: Step[], seen: Set<string>, c: Counter): JObject | null {
  const resources = member(module, "resources") ?? { t: "a", items: [] }
  const children = member(module, "child_modules") ?? { t: "a", items: [] }
  if (!isArr(resources) || !isArr(children)) refuse("MODULE_INVALID")
  const kept: JNode[] = []
  for (const res of resources.items) {
    if (!isObj(res)) refuse("RESOURCE_INVALID")
    const mode = str(member(res, "mode"))
    if (mode !== "managed" && mode !== "data") refuse("UNSUPPORTED_RESOURCE_MODE")
    const type = str(member(res, "type"))
    const name = str(member(res, "name"))
    if (type === null || !IDENT.test(type)) refuse("RESOURCE_TYPE_INVALID")
    if (name === null || !IDENT.test(name)) refuse("RESOURCE_NAME_INVALID")
    const key = keyOf(member(res, "index"))
    if (str(member(res, "address")) !== address(steps, mode, type, name, key)) refuse("ADDRESS_INCONSISTENT")
    const source = str(member(res, "provider_name"))
    if (source === null || !PROVIDER_SOURCE.test(source)) refuse("PROVIDER_INVALID")
    const deposed = member(res, "deposed_key")
    if (deposed !== undefined && !isNull(deposed) && !DEPOSED.test(str(deposed) ?? "")) refuse("DEPOSED_KEY_INVALID")
    const tainted = member(res, "tainted")
    if (tainted !== undefined && !(tainted.t === "l" && tainted.raw !== "null")) refuse("INSTANCE_STATUS_INVALID")
    const schema = member(res, "schema_version")
    if (schema !== undefined && !isNull(schema) && !safeUint(schema)) refuse("SCHEMA_VERSION_INVALID")
    const values = member(res, "values") ?? { t: "o", members: [] }
    if (!isObj(values)) refuse("ATTRIBUTES_INVALID")
    const mask = member(res, "sensitive_values")
    validateMask(mask)                                  // EVERY resource's mask, the dropped ones' included
    const identity = `${str(member(res, "address"))}#${str(deposed) ?? ""}`
    if (seen.has(identity)) refuse("DUPLICATE_INSTANCE")
    seen.add(identity)
    const keep = supported(mode, type, source)
    counted(c, type, keep)
    if (!keep) continue
    const out = pick(res, ["address", "mode", "type", "name", "index", "provider_name", "schema_version", "tainted", "deposed_key"])
    const marks = maskMarks(mask as JNode)
    out.members.push({ key: "values", value: identityOut(values, marks, c) })
    out.members.push({ key: "sensitive_values", value: maskOut(mask as JNode, marks) })
    kept.push(out)
  }
  const keptChildren: JNode[] = []
  for (const child of children.items) {
    if (!isObj(child)) refuse("MODULE_INVALID")
    const childSteps = moduleSteps(str(member(child, "address")) ?? "")
    if (childSteps === null || childSteps.length !== steps.length + 1
        || renderSteps(childSteps.slice(0, -1)) !== renderSteps(steps)) refuse("MODULE_ADDRESS_INVALID")
    const reduced = reduceShowModule(child, childSteps, seen, c)
    if (reduced) keptChildren.push(reduced)
  }
  if (steps.length && !kept.length && !keptChildren.length) return null      // nothing supported below: the module is omitted
  const out: JObject = { t: "o", members: steps.length ? [{ key: "address", value: member(module, "address") as JNode }] : [] }
  out.members.push({ key: "resources", value: { t: "a", items: kept } })
  if (keptChildren.length) out.members.push({ key: "child_modules", value: { t: "a", items: keptChildren } })
  return out
}

function reduceShow(doc: JObject, c: Counter): JObject {
  const fmt = FORMAT.exec(str(member(doc, "format_version")) ?? "")
  if (!fmt || fmt[1] !== "1") refuse("UNSUPPORTED_FORMAT_VERSION")
  const tfVersion = member(doc, "terraform_version")
  if (tfVersion !== undefined && !TF_VERSION.test(str(tfVersion) ?? "")) refuse("TERRAFORM_VERSION_INVALID")
  const header = pick(doc, ["format_version", "terraform_version"])
  const values = member(doc, "values")
  if (values === undefined) return header
  if (!isObj(values)) refuse("VALUES_INVALID")
  const root = member(values, "root_module")
  if (!isObj(root)) refuse("ROOT_MODULE_INVALID")
  if (member(root, "address") !== undefined) refuse("MODULE_ADDRESS_INVALID")
  const reduced = reduceShowModule(root, [], new Set(), c) as JObject
  header.members.push({ key: "values", value: { t: "o", members: [{ key: "root_module", value: reduced }] } })
  return header
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)                                     // an ArrayBuffer of our own (the input may view a shared buffer)
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer))
  return "sha256:" + Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** The whole browser half (contract section 4): the file validated strictly, then reduced. A refusal is ReductionRefused. */
export async function reduceTerraformState(bytes: Uint8Array): Promise<Reduction> {
  const doc = parseStrict(bytes)
  const isRaw = member(doc, "version") !== undefined
  const isShow = member(doc, "format_version") !== undefined
  if (isRaw === isShow) refuse("UNSUPPORTED_FORMAT")
  const c: Counter = { kept: 0, omitted: 0, withheld: 0, byType: {}, instances: 0 }
  const reduced = isRaw ? reduceRaw(doc, c) : reduceShow(doc, c)
  if (c.kept === 0) refuse("NO_SUPPORTED_RESOURCES")
  return { format: isRaw ? "raw_state_v4" : "show_state_json", document: serialize(reduced), resourceCount: c.kept,
           byType: c.byType, omittedCount: c.omitted, withheldValueCount: c.withheld, claimedSourceDigest: await sha256(bytes) }
}

/** The request body (contract section 1), measured EXACTLY in UTF-8 bytes -- the document's escaping included. Over
 *  MAX_ENVELOPE_BYTES it is refused HERE, never sent to be refused. */
export function buildEnvelope(args: { requestId: string; accountId: string; workspaceIdentity: string; reduction: Reduction }):
    { body: string; bytes: number } {
  const body = JSON.stringify({
    request_id: args.requestId, account_id: args.accountId, workspace_identity: args.workspaceIdentity,
    format: args.reduction.format, document: args.reduction.document, reduction: REDUCTION,
    consent: { text_version: CONSENT_VERSION, confirmed: true }, claimed_source_digest: args.reduction.claimedSourceDigest,
  })
  const bytes = new TextEncoder().encode(body).length
  if (bytes > MAX_ENVELOPE_BYTES) refuse("ENVELOPE_TOO_LARGE")
  return { body, bytes }
}
