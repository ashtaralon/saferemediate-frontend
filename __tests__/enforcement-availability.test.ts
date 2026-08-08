import { describe, expect, it } from "vitest"

import {
  enforcementAvailability,
  isMutationDisabledError,
} from "@/components/fixes/enforcement-availability"

describe("enforcementAvailability", () => {
  it("is preview (fail-closed) when the flag is off", () => {
    expect(enforcementAvailability({ s3_bucket_policy_enforcement: false })).toBe("preview")
  })

  it("is preview when the feature state is missing entirely", () => {
    // Meta unreachable, old backend without the features field, or an
    // empty object — a mutation surface never fails open on missing info.
    expect(enforcementAvailability(null)).toBe("preview")
    expect(enforcementAvailability(undefined)).toBe("preview")
    expect(enforcementAvailability({})).toBe("preview")
  })

  it("is enabled only on an explicit true", () => {
    expect(enforcementAvailability({ s3_bucket_policy_enforcement: true })).toBe("enabled")
    // Truthy-but-not-true never enables (defensive against a lossy relay).
    expect(
      enforcementAvailability({ s3_bucket_policy_enforcement: "true" as unknown as boolean }),
    ).toBe("preview")
  })
})

describe("isMutationDisabledError", () => {
  it("recognizes the enforcement gate's 503 detail", () => {
    expect(
      isMutationDisabledError(
        "S3 bucket-policy enforcement is disabled. It stays off until " +
          "CYNTRO_S3_BUCKET_POLICY_ENFORCEMENT_ENABLED=true — independently of " +
          "the S3 private-path route mutations flag — after multi-VPC coverage, " +
          "principal-ARN resolution, and scheduled reconciliation are verified in the deploy.",
      ),
    ).toBe(true)
  })

  it("recognizes the transport gate's 503 detail", () => {
    expect(
      isMutationDisabledError(
        "S3 private-path AWS mutations are disabled. Enable them only after " +
          "the remediation role and authenticated operator approval are configured.",
      ),
    ).toBe(true)
  })

  it("does not swallow unrelated errors", () => {
    expect(isMutationDisabledError("Operation is SIMULATED, not approved")).toBe(false)
    expect(isMutationDisabledError("Confirmation must exactly match: ENFORCE data vpce-1")).toBe(false)
    expect(isMutationDisabledError("Resource is locked by another change")).toBe(false)
    expect(isMutationDisabledError(null)).toBe(false)
    expect(isMutationDisabledError(undefined)).toBe(false)
  })
})
