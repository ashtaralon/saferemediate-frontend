/**
 * Tests for lib/active-filters.ts — the frontend stale-node gate.
 *
 * This is the test that closes the "xxxxweb1 kept reappearing" loop
 * from the May 2026 backend hardening campaign. xxxxweb1 was a stale
 * EC2 (is_active=false) in alon-prod. The backend gate eventually
 * shipped (a41c1c7); but during the campaign, even after the backend
 * filtered xxxxweb1 from fresh responses, the frontend kept rendering
 * it because useCachedFetch served the previous-success localStorage
 * IAP payload on backend 502s.
 *
 * filterActivePaths is the client-side gate that catches that case.
 * If this test ever regresses, the xxxxweb1 surface is reopened.
 */
import { describe, expect, test } from "vitest"

import {
  collectStaleIds,
  filterActivePaths,
  isActiveNode,
} from "@/lib/active-filters"
import type { ActivePathList } from "@/lib/active-filters"
import type { AttackPathLike } from "@/lib/active-filters"

describe("isActiveNode", () => {
  test("rejects explicit is_active=false", () => {
    expect(isActiveNode({ id: "i-stale", is_active: false })).toBe(false)
  })

  test("accepts explicit is_active=true", () => {
    expect(isActiveNode({ id: "i-live", is_active: true })).toBe(true)
  })

  test("accepts missing is_active (backward-compat with older collectors)", () => {
    // Coalesce convention — null/missing means "field not set", treat
    // as active. Matches api/_workload_filters.py's is_active_workload_dict.
    expect(isActiveNode({ id: "i-legacy" })).toBe(true)
  })

  test("accepts is_active=null", () => {
    expect(isActiveNode({ id: "i-legacy", is_active: null })).toBe(true)
  })

  test("rejects null / undefined / non-object", () => {
    expect(isActiveNode(undefined)).toBe(false)
    expect(isActiveNode(null)).toBe(false)
    // @ts-expect-error — runtime guard test
    expect(isActiveNode("i-stale")).toBe(false)
  })

  test("rejects via staleIds set even when is_active is missing", () => {
    // Dual-label defense — backend's compute_stale_resource_ids mirror.
    // The Service-labeled variant has no is_active field but its id
    // matches a known-stale resource; the predicate must still reject.
    const stale = new Set(["i-shared"])
    expect(isActiveNode({ id: "i-shared" }, stale)).toBe(false)
  })

  test("staleIds is authoritative even when is_active=true is set", () => {
    // Conservative: if a server-known stale_ids set contains the id,
    // drop the node regardless of its own field. Prevents silent
    // re-introduction of phantoms via collector misorder.
    const stale = new Set(["i-conflicted"])
    expect(isActiveNode({ id: "i-conflicted", is_active: true }, stale)).toBe(
      false,
    )
  })
})

describe("filterActivePaths — xxxxweb1 canary scenario", () => {
  // The exact shape that triggered the May 2026 incident: a cached IAP
  // response from before backend hardening, containing a path through
  // xxxxweb1 (is_active=false). On a backend 502, useCachedFetch
  // surfaces this cached response and the path renders without the
  // backend gate having a chance to fire. The client-side filter is
  // the only thing standing between this cache and the user.
  const xxxxweb1Path = {
    id: "path-29278c021758",
    crown_jewel_id: "arn:aws:s3:::cyntro-demo-prod-data-745783559495",
    nodes: [
      {
        id: "i-0b23ef0a6bb840b39",
        name: "i-0b23ef0a6bb840b39",
        type: "EC2Instance",
        is_active: false, // ← the stale flag the backend gate added
      },
      {
        id: "arn:aws:iam::745783559495:role/alon-demo-ec2-role",
        name: "alon-demo-ec2-role",
        type: "IAMRole",
      },
      {
        id: "arn:aws:s3:::cyntro-demo-prod-data-745783559495",
        name: "cyntro-demo-prod-data-745783559495",
        type: "S3Bucket",
      },
    ],
  }

  const liveAppPath = {
    id: "path-6af7f24ee0bd",
    crown_jewel_id: "arn:aws:s3:::cyntro-demo-prod-data-745783559495",
    nodes: [
      {
        id: "i-0aa725bf8ff4c2001",
        name: "alon-demo-app2",
        type: "EC2Instance",
        is_active: true,
      },
      {
        id: "arn:aws:iam::745783559495:role/alon-demo-ec2-role",
        name: "alon-demo-ec2-role",
        type: "IAMRole",
      },
      {
        id: "arn:aws:s3:::cyntro-demo-prod-data-745783559495",
        name: "cyntro-demo-prod-data-745783559495",
        type: "S3Bucket",
      },
    ],
  }

  test("drops the xxxxweb1 path", () => {
    const out = filterActivePaths([xxxxweb1Path, liveAppPath])
    const ids = out.map((p) => p.id)
    expect(ids).not.toContain("path-29278c021758")
  })

  test("keeps the live alon-demo-app2 path", () => {
    const out = filterActivePaths([xxxxweb1Path, liveAppPath])
    const ids = out.map((p) => p.id)
    expect(ids).toContain("path-6af7f24ee0bd")
  })

  test("returns exactly the live path when xxxxweb1 is filtered", () => {
    const out = filterActivePaths([xxxxweb1Path, liveAppPath])
    expect(out).toHaveLength(1)
  })
})

describe("filterActivePaths — defensive paths", () => {
  test("handles undefined / null input", () => {
    expect(filterActivePaths(undefined)).toEqual([])
    expect(filterActivePaths(null)).toEqual([])
  })

  test("handles empty array", () => {
    expect(filterActivePaths([])).toEqual([])
  })

  test("keeps paths whose nodes have no is_active (legacy collectors)", () => {
    // Backward compat — if EVERY node lacks the field, the whole
    // path renders. Pre-soft-delete collectors didn't write is_active;
    // dropping their data would erase historical paths.
    const legacyPath = {
      id: "path-legacy",
      crown_jewel_id: "arn:aws:s3:::bucket",
      nodes: [
        { id: "i-old", type: "EC2Instance" },
        { id: "role-old", type: "IAMRole" },
      ],
    }
    expect(filterActivePaths([legacyPath])).toEqual([legacyPath])
  })

  test("drops the entire path when ANY node is stale (chain is broken)", () => {
    // The chain is only as live as its weakest link. A stale role on
    // an otherwise-live path means the path no longer reaches its
    // destination — drop the whole thing.
    const partialStalePath = {
      id: "path-partial",
      crown_jewel_id: "arn:aws:s3:::bucket",
      nodes: [
        { id: "i-live", type: "EC2Instance", is_active: true },
        { id: "role-stale", type: "IAMRole", is_active: false },
        { id: "bucket", type: "S3Bucket" },
      ],
    }
    expect(filterActivePaths([partialStalePath])).toEqual([])
  })

  test("drops via staleIds set even when path nodes lack is_active", () => {
    // The dual-label backend defense — the IAP serializer might not
    // emit is_active for every node variant. The staleIds set bridges
    // this gap when the caller has server-side knowledge of which
    // resources are soft-deleted.
    const dualLabelPath = {
      id: "path-dual-label",
      crown_jewel_id: "arn:aws:s3:::bucket",
      nodes: [
        // No is_active field — but this id is known-stale via the set
        { id: "i-shadowed", type: "EC2Instance" },
        { id: "role-x", type: "IAMRole" },
        { id: "bucket", type: "S3Bucket" },
      ],
    }
    const out = filterActivePaths([dualLabelPath], new Set(["i-shadowed"]))
    expect(out).toEqual([])
  })
})

// ─── Branded type — compile-time enforcement ──────────────────────────
//
// These tests don't ASSERT anything at runtime. They use `@ts-expect-error`
// to prove the TypeScript compiler rejects bypasses. If the compiler
// stops rejecting (someone removed the brand, weakened the type, etc.),
// the @ts-expect-error annotation fails the build with
// "Unused @ts-expect-error directive".
//
// This is the fact-based half of the enforcement model. The runtime
// tests above prove the filter logic; these prove the type system
// won't let anyone skip the filter at the call site.

describe("ActivePathList — compile-time brand enforcement", () => {
  test("filterActivePaths returns the branded type", () => {
    const paths: AttackPathLike[] = []
    const filtered: ActivePathList<AttackPathLike> = filterActivePaths(paths)
    // Runtime check that the array is usable as a normal array
    expect(filtered.length).toBe(0)
  })

  test("a raw array is NOT assignable to ActivePathList — compile error", () => {
    const raw: AttackPathLike[] = [{ id: "i-test", nodes: [] }]
    // @ts-expect-error — raw paths lack the brand; assigning must fail
    const _branded: ActivePathList<AttackPathLike> = raw
    void _branded
  })

  test("an empty literal is NOT assignable either — compile error", () => {
    // @ts-expect-error — literals don't carry the brand
    const _branded: ActivePathList<AttackPathLike> = []
    void _branded
  })

  test("the only construction path is filterActivePaths", () => {
    // Sanity check that the filter accepts undefined/null without TS error
    const ok1: ActivePathList<AttackPathLike> = filterActivePaths(undefined)
    const ok2: ActivePathList<AttackPathLike> = filterActivePaths(null)
    const ok3: ActivePathList<AttackPathLike> = filterActivePaths([])
    expect(ok1).toBeDefined()
    expect(ok2).toBeDefined()
    expect(ok3).toBeDefined()
  })
})

describe("collectStaleIds", () => {
  test("returns ids of nodes where is_active=false", () => {
    const out = collectStaleIds([
      { id: "i-stale", is_active: false },
      { id: "i-live", is_active: true },
      { id: "i-legacy" },
    ])
    expect(out).toEqual(new Set(["i-stale"]))
  })

  test("returns empty set on null/undefined input", () => {
    expect(collectStaleIds(undefined)).toEqual(new Set())
    expect(collectStaleIds(null)).toEqual(new Set())
  })

  test("skips nodes without an id field", () => {
    const out = collectStaleIds([
      { is_active: false } as any,
      { id: "i-stale", is_active: false },
    ])
    expect(out).toEqual(new Set(["i-stale"]))
  })
})
