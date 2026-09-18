/// <reference types="vitest/globals" />
/**
 * MOUNTED: the real LeastPrivilegeTab -> the Remediated row's actual Details
 * control -> the rendered RemediationReceipt.
 *
 * WHAT IS REAL. The tab, the row, `inspectableCheckpoint`,
 * `useSavedCheckpointStates`, `fetchCheckpointStates`, `changeFacts` and
 * `allowedActionsAfterChange` all run as written -- the seven configured Allow
 * actions are DERIVED from the saved after-state documents by the product and
 * gated on its own `after.verified`, not supplied as a number.
 *
 * WHAT IS FAKED. The external fetch boundary only. The `/snapshots/{id}/states`
 * body is the producer's own shape, carrying the values the independent named
 * MEMORY QA measured on the fixture pair: snapshot
 * IAMRole-fixture-web-role-c35b9c6a, five removed actions, twelve-to-seven, and
 * four historically observed actions in the graph's evidence window.
 *
 * THREE DISTINCT FACTS, deliberately not conflated:
 *   removed        5, recorded on the operation
 *   allowed after  7, derived from the checkpoint and hash-verified
 *   observed use   4 of 12, the graph's historical window -- NOT current state
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"

import LeastPrivilegeTab from "@/components/LeastPrivilegeTab"
import { AccountScopeProvider } from "@/lib/account-scope-context"
import bundle from "./__fixtures__/lp-issues-readiness.json"

vi.mock("next/navigation", () => ({
  usePathname: () => "/least-privilege",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(
    "customer_id=fixture-webshop&account_id=111111111111&system=fixture-shop",
  ),
}))

const ROLE = "fixture-web-role"
const SYSTEM = "fixture-shop"
const SNAPSHOT = "IAMRole-fixture-web-role-c35b9c6a"
const REMOVED = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query",
                 "sqs:ReceiveMessage", "sqs:SendMessage"]
const KEPT = ["iam:PassRole", "kms:Decrypt", "kms:Encrypt",
              "s3:DeleteObject", "s3:GetObject", "s3:ListBucket", "s3:PutObject"]

/** `states` behaviour for the control in hand. */
let statesMode: "verified" | "unavailable" | "integrity_failed" | "not_verified" = "verified"

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status,
           json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response
}

/**
 * The producer's own `/snapshots/{id}/states` shape, every declared field of
 * `CheckpointStates` (lib/checkpoint-states.ts) populated. The product refused
 * an approximation of it -- "The saved state response was not in the expected
 * form" -- which is why this is the full declared type and not a sketch.
 */
function statesBody() {
  const verified = statesMode === "verified"
  return {
    snapshot_id: SNAPSHOT,
    source: "lifecycle_checkpoint",
    grants_no_authority: true,
    scope: { tenant_id: "fixture-webshop", account_id: "111111111111",
             resource_arn: `arn:aws:iam::111111111111:role/${ROLE}` },
    checkpoint: {
      status: "CREATED", created_at: "2026-09-18T12:29:20.957852+00:00",
      s3_key: `checkpoints/${SNAPSHOT}.json`, s3_version_id_observed: null,
      s3_version_pinned: false, before_state_source: "checkpoint_row",
    },
    operation: {
      operation_id: "a878cbe7-35f1-46ab-8461-c81f9e584261", state: "VERIFIED",
      record_version: 2,
      pre_image_hash: "4838dab19ec9c2b026aa1277be68115107e121d4835524962d578448180e5eee",
      post_image_hash: "8ce7d30f0a3a8c4b16287c913a434747f047494ce783d5c4d9df47fd5fab7c8c",
      removed_actions: REMOVED,
    },
    integrity: verified ? "VERIFIED" : "UNVERIFIABLE",
    before: {
      verified: true, reason: null,
      policy_set_hash_checkpoint: "4838dab19ec9c2b026aa1277be68115107e121d4835524962d578448180e5eee",
      policy_set_hash_recomputed: "4838dab19ec9c2b026aa1277be68115107e121d4835524962d578448180e5eee",
      inline_policies: { "fixture-web-app": { Version: "2012-10-17", Statement: [
        { Effect: "Allow", Resource: "*", Action: [...REMOVED, ...KEPT].sort() }] } },
      attached_managed_policy_arns: [],
    },
    after: verified
      ? {
          verified: true, reason: null, derivation: "before_minus_removed_actions",
          policy_set_hash_recorded: "8ce7d30f0a3a8c4b16287c913a434747f047494ce783d5c4d9df47fd5fab7c8c",
          policy_set_hash_recomputed: "8ce7d30f0a3a8c4b16287c913a434747f047494ce783d5c4d9df47fd5fab7c8c",
          inline_policies: { "fixture-web-app": { Version: "2012-10-17", Statement: [
            { Effect: "Allow", Resource: "*", Action: [...KEPT] }] } },
          deleted_inline_policies: [],
        }
      : {
          // present but NOT verified: a derivation that does not hash-match is
          // never a count, per allowedActionsAfterChange
          verified: false, reason: "AFTER_HASH_MISMATCH",
          derivation: "before_minus_removed_actions",
          policy_set_hash_recorded: "8ce7d30f0a3a8c4b16287c913a434747f047494ce783d5c4d9df47fd5fab7c8c",
          policy_set_hash_recomputed: "0".repeat(64),
          inline_policies: null, deleted_inline_policies: null,
        },
  }
}

/** The Remediated row the tab needs, from the captured producer payload. */
function issuesWithRemediatedRow() {
  const payload = structuredClone(bundle.issues) as any
  const probed = new Date(Date.now())
  payload.readiness.probed_at = probed.toISOString()
  payload.readiness.expires_at = new Date(probed.getTime() + 30_000).toISOString()
  const row = payload.resources.find((r: any) => r.resourceName === ROLE)
  // exactly what the backend marks after a recorded ledger change
  row.remediatedAt = "2026-09-18T12:29:20.958262+00:00"
  row.remediatedBy = "Claude Permissions QA (session ecc5e994)"
  row.snapshotId = SNAPSHOT
  row.remediationSource = "operation_ledger"
  row.rollbackAvailable = true
  return payload
}

beforeEach(() => {
  statesMode = "verified"
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input)
    if (url.includes("/least-privilege/issues")) return json(issuesWithRemediatedRow())
    if (url.includes("/snapshots/") && url.includes("/states")) {
      if (statesMode === "unavailable") return json({ detail: "not found" }, 404)
      if (statesMode === "integrity_failed") return json({ detail: "integrity check failed" }, 409)
      return json(statesBody())
    }
    if (url.includes("/gap-analysis")) return json(bundle.gapAnalysis)
    return json({})
  }))
})

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

async function openRemediatedDetails() {
  render(
    <AccountScopeProvider>
      <LeastPrivilegeTab systemName={SYSTEM} />
    </AccountScopeProvider>,
  )
  // The tab buttons carry their label in child nodes, so they have no
  // accessible name; match on text and THROW when absent so waitFor retries.
  const remediatedTab = await waitFor(() => {
    const found = screen.getAllByRole("button")
      .find(b => /Remediated/.test(b.textContent || ""))
    if (!found) throw new Error("no Remediated tab yet")
    return found
  }, { timeout: 5000 })
  await act(async () => { fireEvent.click(remediatedTab) })
  const details = await waitFor(
    () => screen.getAllByRole("button", { name: /^Details$/ })[0], { timeout: 5000 },
  )
  await act(async () => { fireEvent.click(details) })
  await waitFor(() => expect(document.body.textContent).toContain("Remediation Receipt"),
    { timeout: 5000 })
}

describe("mounted Remediated receipt", () => {
  it("renders five recorded removals and seven derived, hash-verified allowed actions", async () => {
    await openRemediatedDetails()
    await waitFor(() => {
      expect(document.body.textContent).toContain("configured Allow actions (derived, hash-verified)")
    }, { timeout: 5000 })
    const text = document.body.textContent ?? ""

    // the removals are the RECORDED five, named
    expect(text).toContain("5: " + REMOVED.join(", "))
    // the allowed count is DERIVED by the product from the after documents
    expect(text).toContain("7 configured Allow actions (derived, hash-verified)")
    // the exact snapshot
    expect(text).toContain(SNAPSHOT)
  })

  it("qualifies the four historical observed actions as a separate, non-current fact", async () => {
    await openRemediatedDetails()
    const text = document.body.textContent ?? ""
    // distinct from the seven: an evidence-window count that predates the change
    expect(text).toMatch(/4 of 12/)
    expect(text).toMatch(/not a current policy count/i)
    // and the removed copy this receipt replaced must not be back
    expect(text).not.toContain("permissions in active use")
    expect(text).not.toContain("still need review")
  })

  it.each([
    ["unavailable", "unavailable"],
    ["integrity-failed", "integrity_failed"],
  ])("reports unknown rather than a fabricated zero when the saved state is %s", async (_label, mode) => {
    statesMode = mode as typeof statesMode
    await openRemediatedDetails()
    await waitFor(() => expect(document.body.textContent).toMatch(/unknown/i), { timeout: 5000 })
    const text = document.body.textContent ?? ""

    expect(text).not.toContain("configured Allow actions (derived, hash-verified)")
    // never a zero standing in for an unread state, and never current use
    expect(text).not.toMatch(/\b0 allowed\b/)
    expect(text).not.toContain("permissions in active use")
  })

  it("reports unknown when the after state is present but not verified", async () => {
    statesMode = "not_verified"
    await openRemediatedDetails()
    await waitFor(() => expect(document.body.textContent).toMatch(/unknown/i), { timeout: 5000 })
    // the five removals are still recorded on the operation even when the
    // after state cannot be derived -- the two facts are independent
    expect(document.body.textContent).toContain("5: " + REMOVED.join(", "))
    expect(document.body.textContent).not.toContain("(derived, hash-verified)")
  })
})
