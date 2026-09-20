/// <reference types="vitest/globals" />
/**
 * A Remediated row presented graph metrics as the role's current state: "4
 * active", "33% permissions in active use", "8 still need review" (Codex 3430
 * and 3431 QA), while the change had removed 5 actions and left 7 allowed. The
 * receipt now says what the change did -- removed actions, and an allowed-after
 * count only from a verified saved checkpoint, labelled as derived -- and shows
 * the graph counts as historical evidence. Reads go through the real /states
 * proxy handler.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import { NextRequest } from "next/server"
import * as React from "react"

import { RemediatedAllowedAfterCell, RemediationReceipt, remediationActorText } from "@/components/lp/remediated-permission-counts"
import { allowedActionsAfterChange, describeCheckpointVersion, type CheckpointStates } from "@/lib/checkpoint-states"
import { normalizeLPResponse } from "@/lib/lp-normalize"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://backend.example" }))

const REMOVED = ["dynamodb:DeleteItem", "dynamodb:PutItem", "s3:DeleteObject", "s3:PutObject", "sqs:DeleteQueue"]

const AFTER = {
  "fixture-web-app": { Version: "2012-10-17", Statement: [
    { Effect: "Allow", Action: ["dynamodb:GetItem", "dynamodb:Query", "kms:Decrypt", "s3:GetObject", "s3:ListBucket", "sqs:ReceiveMessage", "sqs:SendMessage"], Resource: "*" },
    { Effect: "Deny", Action: "iam:*", Resource: "*" },
  ] },
}

function states(overrides: Partial<CheckpointStates> = {}): CheckpointStates {
  return {
    snapshot_id: "IAMRole-fixture-web-role-aaaa1111", source: "lifecycle_checkpoint", grants_no_authority: true,
    scope: { tenant_id: "fixture-webshop", account_id: "111111111111", resource_arn: "arn:aws:iam::111111111111:role/fixture-web-role" },
    checkpoint: { status: "CREATED", created_at: null, s3_key: null, s3_version_id_observed: "v1", s3_version_pinned: false, before_state_source: "s3_object" },
    operation: { operation_id: "op-a", state: "VERIFIED", record_version: 2, pre_image_hash: "a", post_image_hash: "b", removed_actions: REMOVED },
    integrity: "VERIFIED",
    before: { verified: true, reason: null, policy_set_hash_checkpoint: "a", policy_set_hash_recomputed: "a", inline_policies: {}, attached_managed_policy_arns: [] },
    after: { verified: true, reason: null, derivation: "x", policy_set_hash_recorded: "b", policy_set_hash_recomputed: "b", inline_policies: AFTER, deleted_inline_policies: [] },
    ...overrides,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

let calls: string[]
function installFetch(backend: (snapshot: string) => Response | Promise<Response>) {
  calls = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    const inner = url.match(/^https:\/\/backend\.example\/api\/snapshots\/([^/]+)\/states$/)
    if (inner) return backend(decodeURIComponent(inner[1]))
    const proxied = url.match(/^\/api\/proxy\/snapshots\/([^/]+)\/states$/)
    if (proxied) {
      const { GET } = await import("@/app/api/proxy/snapshots/[snapshotId]/states/route")
      return GET(new NextRequest(`https://cyntro.example${url}`), { params: Promise.resolve({ snapshotId: decodeURIComponent(proxied[1]) }) })
    }
    return json({}, 599)
  }))
}

afterEach(() => vi.unstubAllGlobals())

const LEDGER = "IAMRole-fixture-web-role-aaaa1111"
const CURRENT_STATE_CLAIMS = [/still need review/i, /active permissions/i, /in active use/i, /\d+%/, /least privilege/i, /partially fixed/i]

function receipt(props: Partial<React.ComponentProps<typeof RemediationReceipt>> = {}) {
  return <RemediationReceipt snapshotId={LEDGER} remediationSource="operation_ledger" observedInUse={4} observedTotal={12} {...props} />
}

describe("Remediation receipt", () => {
  it("says what the change did, labels the after count as derived, and the graph counts as historical", async () => {
    installFetch(() => json(states()))
    const { container } = render(receipt())
    expect(screen.getByTestId("lp-observed-in-use").textContent)
      .toBe("4 of 12 in the evidence window at the last graph sync — not a current policy count")
    expect(screen.getByTestId("lp-receipt-historical").textContent).toContain("Historical graph evidence (may predate this change)")
    await waitFor(() => expect(screen.getByTestId("lp-allowed-after-change").textContent)
      .toBe("7 configured Allow actions (derived, hash-verified)"))
    expect(screen.getByTestId("lp-receipt-removed").textContent).toBe(`5: ${REMOVED.join(", ")}`)
    const note = screen.getByTestId("lp-after-derived-note").textContent ?? ""
    expect(note).toContain("hash equals the post-image verified at apply")
    expect(note).toContain("not stored")
    expect(note).toContain("not effective authorization")
    for (const claim of CURRENT_STATE_CLAIMS) expect(container.textContent).not.toMatch(claim)
    expect(calls).toContain(`https://backend.example/api/snapshots/${LEDGER}/states`)
  })

  it("says unknown, with the reason, when the after state does not verify, and makes no derived claim", async () => {
    // Documents present but unverified: only `verified` may decide, never their presence.
    installFetch(() => json(states({ integrity: "BEFORE_ONLY", after: { ...states().after, verified: false, reason: "AFTER_HASH_MISMATCH" } })))
    render(receipt())
    await waitFor(() => expect(screen.getByTestId("lp-allowed-after-change").textContent)
      .toBe("unknown — the derived after state does not hash to the post-image verified at apply"))
    expect(screen.getByTestId("lp-receipt-removed").textContent).toBe(`5: ${REMOVED.join(", ")}`)
    expect(screen.queryByTestId("lp-after-derived-note")).toBeNull()
  })

  it("says unknown with the typed refusal when the saved state cannot be read", async () => {
    installFetch(() => json({ detail: { code: "SNAPSHOT_STATE_UNATTRIBUTED", message: "No recorded change." } }, 409))
    render(receipt())
    await waitFor(() => expect(screen.getByTestId("lp-allowed-after-change").textContent)
      .toBe("unknown — SNAPSHOT_STATE_UNATTRIBUTED: No recorded change."))
    expect(screen.getByTestId("lp-receipt-removed").textContent).toBe("unknown — SNAPSHOT_STATE_UNATTRIBUTED: No recorded change.")
  })

  it("never derives anything for a graph-remediated row, and reads nothing", async () => {
    installFetch(() => json(states()))
    const { container } = render(receipt({ snapshotId: "IAMRole-legacy-1a2b3c4d", remediationSource: null, observedInUse: null, observedTotal: null }))
    expect(screen.getByTestId("lp-allowed-after-change").textContent).toBe("unknown — no recorded after state")
    expect(screen.getByTestId("lp-receipt-removed").textContent).toBe("not recorded")
    expect(screen.getByTestId("lp-observed-in-use").textContent).toBe("not measured")
    for (const claim of CURRENT_STATE_CLAIMS) expect(container.textContent).not.toMatch(claim)
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(calls).toEqual([])
  })

  it("does not show one snapshot's late answer for another", async () => {
    let releaseA!: () => void
    const aHeld = new Promise<void>(resolve => { releaseA = resolve })
    installFetch(async snapshot => {
      if (snapshot.endsWith("aaaa1111")) {
        await aHeld
        return json(states({ snapshot_id: snapshot, after: { ...states().after, inline_policies: { p: { Statement: [{ Effect: "Allow", Action: ["a:One"] }] } } } }))
      }
      // The real route answers for the snapshot it was ASKED about, so the double must too:
      // the guard refuses a 200 whose snapshot_id is not the requested one, which is the same
      // cross-snapshot confusion this test exists to catch, enforced one layer earlier.
      return json(states({ snapshot_id: snapshot }))
    })
    const { rerender } = render(receipt())
    rerender(receipt({ snapshotId: "IAMRole-fixture-web-role-bbbb2222" }))
    await waitFor(() => expect(screen.getByTestId("lp-allowed-after-change").textContent).toBe("7 configured Allow actions (derived, hash-verified)"))
    await act(async () => { releaseA(); await aHeld; await new Promise(r => setTimeout(r, 20)) })
    expect(screen.getByTestId("lp-allowed-after-change").textContent).toBe("7 configured Allow actions (derived, hash-verified)")
  })
})

describe("switching rows", () => {
  it("never shows the previous snapshot's answer while the next one is still being read", async () => {
    let releaseB!: () => void
    const bHeld = new Promise<void>(resolve => { releaseB = resolve })
    installFetch(async snapshot => {
      if (snapshot.endsWith("bbbb2222")) {
        await bHeld
        return json(states({ snapshot_id: snapshot, after: { ...states().after, inline_policies: { p: { Statement: [{ Effect: "Allow", Action: ["a:One"] }] } } } }))
      }
      // As above: answer for the requested snapshot, so the race control tests the race and not
      // the body-identity guard.
      return json(states({ snapshot_id: snapshot }))
    })
    const { rerender } = render(receipt())
    await waitFor(() => expect(screen.getByTestId("lp-allowed-after-change").textContent).toBe("7 configured Allow actions (derived, hash-verified)"))
    rerender(receipt({ snapshotId: "IAMRole-fixture-web-role-bbbb2222" }))
    expect(screen.getByTestId("lp-allowed-after-change").textContent).toBe("reading the saved checkpoint…")
    await act(async () => { releaseB(); await bHeld; await new Promise(r => setTimeout(r, 20)) })
    expect(screen.getByTestId("lp-allowed-after-change").textContent).toBe("1 configured Allow actions (derived, hash-verified)")
  })
})

describe("Remediated row: allowed-after cell", () => {
  it("shows the derived count for a verified ledger change", async () => {
    installFetch(() => json(states()))
    render(<RemediatedAllowedAfterCell snapshotId={LEDGER} remediationSource="operation_ledger" />)
    await waitFor(() => expect(screen.getByTestId("lp-row-allowed-after").textContent).toBe("7 allowed (derived)"))
  })

  it("is unknown when the after state does not verify", async () => {
    installFetch(() => json(states({ after: { ...states().after, verified: false, reason: "AFTER_HASH_MISMATCH" } })))
    render(<RemediatedAllowedAfterCell snapshotId={LEDGER} remediationSource="operation_ledger" />)
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })
    expect(calls.length).toBeGreaterThan(0)
    expect(screen.getByTestId("lp-row-allowed-after").textContent).toBe("unknown")
  })

  it("is unknown for a graph-remediated row and reads nothing", async () => {
    installFetch(() => json(states()))
    render(<RemediatedAllowedAfterCell snapshotId="IAMRole-legacy-1a2b3c4d" remediationSource={null} />)
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(screen.getByTestId("lp-row-allowed-after").textContent).toBe("unknown")
    expect(calls).toEqual([])
  })
})

describe("the saved checkpoint's S3 version", () => {
  it("is described as observed on the read, never as a pinned version", () => {
    const text = describeCheckpointVersion(states())
    expect(text).toBe("S3 version observed on this read: v1 (not pinned; trusted through the hashes)")
    expect(describeCheckpointVersion(states({ checkpoint: { ...states().checkpoint, before_state_source: "checkpoint_row", s3_version_id_observed: null } })))
      .toBe("before state stored on the checkpoint row")
  })
})

describe("allowed actions from a saved after state", () => {
  it("counts distinct Allow actions and ignores Deny", () => {
    expect(allowedActionsAfterChange(states())).toHaveLength(7)
  })

  it("is null for anything but a verified after state", () => {
    expect(allowedActionsAfterChange(states({ after: { ...states().after, verified: false } }))).toBeNull()
    expect(allowedActionsAfterChange(states({ after: { ...states().after, inline_policies: null } }))).toBeNull()
  })
})

describe("who a remediated change is attributed to", () => {
  it("names the recorded operator with History's own self-attested qualifier, never a stronger claim", () => {
    expect(remediationActorText({ remediatedBy: "Fixture Operator", remediatedByVerified: false }))
      .toBe("Fixture Operator (self-attested, not verified)")
  })

  it("says not recorded when no actor was recorded, instead of inventing one", () => {
    expect(remediationActorText({ remediatedBy: null, remediatedByVerified: null })).toBe("not recorded")
    expect(remediationActorText({ remediatedBy: "   " })).toBe("not recorded")
  })

  it("shows a verified identity as it was recorded", () => {
    expect(remediationActorText({ remediatedBy: "alice@example.test", remediatedByVerified: true })).toBe("alice@example.test")
  })
})

describe("LP normalization of the ledger overlay fields", () => {
  it("keeps the remediation source and operation id the backend sent, and nothing else", () => {
    const out = normalizeLPResponse({ resources: [
      { resourceName: "a", resourceType: "IAMRole", remediationSource: "operation_ledger", remediationOperationId: "op-1",
        remediatedBy: "Fixture Operator", remediatedByMethod: "SELF_ATTESTED", remediatedByVerified: false },
      { resourceName: "b", resourceType: "IAMRole", remediationSource: 7, remediatedByMethod: 3, remediatedByVerified: "false" },
    ] }) as { resources: Array<{ remediationSource?: string | null; remediationOperationId?: string | null;
      remediatedBy?: string | null; remediatedByMethod?: string | null; remediatedByVerified?: boolean | null }> }
    expect(out.resources[0].remediationSource).toBe("operation_ledger")
    expect(out.resources[0].remediationOperationId).toBe("op-1")
    expect(out.resources[0].remediatedBy).toBe("Fixture Operator")
    expect(out.resources[0].remediatedByMethod).toBe("SELF_ATTESTED")
    expect(out.resources[0].remediatedByVerified).toBe(false)
    expect(out.resources[1].remediationSource).toBeNull()
    // A string "false" is not a verification fact, and a number is not a method.
    expect(out.resources[1].remediatedByVerified).toBeNull()
    expect(out.resources[1].remediatedByMethod).toBeNull()
  })
})
