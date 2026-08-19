import { describe, expect, it } from "vitest"
import { compilePathListRow } from "@/components/attack-paths-v2/compile-path-list-row"
import type {
  CrownJewelSummary,
  IdentityAttackPath,
} from "@/components/identity-attack-paths/types"

const jewel = {
  id: "arn:aws:s3:::customer-data",
  canonical_id: "arn:aws:s3:::customer-data",
  name: "customer-data",
  type: "S3Bucket",
} as unknown as CrownJewelSummary

function pathWithNodes(
  nodes: Array<{ id: string; name: string; type: string }>,
): IdentityAttackPath {
  return {
    id: "path-1",
    crown_jewel_id: jewel.id,
    nodes,
    edges: [],
  } as unknown as IdentityAttackPath
}

describe("Attack Paths route endpoints", () => {
  it("shows the workload as From when an identity wrapper precedes it", () => {
    const row = compilePathListRow(
      pathWithNodes([
        { id: "role", name: "→ checkout-role", type: "IAMRole" },
        { id: "fn", name: "checkout-writer", type: "Lambda" },
        { id: jewel.id, name: jewel.name, type: jewel.type },
      ]),
      jewel,
    )

    expect(row.start_label).toBe("checkout-writer")
    expect(row.start_type).toBe("Lambda")
    expect(row.source_label).toBe("checkout-writer")
  })

  it("keeps an identity-only source honest and removes transport arrows", () => {
    const row = compilePathListRow(
      pathWithNodes([
        { id: "role", name: "→ OrganizationAccountAccessRole", type: "IAMRole" },
        { id: jewel.id, name: jewel.name, type: jewel.type },
      ]),
      jewel,
    )

    expect(row.start_label).toBe("OrganizationAccountAccessRole")
    expect(row.start_type).toBe("IAMRole")
    expect(row.source_label).toBe("OrganizationAccountAccessRole")
  })

  it("prefers the backing IAM role over its STS transport wrapper", () => {
    const row = compilePathListRow(
      pathWithNodes([
        { id: "session", name: "→ AWSServiceRoleForConfig", type: "STSSession" },
        { id: "role", name: "AWSServiceRoleForConfig", type: "IAMRole" },
        { id: jewel.id, name: jewel.name, type: jewel.type },
      ]),
      jewel,
    )

    expect(row.start_label).toBe("AWSServiceRoleForConfig")
    expect(row.start_type).toBe("IAMRole")
  })
})
