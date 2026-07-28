"use client"

import { useEffect } from "react"
import { deploymentHasChanged } from "@/lib/deployment-version"

const CLIENT_DEPLOYMENT_VERSION =
  process.env.NEXT_PUBLIC_DEPLOYMENT_VERSION ?? "development"
const CHECK_INTERVAL_MS = 5 * 60 * 1000
const RELOAD_KEY_PREFIX = "cyntro:deployment-reload:"

type BuildVersionResponse = {
  deploymentVersion?: unknown
}

function serverVersionFrom(body: BuildVersionResponse): string | null {
  return typeof body.deploymentVersion === "string"
    ? body.deploymentVersion
    : null
}

/**
 * Keeps long-lived operator tabs on the deployed application contract.
 *
 * Vercel gives immutable JavaScript chunks long cache lifetimes. That is
 * correct for assets, but an already-open SPA can otherwise keep executing
 * an old attack-path model for days after a production release. Compare the
 * revision baked into this client bundle with a no-store runtime endpoint
 * and perform one full navigation when they differ.
 */
export function DeploymentVersionGuard() {
  useEffect(() => {
    let disposed = false
    let checking = false

    const check = async () => {
      if (disposed || checking || document.visibilityState === "hidden") return
      checking = true
      try {
        const response = await fetch(
          `/api/build-version?t=${Date.now().toString(36)}`,
          {
            cache: "no-store",
            headers: { Accept: "application/json" },
          },
        )
        if (!response.ok || disposed) return
        const body = (await response.json()) as BuildVersionResponse
        const serverVersion = serverVersionFrom(body)
        if (!deploymentHasChanged(CLIENT_DEPLOYMENT_VERSION, serverVersion)) {
          return
        }

        // Reload at most once for a given server revision. This prevents a
        // loop if an upstream cache ever serves mixed HTML/API deployments.
        const reloadKey = `${RELOAD_KEY_PREFIX}${serverVersion}`
        if (window.sessionStorage.getItem(reloadKey) === "1") return
        window.sessionStorage.setItem(reloadKey, "1")
        window.location.reload()
      } catch {
        // Version checks must never interrupt the application. A failed
        // request is retried on focus/visibility or the next interval.
      } finally {
        checking = false
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void check()
    }
    const onFocus = () => void check()

    void check()
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onFocus)

    return () => {
      disposed = true
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onFocus)
    }
  }, [])

  return null
}
