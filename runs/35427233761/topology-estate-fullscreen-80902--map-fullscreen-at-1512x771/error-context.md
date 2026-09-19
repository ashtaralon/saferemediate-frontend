# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-fullscreen-stacking-fixture.spec.ts >> external-destinations panel is topmost inside map fullscreen at 1512x771
- Location: tests/integration/topology-estate-fullscreen-stacking-fixture.spec.ts:136:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('topology-estate-view-map')
Expected: visible
Timeout: 60000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 60000ms
  - waiting for getByTestId('topology-estate-view-map')

```

```yaml
- heading "CYNTRO" [level=1]
- paragraph: Cloud Security Platform
- textbox "Enter password"
- button "Enter" [disabled]
- region "Notifications (F8)":
  - list
- alert
```

# Test source

```ts
  48  |  *  Reported together on purpose: a bare "covered" tells you the panel lost
  49  |  *  without saying to what or by how much, and that costs a CI round trip to
  50  |  *  find out. `hit` names the element that won each probe. */
  51  | const STACKING_PROBE = `(() => {
  52  |   const el = document.querySelector('[data-testid="topology-external-destinations-details"]')
  53  |   if (!el) return null
  54  |   const wrapper = el.closest('[data-radix-popper-content-wrapper]')
  55  |   const fs = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
  56  |   const zOf = (n) => {
  57  |     if (!n) return null
  58  |     const v = getComputedStyle(n).zIndex
  59  |     return v === 'auto' ? null : Number(v)
  60  |   }
  61  |   let node = el
  62  |   let product = 1
  63  |   while (node && node !== document.documentElement) {
  64  |     product *= Number(getComputedStyle(node).opacity)
  65  |     node = node.parentElement
  66  |   }
  67  |   const r = el.getBoundingClientRect()
  68  |   const probes = [
  69  |     ['top', r.left + r.width * 0.5, r.top + 6],
  70  |     ['middle', r.left + r.width * 0.5, r.top + r.height * 0.5],
  71  |     ['bottom', r.left + r.width * 0.5, r.bottom - 6],
  72  |     ['left', r.left + 6, r.top + r.height * 0.5],
  73  |     ['right', r.right - 6, r.top + r.height * 0.5],
  74  |   ]
  75  |   const covered = []
  76  |   for (const [name, x, y] of probes) {
  77  |     const top = document.elementFromPoint(x, y)
  78  |     if (!top || !(el === top || el.contains(top))) {
  79  |       covered.push({
  80  |         probe: name,
  81  |         x: Math.round(x),
  82  |         y: Math.round(y),
  83  |         hit: top
  84  |           ? (top.getAttribute('data-testid') || top.tagName.toLowerCase() + '.' + String(top.className).slice(0, 48))
  85  |           : 'nothing',
  86  |       })
  87  |     }
  88  |   }
  89  |   return {
  90  |     hasWrapper: !!wrapper,
  91  |     wrapperZ: zOf(wrapper),
  92  |     contentZ: zOf(el),
  93  |     fullscreenZ: zOf(fs),
  94  |     // The panel is portaled to the body, so it is NOT a descendant of the
  95  |     // fullscreen layer. That is precisely why the z-indexes have to be
  96  |     // compared: if this were ever true, the layer would carry the panel with
  97  |     // it and the numbers would stop mattering.
  98  |     panelInsideFullscreen: !!(fs && wrapper && fs.contains(wrapper)),
  99  |     effectiveOpacity: product,
  100 |     rect: { x: r.left, y: r.top, w: r.width, h: r.height },
  101 |     covered,
  102 |   }
  103 | })()`
  104 | 
  105 | async function probe(page: Page) {
  106 |   return page.evaluate(STACKING_PROBE) as Promise<{
  107 |     hasWrapper: boolean
  108 |     wrapperZ: number | null
  109 |     contentZ: number | null
  110 |     fullscreenZ: number | null
  111 |     panelInsideFullscreen: boolean
  112 |     effectiveOpacity: number
  113 |     rect: { x: number; y: number; w: number; h: number }
  114 |     covered: Array<{ probe: string; x: number; y: number; hit: string }>
  115 |   } | null>
  116 | }
  117 | 
  118 | /** Settle on the same predicate the assertions use, so a screenshot can never
  119 |  *  capture a frame the measurements would have rejected. */
  120 | async function waitForSettledPanel(page: Page, where: string) {
  121 |   try {
  122 |     await page.waitForFunction(
  123 |       `(() => { const s = ${STACKING_PROBE}; return !!s && s.effectiveOpacity >= 0.999 && s.covered.length === 0 })()`,
  124 |       undefined,
  125 |       { timeout: 10_000 },
  126 |     )
  127 |   } catch {
  128 |     const state = await probe(page)
  129 |     throw new Error(
  130 |       `the panel never settled opaque and on top in fullscreen (${where}): ${JSON.stringify(state)}`,
  131 |     )
  132 |   }
  133 | }
  134 | 
  135 | for (const vp of VIEWPORTS) {
  136 |   test(`external-destinations panel is topmost inside map fullscreen at ${vp.name}`, async ({
  137 |     context,
  138 |     page,
  139 |   }) => {
  140 |     test.setTimeout(150_000)
  141 |     const groups = logicalGroupSnapshot()
  142 |     const triggers = triggerBundleSnapshot(groups.snapshot)
  143 |     const egress = externalEgressSnapshot(triggers.snapshot)
  144 |     await seedAuthCookie(context)
  145 |     await routeSnapshot(page, egress.snapshot)
  146 |     await page.setViewportSize({ width: vp.width, height: vp.height })
  147 |     await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
> 148 |     await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
      |                                                                ^ Error: expect(locator).toBeVisible() failed
  149 |     await page.getByRole("tab", { name: "Network topology" }).click()
  150 | 
  151 |     // --- enter the real z-200 layer ----------------------------------------
  152 |     await page.getByTestId("topology-estate-map-enlarge").click()
  153 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  154 |     await expect(fullscreen).toBeVisible()
  155 | 
  156 |     // Anchor the test to the layer it is about. If the fullscreen z-index is
  157 |     // ever changed, this line says so directly instead of leaving a hit test
  158 |     // to fail somewhere further down with a confusing message.
  159 |     const fullscreenZ = await fullscreen.evaluate(el => getComputedStyle(el).zIndex)
  160 |     expect(fullscreenZ, "the fullscreen layer no longer carries z-index 200").toBe("200")
  161 | 
  162 |     // The trigger lives INSIDE that layer; the panel will not.
  163 |     const external = fullscreen.getByTestId("topology-external-destinations")
  164 |     await expect(external).toBeVisible()
  165 |     await expect(external).toHaveAttribute("data-open", "false")
  166 |     await expect(external).toHaveAttribute("data-leg-count", String(egress.legCount))
  167 |     await page.screenshot({
  168 |       path: `test-results/estate-fullscreen-default-${vp.name}.png`,
  169 |       fullPage: false,
  170 |     })
  171 | 
  172 |     // --- open it and measure the paint order -------------------------------
  173 |     await external.getByTestId("topology-external-destinations-toggle").click()
  174 |     await expect(external).toHaveAttribute("data-open", "true")
  175 |     const panel = page.getByTestId("topology-external-destinations-details")
  176 |     await expect(panel).toHaveCount(1)
  177 |     await expect(panel).toBeVisible()
  178 |     await waitForSettledPanel(page, `${vp.name} · measurement`)
  179 | 
  180 |     const s = await probe(page)
  181 |     expect(s, "the panel is measurable in fullscreen").not.toBeNull()
  182 |     expect(s!.hasWrapper, "Radix no longer wraps the content in a popper wrapper").toBe(true)
  183 |     expect(
  184 |       s!.panelInsideFullscreen,
  185 |       "the panel is portaled into the fullscreen layer now — the z-index comparison below no longer describes the real stacking",
  186 |     ).toBe(false)
  187 | 
  188 |     // The mechanism, asserted rather than trusted: the wrapper's order is the
  189 |     // CONTENT's order, copied inline. If Radix ever stops propagating it, the
  190 |     // wrapper falls back to `auto` and this fails with that fact named.
  191 |     expect(s!.contentZ, `the panel content carries no z-index at ${vp.name}`).not.toBeNull()
  192 |     expect(s!.wrapperZ, `the popper wrapper carries no z-index at ${vp.name}`).not.toBeNull()
  193 |     expect(
  194 |       s!.wrapperZ,
  195 |       `Radix did not copy the content's z-index onto the wrapper at ${vp.name} (content ${s!.contentZ}, wrapper ${s!.wrapperZ})`,
  196 |     ).toBe(s!.contentZ)
  197 | 
  198 |     // The invariant that makes it visible, stated as the comparison rather
  199 |     // than as a magic number, so it keeps holding if either layer moves.
  200 |     expect(s!.fullscreenZ, "the fullscreen layer is measurable").not.toBeNull()
  201 |     expect(
  202 |       s!.wrapperZ!,
  203 |       `the panel's wrapper (${s!.wrapperZ}) is not above the fullscreen layer (${s!.fullscreenZ}) at ${vp.name}`,
  204 |     ).toBeGreaterThan(s!.fullscreenZ!)
  205 | 
  206 |     // The assertion of record. Everything above can be right and the reader
  207 |     // still see the map: this is the one that matches what they experience.
  208 |     expect(
  209 |       s!.covered,
  210 |       `something paints over the panel inside fullscreen at ${vp.name} — an opaque panel under the map is invisible, not translucent: ${JSON.stringify(s!.covered)}`,
  211 |     ).toEqual([])
  212 |     expect(
  213 |       s!.effectiveOpacity,
  214 |       `panel's effective opacity is below 1 in fullscreen at ${vp.name}`,
  215 |     ).toBeGreaterThanOrEqual(0.999)
  216 | 
  217 |     // Contained and legible where it landed — fullscreen has its own chrome
  218 |     // and its own collision boundary, so the embedded measurement does not
  219 |     // carry over.
  220 |     expect(s!.rect.x, `panel off the left at ${vp.name}`).toBeGreaterThanOrEqual(-1)
  221 |     expect(s!.rect.y, `panel off the top at ${vp.name}`).toBeGreaterThanOrEqual(-1)
  222 |     expect(s!.rect.x + s!.rect.w, `panel off the right at ${vp.name}`).toBeLessThanOrEqual(vp.width + 1)
  223 |     expect(s!.rect.y + s!.rect.h, `panel off the bottom at ${vp.name}`).toBeLessThanOrEqual(
  224 |       vp.height + 1,
  225 |     )
  226 |     expect(s!.rect.w, `panel too narrow to read at ${vp.name}`).toBeGreaterThanOrEqual(260)
  227 |     await expect(panel.getByTestId("topology-external-destination-leg")).toHaveCount(egress.legCount)
  228 | 
  229 |     const legible = await panel.evaluate(p => {
  230 |       const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize)
  231 |       const legs = Array.from(
  232 |         p.querySelectorAll<HTMLElement>('[data-testid="topology-external-destination-leg"]'),
  233 |       )
  234 |       return {
  235 |         captionPx: px(p.querySelector("p")!),
  236 |         minLegPx: Math.min(...legs.map(px)),
  237 |         clipped: legs.filter(el => el.scrollWidth > el.clientWidth + 1).length,
  238 |       }
  239 |     })
  240 |     expect(legible.captionPx, `panel caption below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
  241 |     expect(legible.minLegPx, `panel leg text below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
  242 |     expect(legible.clipped, `clipped leg lines at ${vp.name}`).toBe(0)
  243 | 
  244 |     await page.screenshot({
  245 |       path: `test-results/estate-fullscreen-expanded-${vp.name}.png`,
  246 |       fullPage: false,
  247 |     })
  248 | 
```