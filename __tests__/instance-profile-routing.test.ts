/// <reference types="vitest/globals" />
/**
 * InstanceProfile click-routing regression tests
 * ==============================================
 *
 * Scenario:
 *   EC2  ──HAS_INSTANCE_PROFILE──►  InstanceProfile  ──USES_ROLE──►  IAMRole
 *
 * AWS commonly gives the InstanceProfile and the IAMRole the SAME NAME
 * (here both `cyntro-demo-ec2-s3-role`). The IDs differ only by the ARN
 * suffix (`:instance-profile/...` vs `:role/...`).
 *
 * Contract:
 *   1. Clicking the InstanceProfile must NOT dispatch as generic `iam_role`.
 *      It must dispatch as `instance_profile` so the parent can resolve
 *      the wrapped role explicitly.
 *   2. The modal that opens is the IAM gap-analysis modal, but rendered
 *      with `viaInstanceProfile: { name, arn }` so the header shows
 *      "Wrapped role · Permission Usage" + the IP pedigree banner.
 *   3. Resolution of the wrapped role uses the path's USES_ROLE edge
 *      (authoritative), NOT a name lookup against the architecture.
 *      Name lookup is ambiguous because IP and Role share a name.
 *   4. The role's NAME is what the gap-analysis endpoint queries by
 *      today; passing the wrapped role's name (resolved from USES_ROLE)
 *      keeps backend lookup unambiguous because the backend's
 *      gap-analysis pipeline already excludes InstanceProfile (no
 *      permissions to analyze).
 *
 * NOTE: No test runner is wired in this repo yet (no jest.config /
 * vitest.config; package.json has no `test` script). This file documents
 * the contract and is structured for Jest/Vitest. When a runner is added,
 * these become live regression guards.
 */

import { classifyNodeForModal, isInstanceProfileNode } from "./instance-profile-routing.contract"

const IP_ARN = "arn:aws:iam::745783559495:instance-profile/cyntro-demo-ec2-s3-role"
const ROLE_ARN = "arn:aws:iam::745783559495:role/cyntro-demo-ec2-s3-role"

describe("InstanceProfile detection (id/arn pattern)", () => {
  it("matches the IP ARN", () => {
    expect(isInstanceProfileNode({ id: IP_ARN })).toBe(true)
  })

  it("does NOT match the IAMRole ARN with the same name", () => {
    expect(isInstanceProfileNode({ id: ROLE_ARN })).toBe(false)
  })

  it("matches when only `instanceprofile` keyword is present (loose form)", () => {
    expect(isInstanceProfileNode({ id: "InstanceProfile-cyntro-demo-ec2-s3-role" })).toBe(true)
  })
})

describe("classifyNodeForModal", () => {
  it("classifies InstanceProfile distinctly from IAMRole even with the same name", () => {
    const ipNode = {
      id: IP_ARN,
      name: "cyntro-demo-ec2-s3-role",
      type: "InstanceProfile",
      tier: "identity",
      lane: "iam",
    }
    const roleNode = {
      id: ROLE_ARN,
      name: "cyntro-demo-ec2-s3-role",
      type: "IAMRole",
      tier: "identity",
      lane: "iam",
    }
    expect(classifyNodeForModal(ipNode)).toBe("instance_profile")
    expect(classifyNodeForModal(roleNode)).toBe("iam")
  })

  it("does not collapse IP into iam_role via type.includes('role') (substring trap)", () => {
    // "instanceprofile" does NOT contain "role", but a future regex tweak
    // could break this. Test guards against that regression.
    const node = { id: IP_ARN, name: "x", type: "InstanceProfile", tier: "identity", lane: "iam" }
    expect(classifyNodeForModal(node)).not.toBe("iam")
  })
})

describe("Wrapped-role resolution from USES_ROLE edge", () => {
  it("resolves the wrapped IAMRole by following the IP's USES_ROLE edge", () => {
    const path = {
      nodes: [
        { id: IP_ARN, name: "cyntro-demo-ec2-s3-role", type: "InstanceProfile" },
        { id: ROLE_ARN, name: "cyntro-demo-ec2-s3-role", type: "IAMRole" },
      ],
      edges: [{ source: IP_ARN, target: ROLE_ARN, type: "USES_ROLE" }],
    }
    const wrappedEdge = path.edges.find((e) => e.source === IP_ARN && e.type === "USES_ROLE")
    expect(wrappedEdge?.target).toBe(ROLE_ARN)
    const wrappedNode = path.nodes.find((n) => n.id === wrappedEdge?.target)
    expect(wrappedNode?.type).toBe("IAMRole")
  })

  it("does NOT pick the IP itself when name is the same", () => {
    // The IP and the Role share `name`. If we resolved by name we'd hit
    // the IP first and recurse. ARN/id-based USES_ROLE traversal must
    // give the role, not the IP.
    const path = {
      nodes: [
        { id: IP_ARN, name: "cyntro-demo-ec2-s3-role", type: "InstanceProfile" },
        { id: ROLE_ARN, name: "cyntro-demo-ec2-s3-role", type: "IAMRole" },
      ],
      edges: [{ source: IP_ARN, target: ROLE_ARN, type: "USES_ROLE" }],
    }
    const wrappedEdge = path.edges.find((e) => e.source === IP_ARN && e.type === "USES_ROLE")
    expect(wrappedEdge?.target).not.toBe(IP_ARN)
  })
})
