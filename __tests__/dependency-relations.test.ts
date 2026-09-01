/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest"

import { RELATION_REGISTRY, resolveRelation } from "@/lib/dependency-relations"

describe("dependency relation registry (§5.4)", () => {
  it("reads one stored edge from both sides without reversing it", () => {
    // The workplan's own worked example: "Protected by sg-123" from a workload,
    // "Protects 17 resources" from the security group.
    const fromWorkload = resolveRelation("SECURED_BY", "DOWNSTREAM")
    expect(fromWorkload.label).toBe("protected by")
    expect(fromWorkload.perspective).toBe("USES")

    const fromSecurityGroup = resolveRelation("SECURED_BY", "UPSTREAM")
    expect(fromSecurityGroup.label).toBe("protects")
    expect(fromSecurityGroup.perspective).toBe("USED_BY")
  })

  it("keeps a provider-source relationship the right way round", () => {
    // TRUSTS points provider→consumer, so DOWNSTREAM means the selected role is
    // the thing being assumed — it is used by the principal it trusts.
    expect(resolveRelation("TRUSTS", "DOWNSTREAM")).toMatchObject({
      label: "trusts",
      perspective: "USED_BY",
    })
    expect(resolveRelation("TRUSTS", "UPSTREAM")).toMatchObject({
      label: "trusted by",
      perspective: "USES",
    })
  })

  it("treats an observed flow as a peer rather than inventing a provider", () => {
    for (const direction of ["DOWNSTREAM", "UPSTREAM"]) {
      const resolved = resolveRelation("ACTUAL_TRAFFIC", direction)
      expect(resolved.perspective).toBe("PEER")
      expect(resolved.label).toBe("observed communicating with")
    }
  })

  it("collapses legacy security-group spellings onto the canonical name", () => {
    for (const alias of ["HAS_SECURITY_GROUP", "USES_SECURITY_GROUP"]) {
      const resolved = resolveRelation(alias, "DOWNSTREAM")
      expect(resolved.canonicalRelationship).toBe("SECURED_BY")
      expect(resolved.rawRelationship).toBe(alias)
      expect(resolved.label).toBe("protected by")
    }
  })

  it("never invents wording for an unregistered relationship (§11.1)", () => {
    const resolved = resolveRelation("ResourcePolicyGrant", "UPSTREAM")
    expect(resolved.registered).toBe(false)
    expect(resolved.label).toBe("ResourcePolicyGrant")
    expect(resolved.mechanism).toBeNull()
    expect(resolved.capability).toBeNull()
  })

  it("marks §6.3-banned generic relations instead of dressing them up", () => {
    expect(resolveRelation("ASSOCIATED_WITH", "DOWNSTREAM").generic).toBe(true)
    expect(resolveRelation("SECURED_BY", "DOWNSTREAM").generic).toBe(false)
  })

  it("handles a missing relationship or direction without throwing", () => {
    const resolved = resolveRelation(null, null)
    expect(resolved.registered).toBe(false)
    expect(resolved.label).toBe("unnamed relationship")
  })

  it("registers every relationship the backend profile can return", () => {
    // Mirrors api/operational_map.py _PROFILE_ALL_RELATIONSHIPS plus the two
    // synthesized by _PROFILE_ROLE_BRIDGE_QUERY. An unregistered one renders
    // untyped, so this list drifting is a product regression.
    const backendAllowList = [
      "ACTUAL_API_CALL", "ACTUAL_S3_ACCESS", "ACCESSES_RESOURCE", "ACTUAL_TRAFFIC", "CALLS",
      "RUNTIME_CALLS", "ASSUMED_ROLE_OBSERVED", "INVOKED", "QUERIED", "PUBLISHED_TO", "CONSUMED_FROM",
      "USES_ROLE", "ASSUMES_ROLE", "HAS_ROLE", "HAS_POLICY", "ATTACHED_POLICY", "USES_POLICY",
      "GRANTS_ACCESS_TO", "TRUSTS", "CAN_ASSUME",
      "HAS_INSTANCE_PROFILE", "SECURED_BY", "MEMBER_OF", "IN_SUBNET", "IN_VPC", "HAS_SECURITY_GROUP",
      "ATTACHED_TO", "PROTECTS", "ENCRYPTED_BY", "ENCRYPTED_WITH", "USES_KMS_KEY_FOR_ENCRYPTION",
      "ROUTES_VIA", "ASSOCIATED_WITH", "HAS_TARGET_GROUP", "TARGETS", "BEHIND_LOAD_BALANCER",
      "HAS_STAGE", "INTEGRATES_WITH", "TRIGGERS", "HAS_TRIGGER", "DELIVERS_TO", "WRITES_LOGS_TO",
      "HAS_ROUTE_TABLE", "HAS_SUBNET", "CONTAINS",
      "USES_ROLE_VIA_INSTANCE_PROFILE", "ASSIGNED_VIA_INSTANCE_PROFILE",
    ]
    expect(backendAllowList.filter(name => !RELATION_REGISTRY[name])).toEqual([])
  })

  it("lands the EC2 and IAM-role sides of the instance-profile bridge opposite", () => {
    // The bridge query hardcodes DOWNSTREAM for the EC2 side and UPSTREAM for
    // the role side, so both must resolve from the selected resource's view.
    expect(resolveRelation("USES_ROLE_VIA_INSTANCE_PROFILE", "DOWNSTREAM").perspective).toBe("USES")
    expect(resolveRelation("ASSIGNED_VIA_INSTANCE_PROFILE", "UPSTREAM").perspective).toBe("USED_BY")
  })

  it("gives every registered relation both labels and a mechanism", () => {
    for (const [name, definition] of Object.entries(RELATION_REGISTRY)) {
      expect(definition.forward, name).toBeTruthy()
      expect(definition.inverse, name).toBeTruthy()
      expect(definition.mechanism, name).toMatch(/^M\d\d$/)
      // §6.3 bans generic wording in the primary UI; only relations explicitly
      // flagged `generic` are allowed to carry it.
      if (!definition.generic) {
        expect(definition.forward.toLowerCase(), name).not.toContain("related to")
        expect(definition.forward.toLowerCase(), name).not.toContain("depends on")
      }
    }
  })
})
