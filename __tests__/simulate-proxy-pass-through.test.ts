/// <reference types="vitest/globals" />
/**
 * Proxy pass-through contract test for the GET sim endpoint.
 *
 * The ReplayVerifyPanel state machine's discriminator between
 * never_verified vs historical_untracked is last_verdict === null
 * vs last_verdict === "BYTE_EQUIVALENT" etc. Any silent transformation
 * in the proxy layer (null → undefined, string → Date, key rename)
 * breaks the state machine.
 *
 * This test mocks the backend response and asserts the proxy returns
 * the identical shape — same keys, same types, same null-vs-undefined,
 * same string format. One assertion: deepEqual of fixture in, fixture
 * out.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { GET } from "@/app/api/proxy/iam/shared-roles/simulate/[sim_id]/route"
import fixture from "./fixtures/replay-sim-fcfcc161d02e.json"

type FetchMock = ReturnType<typeof vi.fn>

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("GET /api/proxy/iam/shared-roles/simulate/[sim_id]", () => {
  it("passes the backend response through verbatim — no key rename, no null→undefined", async () => {
    const backendBodyText = JSON.stringify(fixture)
    ;(global.fetch as FetchMock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => backendBodyText,
    } as unknown as Response)

    const req = new NextRequest(
      "http://localhost/api/proxy/iam/shared-roles/simulate/sim-fcfcc161d02e"
    )
    const ctx = {
      params: Promise.resolve({ sim_id: "sim-fcfcc161d02e" }),
    }
    const res = await GET(req, ctx)
    const proxyText = await res.text()
    const proxied = JSON.parse(proxyText)

    // Deep-equal: every key, every value, every null preserved.
    expect(proxied).toEqual(fixture)

    // Spot-check the four replay-state fields specifically — these
    // are the discriminators the ReplayVerifyPanel state machine
    // depends on. Worth asserting their exact types survive.
    expect(proxied.replay_count).toBe(fixture.replay_count)
    expect(proxied.last_verdict).toBe(fixture.last_verdict)
    expect(proxied.last_replayed_at).toBe(fixture.last_replayed_at)
    expect(proxied.last_replay_id).toBe(fixture.last_replay_id)

    // null must stay null (not undefined, not coerced to "").
    // Use a sentinel field that's null in the fixture to assert
    // null-vs-undefined preservation. If the captured fixture has
    // all-non-null fields, this assertion is a no-op but harmless.
    for (const key of Object.keys(fixture) as Array<keyof typeof fixture>) {
      if (fixture[key] === null) {
        expect(proxied[key]).toBe(null)
        expect(proxied[key]).not.toBe(undefined)
      }
    }
  })
})
