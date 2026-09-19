import { expect, test, type Page } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import { ESTATE_URL, routeSnapshot, v11IdentityAccessSnapshot } from "./topology-fixture"

/**
 * Reduced motion on the Estate map, deterministically.
 *
 * The flow overlay animates authoritative observed traffic with SMIL
 * (<animate> on the running track, the packet and attack-path dashes) and the
 * legend with a CSS keyframe; the on-demand panels open with CSS animations.
 * SMIL is not affected by CSS media queries, so "the app honours
 * prefers-reduced-motion" has to be measured on the page, not assumed.
 *
 * The no-preference test is the positive control: the same probe on the same
 * fixture must SEE motion, or a zero under reduce would prove nothing.
 */

const MOTION_PROBE = `(() => {
  const overlay = document.querySelector('[data-testid="topology-flow-overlay"]')
  const smilElements = overlay ? Array.from(overlay.querySelectorAll('animate, animateMotion, animateTransform')) : []
  // Motion = a SMIL element that repeats or takes measurable time. A frozen,
  // instant positioning (dur <= 10ms, no repeat) places a marker without moving it.
  const smil = overlay ? smilElements.filter(el => el.getAttribute('repeatCount') === 'indefinite' || parseFloat(el.getAttribute('dur') || '0') > 0.01).length : -1
  const staticMarkers = smilElements.filter(el => el.getAttribute('data-flow-marker-static') === 'true').length
  const runningTracks = document.querySelectorAll('[data-testid="topology-flow-running-track"]').length
  // Colour and opacity transitions (a tab's hover fade) are not motion.
  // Keyframe animations, and transitions of geometry, are.
  const MOVING = /^(transform|translate|scale|rotate|left|top|right|bottom|inset|width|height|margin|padding|offset)/
  const running = document.getAnimations()
    .filter(a => a.playState === 'running')
    .filter(a => a.constructor.name !== 'CSSTransition' || MOVING.test(a.transitionProperty || ''))
    .map(a => {
      const target = a.effect && a.effect.target
      const owner = target && target.closest ? target.closest('[data-testid]') : null
      const timing = a.effect ? a.effect.getComputedTiming() : null
      return {
        owner: owner ? owner.getAttribute('data-testid') : (target ? target.tagName.toLowerCase() : null),
        name: a.animationName || a.transitionProperty || a.constructor.name,
        duration: timing ? Number(timing.duration) : null,
        iterations: timing ? String(timing.iterations) : null,
      }
    })
  const overlayFlag = overlay ? overlay.getAttribute('data-reduced-motion') : null
  return { reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, overlay: Boolean(overlay), overlayFlag, smil, staticMarkers, runningTracks, running }
})()`

interface MotionProbe {
  reduce: boolean
  overlay: boolean
  overlayFlag: string | null
  smil: number
  staticMarkers: number
  runningTracks: number
  running: Array<{ owner: string | null; name: string; duration: number | null; iterations: string | null }>
}

async function openDependenciesMap(page: Page) {
  await routeSnapshot(page, v11IdentityAccessSnapshot().snapshot as never)
  for (const path of ["inspector", "operational-map", "decision-coverage"]) {
    await page.route(`**/api/proxy/${path}/**`, route =>
      route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"fixture only"}' }),
    )
  }
  await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  await page.getByTestId("topology-estate-view-map").click()
  const deps = page.getByTestId("topology-flow-mode-toggle").getByRole("button", { name: "Dependencies" }).first()
  await expect(deps).toBeVisible()
  await deps.click()
  await expect(deps).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByTestId("topology-flow-overlay").first()).toBeVisible()
}

async function openIdentityPanel(page: Page) {
  const trigger = page.getByTestId("topology-identity-access-trigger").first()
  await trigger.focus()
  await page.keyboard.press("Enter")
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByTestId("topology-identity-access-panel")).toBeVisible()
}

test("no-preference control: the probe sees authoritative flow motion and panel animation", async ({ context, page }) => {
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await openDependenciesMap(page)
  const map = (await page.evaluate(MOTION_PROBE)) as MotionProbe
  expect(map.reduce).toBe(false)
  expect(map.overlayFlag).toBe("false")
  expect(map.smil, "the fixture's authoritative flows must animate without a reduced-motion preference").toBeGreaterThan(0)
  expect(map.staticMarkers).toBe(0)
  await openIdentityPanel(page)
  // The panel's open animation is short: measure it while it is still running.
  const opened = (await page.evaluate(MOTION_PROBE)) as MotionProbe
  expect(
    map.running.length + opened.running.length,
    "no running CSS animation was observable without a reduced-motion preference",
  ).toBeGreaterThan(0)
})

test("reduced motion: no flow, legend or panel animation on the Estate map", async ({ context, page }) => {
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await openDependenciesMap(page)
  const map = (await page.evaluate(MOTION_PROBE)) as MotionProbe
  expect(map.reduce).toBe(true)
  expect(map.overlayFlag).toBe("true")
  expect(map.smil, "SMIL flow animations rendered despite prefers-reduced-motion").toBe(0)
  // Evidence is frozen, not removed: the authoritative tracks and their
  // direction markers are still drawn, just without motion.
  expect(map.runningTracks, "authoritative tracks disappeared under reduced motion").toBeGreaterThan(0)
  expect(map.staticMarkers, "direction markers disappeared under reduced motion").toBeGreaterThan(0)
  expect(map.running, "CSS animations running on the map despite prefers-reduced-motion").toEqual([])
  await openIdentityPanel(page)
  const opened = (await page.evaluate(MOTION_PROBE)) as MotionProbe
  expect(opened.running, "the Identity & access panel animated despite prefers-reduced-motion").toEqual([])
  // Keyboard close still returns focus to the trigger.
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("topology-identity-access-panel")).toBeHidden()
  await expect(page.getByTestId("topology-identity-access-trigger").first()).toBeFocused()
})
