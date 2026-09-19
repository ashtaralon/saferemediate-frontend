// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest"

import { assertDeploymentConfig, deploymentConfigProblems } from "@/lib/server/deployment-config"

// Distinctive synthetic values, so a leak into any message is detectable.
const PASSWORD = "cfgtest-site-password-VALUE"
const TOKEN = "cfgtest-service-token-VALUE"
const BACKEND = "https://backend.cfgtest.invalid"

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
})

describe("deployment configuration", () => {
  it("hosted (the default) requires SITE_PASSWORD, and nothing else", () => {
    expect(deploymentConfigProblems({})).toEqual([
      "SITE_PASSWORD is not set: the hosted site gate cannot sign anyone in",
    ])
    expect(deploymentConfigProblems({ CYNTRO_DEPLOYMENT_MODE: "HOSTED", SITE_PASSWORD: PASSWORD })).toEqual([])
    // An unset service token is the documented pre-rollout state in hosted mode, not an error.
    expect(deploymentConfigProblems({ SITE_PASSWORD: PASSWORD })).toEqual([])
  })

  it("hosted refuses an explicit sealing key too short to be used", () => {
    const problems = deploymentConfigProblems({ SITE_PASSWORD: PASSWORD, CYNTRO_SITE_SESSION_SECRET: "short" })
    expect(problems).toEqual([
      "CYNTRO_SITE_SESSION_SECRET is shorter than 32 characters and would be silently ignored",
    ])
  })

  it("customer-resident requires the service token and its own backend, and no site password", () => {
    expect(deploymentConfigProblems({ CYNTRO_DEPLOYMENT_MODE: "CUSTOMER_RESIDENT" })).toEqual([
      "CYNTRO_SERVICE_TOKEN is not set: backend requests would be refused by its auth boundary",
      "BACKEND_URL_OVERRIDE is not set: a customer install must name its own backend",
    ])
    expect(
      deploymentConfigProblems({
        CYNTRO_DEPLOYMENT_MODE: "CUSTOMER_RESIDENT",
        CYNTRO_SERVICE_TOKEN: TOKEN,
        BACKEND_URL_OVERRIDE: BACKEND,
      }),
    ).toEqual([])
    expect(
      deploymentConfigProblems({
        CYNTRO_DEPLOYMENT_MODE: "CUSTOMER_RESIDENT",
        CYNTRO_SERVICE_TOKEN: "   ",
        BACKEND_URL_OVERRIDE: BACKEND,
      }),
    ).toHaveLength(1)
  })

  it("refuses an unrecognised mode, which middleware would otherwise treat as hosted", () => {
    for (const mode of ["CUSTOMER-RESIDENT", "customer_resident", " CUSTOMER_RESIDENT"]) {
      expect(deploymentConfigProblems({ CYNTRO_DEPLOYMENT_MODE: mode, SITE_PASSWORD: PASSWORD })).toEqual([
        "CYNTRO_DEPLOYMENT_MODE has an unrecognised value: expected HOSTED or CUSTOMER_RESIDENT",
      ])
    }
  })

  it("throws naming every problem at once, and quotes no value", () => {
    const env = { CYNTRO_DEPLOYMENT_MODE: "CUSTOMER_RESIDENT", SITE_PASSWORD: PASSWORD }
    expect(() => assertDeploymentConfig(env)).toThrow(/CYNTRO_SERVICE_TOKEN[\s\S]*BACKEND_URL_OVERRIDE/)
    try {
      assertDeploymentConfig({ SITE_PASSWORD: PASSWORD, CYNTRO_SITE_SESSION_SECRET: "short-VALUE-x" })
    } catch (error) {
      expect(String(error)).not.toContain("short-VALUE-x")
      expect(String(error)).not.toContain(PASSWORD)
    }
    expect(() => assertDeploymentConfig({ SITE_PASSWORD: PASSWORD })).not.toThrow()
  })

  it("instrumentation refuses to start the Node server with a required secret missing", async () => {
    const { register } = await import("@/instrumentation")
    process.env = { ...saved, NEXT_RUNTIME: "nodejs" }
    delete process.env.SITE_PASSWORD
    delete process.env.CYNTRO_DEPLOYMENT_MODE
    delete process.env.CYNTRO_SERVICE_TOKEN
    await expect(register()).rejects.toThrow("SITE_PASSWORD is not set")

    process.env.SITE_PASSWORD = PASSWORD
    await expect(register()).resolves.toBeUndefined()
  })
})
