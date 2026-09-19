// @vitest-environment node
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import {
  BACKEND,
  FIXTURE_DIR,
  ROLE_ARN,
  ROLE_NAME,
  SERVICE_TOKEN,
  backendSocket,
  callRoute,
  captured,
  mutatedCapture,
  startServer,
  stopServer,
  type CapturedName,
  type Reply,
  type Sent,
} from "./fixtures/semantic-identity-data-access-fe16eb0b/route-chain"
import { WITHHELD, readPart } from "@/lib/identity-data-access"
import { SITE_SESSION_COOKIE, issueSiteSession } from "@/lib/server/site-session"

// The digest Semantic published for the packet's SHA256SUMS; the copies here must be byte-identical.
const PUBLISHED_SUMS_DIGEST = "0c234109442965c6e7f3a9abddfa76c6cff40bfbc262f303a3cb5fb08f9699e8"

// Canary graph-database coordinates: if any route still read them, a request would reach this host or carry them.
const CANARY = {
  NEO4J_URI: "neo4j+s://canary-graph.invalid",
  NEO4J_PASSWORD: "canary-password-VALUE",
  NEXT_PUBLIC_NEO4J_URI: "neo4j+s://canary-graph.invalid",
  NEXT_PUBLIC_NEO4J_PASSWORD: "canary-password-VALUE",
}

const saved = { ...process.env }
let sent: Sent[] = []
let reply: () => Reply = () => {
  throw new Error("the test chose no backend reply")
}
const use = (name: CapturedName) => { reply = () => captured(name) }
const useMutated = (name: CapturedName, change: (body: any) => void) => {
  const mutated = mutatedCapture(name, change)
  reply = () => mutated
}

beforeEach(() => {
  sent = []
  Object.assign(process.env, CANARY)
  // Only the transport is faked; the startup hook installs the real writer around it.
  vi.stubGlobal("fetch", backendSocket(() => reply(), sent))
})
afterEach(() => {
  vi.unstubAllGlobals()
  stopServer(saved)
  process.env = { ...saved }
})

function assertOneBackendCall(): Sent {
  expect(sent).toHaveLength(1)
  const [call] = sent
  expect(call.url.origin).toBe(BACKEND)
  expect(call.url.pathname).toBe("/api/identity-data-access")
  expect([...call.url.searchParams.keys()]).toEqual(["identity_arn"])
  expect(call.url.searchParams.get("identity_arn")).toBe(ROLE_ARN)
  expect(call.url.href).not.toMatch(/canary|neo4j|:7474|:7687|\/tx\/commit|neptune/i)
  expect(JSON.stringify([...call.headers.entries()])).not.toContain("canary-password-VALUE")
  return call
}

/** The service token reaches the backend and nothing the browser receives. */
function assertTokenServerSide(call: Sent, response: { text: string; headers: Headers }) {
  expect(call.headers.get("X-Cyntro-Service-Token")).toBe(SERVICE_TOKEN)
  expect(response.text).not.toContain(SERVICE_TOKEN)
  expect(JSON.stringify([...response.headers.entries()])).not.toContain(SERVICE_TOKEN)
}

describe("captured bodies: copied unchanged from Semantic's packet", () => {
  it("match the published SHA256SUMS, byte for byte", () => {
    const sums = fs.readFileSync(path.join(FIXTURE_DIR, "SHA256SUMS"))
    expect(createHash("sha256").update(sums).digest("hex")).toBe(PUBLISHED_SUMS_DIGEST)
    const lines = sums.toString("utf8").trim().split("\n")
    expect(lines).toHaveLength(11)
    for (const line of lines) {
      const [digest, file] = line.split(/\s+/)
      const actual = createHash("sha256").update(fs.readFileSync(path.join(FIXTURE_DIR, file))).digest("hex")
      expect(actual, file).toBe(digest)
    }
  })
})

describe("customer-resident: ready answers through the real proof selection and writer", () => {
  beforeEach(() => startServer("customer_resident"))

  it("01 populated: an S3 store with pinned evidence, an inferred table row, verified provenance", async () => {
    use("01-ready-populated")
    const response = await callRoute()
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    const call = assertOneBackendCall()
    // The signed OIDC data is the identity proof; the writer also attaches the token, server-side only.
    expect(call.headers.get("X-Amzn-Oidc-Data")).toBe("signed-claims")
    assertTokenServerSide(call, response)

    const body = response.body
    expect(body.answer).toEqual({ status: "ready", reasonCode: null, reasonCategory: null })
    expect(body.scope).toEqual({ tenantId: "tenant-a", accountId: "111122223333" })
    expect(body.identity).toEqual({ arn: ROLE_ARN, name: ROLE_NAME, kind: "iam_role" })
    expect(body.freshness).toEqual({
      source: "Neptune Serving Graph", generation: 42, lastSync: "2026-09-18T06:00:00+00:00",
      status: "fresh", ageSeconds: 7200, maxAgeSeconds: 43200,
    })

    // Every value below is read from the captured producer body, not written here.
    const raw = captured("01-ready-populated").body.result
    const [store] = body.dataStores
    expect(body.dataStores).toHaveLength(1)
    expect(store).toMatchObject({
      name: raw.data_stores[0].name, arn: raw.data_stores[0].arn, stableId: raw.data_stores[0].stable_id,
      region: raw.data_stores[0].region, type: "S3", resourceType: "s3:bucket",
      allowedOperations: null,
      allowedOperationsStatus: { state: "NOT_COMPUTED", reasonCode: "DECISION_IDENTITY_DATA_ACCESS_ALLOWED_OPERATIONS_UNSUPPORTED" },
      observedOperations: raw.data_stores[0].observed_operations,
    })
    expect(store.observedEvidence).toEqual(raw.data_stores[0].observed_evidence.map((e: any) => ({
      actionType: e.action_type, actions: e.actions, hitCount: e.hit_count, firstSeen: e.first_seen,
      lastSeen: e.last_seen, sourceTypes: e.source_types, s3AccessGeneration: e.s3_access_generation,
      evidenceObjectKey: e.evidence_object_key, evidenceVersionId: e.evidence_version_id, evidenceDigest: e.evidence_digest,
    })))
    expect(body.dataStoresStatus).toMatchObject({ available: true, state: "COMPUTED", reasonCode: null, servicesCovered: ["S3"], missingProofs: [] })
    expect(body.dataStoresStatus.observationWindow).toEqual(raw.data_stores_status.observation_window)

    expect(body.tableAccess).toEqual(raw.table_access.map((t: any) => ({
      tableName: t.table, database: t.database, rdsInstance: t.rds_instance, schema: t.schema, operations: t.operations,
      accessCount: t.access_count, lastSeen: t.last_seen, dailyAvg: t.daily_avg, viaDbUser: t.via_db_user,
      linkBasis: "INFERRED_FLOW_LOG_CORRELATION",
    })))
    expect(body.tableAccessStatus).toMatchObject({
      available: true, state: "PARTIAL", reasonCode: raw.table_access_status.reason_code,
      servicesCovered: ["RDS"], linkBasis: "INFERRED_FLOW_LOG_CORRELATION",
    })

    // Pre-existing keys remain; nothing derived from allowed operations is invented.
    for (const key of ["dataStores", "tableAccess", "summary", "servicePermissions"]) expect(body).toHaveProperty(key)
    expect(body.servicePermissions).toBeNull()
    expect(body.summary).toEqual({
      totalDataStores: 1, totalObservedOps: 3, countsAreLowerBounds: false, servicesAccessed: ["S3"],
      totalAllowedOps: null, hasDestructiveAccess: null,
    })
    expect(response.text).not.toMatch(/neo4j|aura/i)
  })

  it("10 is byte-identical to 01 by construction, and maps identically", async () => {
    expect(JSON.stringify(captured("10-inferred-table-access"))).toBe(JSON.stringify(captured("01-ready-populated")))
    use("10-inferred-table-access")
    const ten = (await callRoute()).body
    use("01-ready-populated")
    expect(ten).toEqual((await callRoute()).body)
    expect(ten.tableAccess.every((t: any) => t.linkBasis === "INFERRED_FLOW_LOG_CORRELATION")).toBe(true)
  })

  it("02 genuine empty: a computed, empty S3 list; table access not computed", async () => {
    use("02-ready-genuine-empty")
    const { body } = await callRoute()
    expect(body.answer.status).toBe("ready")
    expect(body.dataStores).toEqual([])
    expect(readPart(body.dataStoresStatus, 0)).toEqual({ kind: "empty" })
    expect(body.summary.totalDataStores).toBe(0)
    expect(body.tableAccessStatus).toMatchObject({
      available: false, state: "NOT_COMPUTED", reasonCode: "DECISION_IDENTITY_DATA_ACCESS_TABLE_COVERAGE_INCOMPLETE",
      missingProofs: ["rds_query_logs"],
    })
    expect(readPart(body.tableAccessStatus, 0)).toEqual({ kind: "not_computed" })
  })

  it("03 table not computed: stores served, tables not", async () => {
    use("03-ready-table-not-computed")
    const { body } = await callRoute()
    expect(body.dataStores).toHaveLength(1)
    expect(readPart(body.dataStoresStatus, 1)).toEqual({ kind: "rows", partial: false })
    expect(readPart(body.tableAccessStatus, body.tableAccess.length)).toEqual({ kind: "not_computed" })
  })

  it("08 partial with rows: rows as a lower bound, naming the missing proof", async () => {
    use("08-partial-with-rows")
    const { body } = await callRoute()
    expect(body.dataStores).toHaveLength(1)
    expect(body.dataStoresStatus).toMatchObject({
      available: true, state: "PARTIAL", missingProofs: ["s3_access_logs"],
      reasonCode: "DECISION_IDENTITY_DATA_ACCESS_S3_COVERAGE_INCOMPLETE",
    })
    expect(readPart(body.dataStoresStatus, 1)).toEqual({ kind: "rows", partial: true })
    expect(body.summary.countsAreLowerBounds).toBe(true)
  })

  it("09 partial and empty: not established, and never counted as zero", async () => {
    use("09-partial-empty")
    const { body } = await callRoute()
    expect(body.dataStores).toEqual([])
    expect(body.dataStoresStatus.missingProofs).toEqual(["cloudtrail_data_events", "s3_access_logs"])
    expect(readPart(body.dataStoresStatus, 0)).toEqual({ kind: "not_established" })
    expect(body.summary.totalDataStores).toBeNull()
    expect(body.summary.totalObservedOps).toBeNull()
  })

  it("a consistently stale generation stays stale", async () => {
    useMutated("01-ready-populated", (b) => {
      b.result.serving_generation.freshness_status = "stale"
      b.result.serving_generation.age_seconds = 50000
      b.provenance.freshness.serving_graph.status = "stale"
      b.provenance.freshness.serving_graph.age_seconds = 50000
    })
    const { body } = await callRoute()
    expect(body.answer.status).toBe("ready")
    expect(body.freshness.status).toBe("stale")
  })
})

describe("customer-resident: registered refusals keep their code", () => {
  beforeEach(() => startServer("customer_resident"))

  it.each([
    ["04-identity-unknown", "DECISION_IDENTITY_DATA_ACCESS_IDENTITY_NOT_FOUND", "absence"],
    ["05-out-of-scope", "DECISION_IDENTITY_DATA_ACCESS_SCOPE_MISMATCH", "consistency"],
    ["06-lifecycle-refusal", "TENANT_LIFECYCLE_OFFBOARDED", "authorization"],
  ] as const)("%s is a refusal, never an empty profile", async (name, code, category) => {
    use(name)
    const { status, body } = await callRoute()
    expect(status).toBe(200)
    assertOneBackendCall()
    expect(body.answer).toEqual({ status: "refused", reasonCode: code, reasonCategory: category })
    expect(body.dataStores).toEqual([])
    expect(body.tableAccess).toEqual([])
    expect(body.dataStoresStatus).toMatchObject({ available: false, state: null, reasonCode: code })
    expect(body.summary.totalDataStores).toBeNull()
    expect(body.freshness).toBeNull()
  })

  it("07 the auth boundary's untyped 401 stays a 401, named", async () => {
    use("07-unauthenticated-401")
    const { status, body } = await callRoute()
    expect(status).toBe(401)
    expect(body.answer).toEqual({ status: "failed", reasonCode: "IDENTITY_DATA_ACCESS_UNAUTHENTICATED", reasonCategory: null })
    expect(body.dataStores).toEqual([])
  })

  it("a refusal body that claims to be served is not a refusal", async () => {
    useMutated("04-identity-unknown", (b) => { b.result.serve_state = "ACTIVE" })
    expect((await callRoute()).body.answer.reasonCode).toBe(WITHHELD.INVALID_RESPONSE)
  })
})

type Mutation = [label: string, source: CapturedName, change: (body: any) => void, code: string]

const MUTATIONS: Mutation[] = [
  // Scope and identity.
  ["scope not resolved by the server", "01-ready-populated", (b) => { b.result.scope.resolved_by = "client" }, WITHHELD.SCOPE_UNPROVEN],
  ["no account in scope", "01-ready-populated", (b) => { delete b.result.scope.account_id }, WITHHELD.SCOPE_UNPROVEN],
  ["a blank tenant", "01-ready-populated", (b) => { b.result.scope.tenant_id = "" }, WITHHELD.SCOPE_UNPROVEN],
  ["an extra scope field", "01-ready-populated", (b) => { b.result.scope.system = "payments" }, WITHHELD.SCOPE_UNPROVEN],
  ["an answer about another role", "01-ready-populated", (b) => { b.result.identity.arn = "arn:aws:iam::111122223333:role/fixture-other-role" }, WITHHELD.IDENTITY_MISMATCH],
  // Self-consistent in every other field, so only the requested-ARN comparison can refuse it.
  ["a self-consistent answer about another role", "01-ready-populated", (b) => {
    const other = "arn:aws:iam::111122223333:role/fixture-other-role"
    b.result.identity.arn = other
    b.result.identity.name = "fixture-other-role"
    b.provenance.scope.resource_id = other
  }, WITHHELD.IDENTITY_MISMATCH],
  ["an identity outside the scoped account", "01-ready-populated", (b) => { b.result.scope.account_id = "444455556666" }, WITHHELD.IDENTITY_MISMATCH],
  ["a name that is not the ARN's", "01-ready-populated", (b) => { b.result.identity.name = "fixture-other-role" }, WITHHELD.IDENTITY_MISMATCH],
  ["a user where a role is served", "01-ready-populated", (b) => { b.result.identity.kind = "iam_user" }, WITHHELD.INVALID_RESPONSE],
  // (1) Provenance.
  ["a non-canonical evidence source", "01-ready-populated", (b) => { b.provenance.evidence_sources = ["Neo4j Aura"] }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["no evidence source", "01-ready-populated", (b) => { b.provenance.evidence_sources = [] }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["an extra evidence source", "01-ready-populated", (b) => { b.provenance.evidence_sources.push("Live AWS") }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["no freshness entry", "01-ready-populated", (b) => { b.provenance.freshness = {} }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["an unknown serving-graph status", "01-ready-populated", (b) => { b.provenance.freshness.serving_graph.status = "unknown" }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["envelope stale, answer fresh", "01-ready-populated", (b) => { b.provenance.freshness.serving_graph.status = "stale" }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["answer stale, envelope fresh", "01-ready-populated", (b) => { b.result.serving_generation.freshness_status = "stale" }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["another generation in the envelope", "01-ready-populated", (b) => { b.provenance.freshness.serving_graph.generation = 41 }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["another last sync in the envelope", "01-ready-populated", (b) => { b.provenance.freshness.serving_graph.last_sync = "2026-09-17T06:00:00+00:00" }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["another age in the envelope", "01-ready-populated", (b) => { b.provenance.freshness.serving_graph.age_seconds = 1 }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["an unknown freshness status", "01-ready-populated", (b) => { b.result.serving_generation.freshness_status = "unknown" }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["'fresh' past the contract's age", "01-ready-populated", (b) => {
    b.result.serving_generation.age_seconds = 50000
    b.provenance.freshness.serving_graph.age_seconds = 50000
  }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["generation zero", "01-ready-populated", (b) => { b.result.serving_generation.generation = 0; b.provenance.freshness.serving_graph.generation = 0 }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["provenance about another resource", "01-ready-populated", (b) => { b.provenance.scope.resource_id = "arn:aws:iam::111122223333:role/fixture-other-role" }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["completeness claiming complete", "01-ready-populated", (b) => { b.provenance.completeness.status = "complete" }, WITHHELD.PROVENANCE_UNVERIFIED],
  ["completeness hiding a missing source", "02-ready-genuine-empty", (b) => { b.provenance.completeness.missing_sources = [] }, WITHHELD.PROVENANCE_UNVERIFIED],
  // (2) Part-status invariants.
  ["COMPUTED with a reason", "01-ready-populated", (b) => { b.result.data_stores_status.reason_code = "DECISION_IDENTITY_DATA_ACCESS_S3_COVERAGE_INCOMPLETE" }, WITHHELD.PART_INVALID],
  ["COMPUTED with a missing proof", "01-ready-populated", (b) => { b.result.data_stores_status.missing_proofs = ["s3_access_logs"] }, WITHHELD.PART_INVALID],
  ["COMPUTED yet truncated", "01-ready-populated", (b) => { b.result.data_stores_status.truncated = true }, WITHHELD.PART_INVALID],
  ["PARTIAL without a reason", "08-partial-with-rows", (b) => { b.result.data_stores_status.reason_code = null }, WITHHELD.PART_INVALID],
  ["PARTIAL with an unregistered reason", "08-partial-with-rows", (b) => { b.result.data_stores_status.reason_code = "DECISION_SOMETHING_ELSE" }, WITHHELD.PART_INVALID],
  ["NOT_COMPUTED without a reason", "02-ready-genuine-empty", (b) => { b.result.table_access_status.reason_code = null }, WITHHELD.PART_INVALID],
  ["NOT_COMPUTED carrying rows", "01-ready-populated", (b) => {
    Object.assign(b.result.table_access_status, {
      state: "NOT_COMPUTED", reason_code: "DECISION_IDENTITY_DATA_ACCESS_TABLE_COVERAGE_INCOMPLETE",
      missing_proofs: ["rds_query_logs"], link_basis: null,
    })
  }, WITHHELD.PART_INVALID],
  ["table access claiming COMPUTED", "02-ready-genuine-empty", (b) => {
    Object.assign(b.result.table_access_status, { state: "COMPUTED", reason_code: null, missing_proofs: [] })
  }, WITHHELD.PART_INVALID],
  ["a window on a PARTIAL part", "08-partial-with-rows", (b) => {
    b.result.data_stores_status.observation_window = { start: "2026-06-20T00:00:00+00:00", end: "2026-09-18T00:00:00+00:00" }
  }, WITHHELD.PART_INVALID],
  ["a window that ends before it starts", "01-ready-populated", (b) => {
    b.result.data_stores_status.observation_window = { start: "2026-09-18T00:00:00+00:00", end: "2026-06-20T00:00:00+00:00" }
  }, WITHHELD.PART_INVALID],
  ["a service the stores part does not cover", "01-ready-populated", (b) => { b.result.data_stores_status.services_covered = ["S3", "DynamoDB"] }, WITHHELD.PART_INVALID],
  ["an unknown proof name", "08-partial-with-rows", (b) => { b.result.data_stores_status.missing_proofs = ["guesswork"] }, WITHHELD.PART_INVALID],
  ["inferred data stores", "01-ready-populated", (b) => { b.result.data_stores_status.link_basis = "INFERRED_FLOW_LOG_CORRELATION" }, WITHHELD.PART_INVALID],
  ["an unknown part state", "01-ready-populated", (b) => { b.result.data_stores_status.state = "MAYBE" }, WITHHELD.PART_INVALID],
  ["an extra part field", "01-ready-populated", (b) => { b.result.data_stores_status.confidence = "high" }, WITHHELD.PART_INVALID],
  ["an unread section served as COMPUTED", "01-ready-populated", (b) => { b.result.sections.data_stores = "UNAVAILABLE" }, WITHHELD.PART_INVALID],
  // (3) Store rows and their evidence.
  ["allowed operations as an empty list", "01-ready-populated", (b) => { b.result.data_stores[0].allowed_operations = [] }, WITHHELD.STORE_ROW_INVALID],
  ["allowed operations asserted", "01-ready-populated", (b) => { b.result.data_stores[0].allowed_operations = ["GetObject"] }, WITHHELD.STORE_ROW_INVALID],
  ["allowed operations claimed computed", "01-ready-populated", (b) => { b.result.data_stores[0].allowed_operations_status.state = "COMPUTED" }, WITHHELD.STORE_ROW_INVALID],
  ["allowed operations with another reason", "01-ready-populated", (b) => { b.result.data_stores[0].allowed_operations_status.reason_code = "DECISION_OTHER" }, WITHHELD.STORE_ROW_INVALID],
  ["no evidence", "01-ready-populated", (b) => { b.result.data_stores[0].observed_evidence = [] }, WITHHELD.STORE_ROW_INVALID],
  // Consistent with its (empty) evidence, so only the at-least-one-evidence rule can refuse it.
  ["no evidence and nothing observed", "01-ready-populated", (b) => {
    b.result.data_stores[0].observed_evidence = []
    b.result.data_stores[0].observed_operations = []
  }, WITHHELD.STORE_ROW_INVALID],
  ["an empty evidence object", "01-ready-populated", (b) => { b.result.data_stores[0].observed_evidence = [{}] }, WITHHELD.STORE_ROW_INVALID],
  ["evidence without its digest", "01-ready-populated", (b) => { delete b.result.data_stores[0].observed_evidence[0].evidence_digest }, WITHHELD.STORE_ROW_INVALID],
  ["a malformed digest", "01-ready-populated", (b) => { b.result.data_stores[0].observed_evidence[0].evidence_digest = "sha256:not-hex" }, WITHHELD.STORE_ROW_INVALID],
  ["evidence generation zero", "01-ready-populated", (b) => { b.result.data_stores[0].observed_evidence[0].s3_access_generation = 0 }, WITHHELD.STORE_ROW_INVALID],
  ["a blank evidence object key", "01-ready-populated", (b) => { b.result.data_stores[0].observed_evidence[0].evidence_object_key = "" }, WITHHELD.STORE_ROW_INVALID],
  ["evidence without a version", "01-ready-populated", (b) => { delete b.result.data_stores[0].observed_evidence[0].evidence_version_id }, WITHHELD.STORE_ROW_INVALID],
  ["first seen after last seen", "01-ready-populated", (b) => { b.result.data_stores[0].observed_evidence[0].first_seen = "2026-09-18T00:00:00+00:00" }, WITHHELD.STORE_ROW_INVALID],
  ["an unparseable timestamp", "01-ready-populated", (b) => { b.result.data_stores[0].observed_evidence[0].last_seen = "yesterday" }, WITHHELD.STORE_ROW_INVALID],
  ["an unknown evidence source", "01-ready-populated", (b) => { b.result.data_stores[0].observed_evidence[0].source_types = ["guesswork"] }, WITHHELD.STORE_ROW_INVALID],
  ["no evidence source", "01-ready-populated", (b) => { b.result.data_stores[0].observed_evidence[0].source_types = [] }, WITHHELD.STORE_ROW_INVALID],
  ["evidence with no actions", "01-ready-populated", (b) => { b.result.data_stores[0].observed_evidence[0].actions = [] }, WITHHELD.STORE_ROW_INVALID],
  ["an unknown action family", "01-ready-populated", (b) => { b.result.data_stores[0].observed_evidence[0].action_type = "exfiltrate" }, WITHHELD.STORE_ROW_INVALID],
  ["a negative hit count", "01-ready-populated", (b) => { b.result.data_stores[0].observed_evidence[0].hit_count = -1 }, WITHHELD.STORE_ROW_INVALID],
  ["an extra evidence field", "01-ready-populated", (b) => { b.result.data_stores[0].observed_evidence[0].confidence = 1 }, WITHHELD.STORE_ROW_INVALID],
  ["an observed operation with no evidence", "01-ready-populated", (b) => { b.result.data_stores[0].observed_operations.push("PutObjectAcl") }, WITHHELD.STORE_ROW_INVALID],
  ["an ARN for another bucket", "01-ready-populated", (b) => { b.result.data_stores[0].arn = "arn:aws:s3:::fixture-some-other-bucket" }, WITHHELD.STORE_ROW_INVALID],
  ["a store that is not a bucket", "01-ready-populated", (b) => { b.result.data_stores[0].resource_type = "dynamodb:table" }, WITHHELD.STORE_ROW_INVALID],
  ["a store with no region", "01-ready-populated", (b) => { b.result.data_stores[0].region = null }, WITHHELD.STORE_ROW_INVALID],
  ["an extra store field", "01-ready-populated", (b) => { b.result.data_stores[0].access_level = "FULL" }, WITHHELD.STORE_ROW_INVALID],
  // (4) Table rows: displayable only under the PARTIAL, inferred contract.
  ["a table row with no link basis", "01-ready-populated", (b) => { b.result.table_access[0].link_basis = null }, WITHHELD.TABLE_ROW_INVALID],
  ["a table row claiming observation", "01-ready-populated", (b) => { b.result.table_access[0].link_basis = "OBSERVED" }, WITHHELD.TABLE_ROW_INVALID],
  ["a table row without the field", "01-ready-populated", (b) => { delete b.result.table_access[0].link_basis }, WITHHELD.TABLE_ROW_INVALID],
  ["a PARTIAL table part without the inferred basis", "01-ready-populated", (b) => { b.result.table_access_status.link_basis = null }, WITHHELD.PART_INVALID],
  ["unsorted table operations", "01-ready-populated", (b) => { b.result.table_access[0].operations = ["SELECT", "INSERT"] }, WITHHELD.TABLE_ROW_INVALID],
  ["a negative access count", "01-ready-populated", (b) => { b.result.table_access[0].access_count = -5 }, WITHHELD.TABLE_ROW_INVALID],
  ["a table row with no instance", "01-ready-populated", (b) => { b.result.table_access[0].rds_instance = null }, WITHHELD.TABLE_ROW_INVALID],
  // The answer as a whole.
  ["an extra result field", "01-ready-populated", (b) => { b.result.allowed_operations = [] }, WITHHELD.INVALID_RESPONSE],
  ["a served state the parts contradict", "01-ready-populated", (b) => { b.result.serve_state = "ACTIVE" }, WITHHELD.INVALID_RESPONSE],
  ["an unrecognised result status", "01-ready-populated", (b) => { b.result.status = "maybe" }, WITHHELD.INVALID_RESPONSE],
  ["a required section not read", "01-ready-populated", (b) => { b.result.sections.identity = "UNAVAILABLE" }, WITHHELD.INVALID_RESPONSE],
]

describe("customer-resident: tampered or malformed producer fields withhold the whole answer (copies of real bodies)", () => {
  beforeEach(() => startServer("customer_resident"))

  it.each(MUTATIONS)("%s", async (_label, source, change, code) => {
    useMutated(source, change)
    const { status, body, text } = await callRoute()
    expect(status).toBe(200)
    expect(body.answer).toEqual({ status: "withheld", reasonCode: code, reasonCategory: null })
    expect(body.dataStores).toEqual([])
    expect(body.tableAccess).toEqual([])
    expect(body.freshness).toBeNull()
    expect(body.summary.totalDataStores).toBeNull()
    expect(text).not.toContain("fixture-orders-archive")
  })

  it("every unmutated ready body passes the same checks (positive control for the table above)", async () => {
    for (const name of ["01-ready-populated", "02-ready-genuine-empty", "03-ready-table-not-computed",
      "08-partial-with-rows", "09-partial-empty", "10-inferred-table-access"] as const) {
      use(name)
      expect((await callRoute()).body.answer.status, name).toBe("ready")
    }
  })
})

describe("customer-resident: requests it will not send, and failures", () => {
  beforeEach(() => startServer("customer_resident"))

  it("asks nothing without the identity's ARN, or with an ARN for another name", async () => {
    use("01-ready-populated")
    const missing = await callRoute({ arn: null })
    expect(missing.status).toBe(400)
    expect(missing.body.answer.reasonCode).toBe("IDENTITY_ARN_REQUIRED")
    const other = await callRoute({ arn: "arn:aws:iam::111122223333:role/fixture-web-role-admin" })
    expect(other.status).toBe(400)
    expect(other.body.answer.reasonCode).toBe("IDENTITY_ARN_NAME_MISMATCH")
    const notIam = await callRoute({ arn: "arn:aws:s3:::fixture-web-role" })
    expect(notIam.body.answer.reasonCode).toBe("IDENTITY_ARN_NAME_MISMATCH")
    expect(sent).toHaveLength(0)
  })

  it("refuses before any backend call when the customer-resident proof is missing", async () => {
    use("01-ready-populated")
    const { status, body } = await callRoute({ headers: {} })
    expect(status).toBe(403)
    expect(body.answer).toEqual({ status: "failed", reasonCode: "ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE", reasonCategory: null })
    expect(sent).toHaveLength(0)
  })

  it.each([
    ["an unreachable backend", { throws: true } as Reply, 502, "IDENTITY_DATA_ACCESS_UNAVAILABLE"],
    ["a backend 500 page", { raw: "<html>error</html>", http: 500 } as Reply, 502, "IDENTITY_DATA_ACCESS_UNAVAILABLE"],
    ["a 200 that is not JSON", { raw: "<html>gateway</html>", http: 200 } as Reply, 502, "IDENTITY_DATA_ACCESS_INVALID_RESPONSE"],
    ["the review scope refusing", { http: 403, body: { error_code: "REVIEW_SCOPE_MISMATCH" } } as Reply, 403, "REVIEW_SCOPE_MISMATCH"],
    ["the review scope unavailable", { http: 503, body: { error_code: "REVIEW_SCOPE_UNAVAILABLE" } } as Reply, 503, "REVIEW_SCOPE_UNAVAILABLE"],
    ["the Decision runtime off", { http: 503, body: { error_code: "DECISION_RUNTIME_DISABLED" } } as Reply, 503, "DECISION_RUNTIME_DISABLED"],
  ])("answers %s explicitly, never as an empty profile", async (_label, chosen, status, code) => {
    reply = () => chosen
    const res = await callRoute()
    expect(res.status).toBe(status)
    expect(res.body.answer).toEqual({ status: "failed", reasonCode: code, reasonCategory: null })
    expect(res.body.dataStores).toEqual([])
    expect(res.body.summary.totalDataStores).toBeNull()
  })
})

describe("hosted: the sealed session here, the service token to the backend", () => {
  it("presents only the token, server-side, and never a client-supplied identity header", async () => {
    await startServer("hosted")
    use("01-ready-populated")
    const session = await issueSiteSession()
    const response = await callRoute({
      headers: { cookie: `${SITE_SESSION_COOKIE}=${session}`, "x-amzn-oidc-data": "client-supplied" },
    })
    expect(response.status).toBe(200)
    expect(response.body.answer.status).toBe("ready")
    const call = assertOneBackendCall()
    assertTokenServerSide(call, response)
    expect(call.headers.has("X-Amzn-Oidc-Data")).toBe(false)
  })

  it("refuses the former forged cookie before any backend call", async () => {
    await startServer("hosted")
    use("01-ready-populated")
    const { status, body } = await callRoute({ headers: { cookie: `${SITE_SESSION_COOKIE}=authenticated` } })
    expect(status).toBe(401)
    expect(body.answer.reasonCode).toBe("SITE_SESSION_INVALID")
    expect(sent).toHaveLength(0)
  })

  it("refuses, by name, when no service token is installed, rather than asking unauthenticated", async () => {
    await startServer("hosted", { serviceToken: null })
    use("01-ready-populated")
    const session = await issueSiteSession()
    const { status, body } = await callRoute({ headers: { cookie: `${SITE_SESSION_COOKIE}=${session}` } })
    expect(status).toBe(503)
    expect(body.answer.reasonCode).toBe("DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE")
    expect(sent).toHaveLength(0)
  })
})

describe("orphan-services route: backend-sourced only", () => {
  it("contacts only the backend even with graph-database coordinates in the environment", async () => {
    process.env.BACKEND_URL_OVERRIDE = BACKEND
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: any) => {
      calls.push(String(input))
      return Response.json({ resources: [] })
    }))
    vi.resetModules()
    const orphans = await import("@/app/api/proxy/orphan-services/[systemName]/route")
    const res = await orphans.GET(
      new NextRequest("https://app.example/api/proxy/orphan-services/payments"),
      { params: Promise.resolve({ systemName: "payments" }) },
    )
    expect(res.status).toBe(200)
    expect(calls.length).toBeGreaterThan(0)
    for (const url of calls) {
      expect(url.startsWith(`${BACKEND}/`), url).toBe(true)
      expect(url).not.toMatch(/canary-graph|neo4j|:7474|:7687|\/tx\/commit|neptune/i)
    }
  })
})
