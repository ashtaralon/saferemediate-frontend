# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-egress-map-fixture.spec.ts >> the IGW continues into the external lane at 1512x771 · inventory
- Location: tests/integration/topology-estate-egress-map-fixture.spec.ts:165:9

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
  77  |     const dash = getComputedStyle(path).strokeDasharray
  78  |     out.paths.push({
  79  |       target: target,
  80  |       start: { x: a.x, y: a.y },
  81  |       end: { x: b.x, y: b.y },
  82  |       length: total,
  83  |       // How the renderer TREATED it, read off the DOM rather than off the
  84  |       // payload we handed in: an edge can carry the right evidence fields and
  85  |       // still be drawn as authoritative if the renderer ignores them.
  86  |       authority: g.getAttribute('data-flow-authority'),
  87  |       pathBasis: g.getAttribute('data-flow-path-basis'),
  88  |       motion: g.getAttribute('data-flow-motion'),
  89  |       dash: dash && dash !== 'none' ? dash : null,
  90  |       animations: g.querySelectorAll('animate, animateMotion, animateTransform').length,
  91  |     })
  92  |   }
  93  |   return out
  94  | })()`
  95  | 
  96  | interface Rect {
  97  |   left: number
  98  |   top: number
  99  |   right: number
  100 |   bottom: number
  101 | }
  102 | 
  103 | /** Within `pad` px of the rect. The overlay leaves a small gap at each end for
  104 |  *  the arrowhead and the chip's own border, so an endpoint that lands exactly
  105 |  *  on the edge is correct and one that lands 200px away is not. */
  106 | function near(p: { x: number; y: number }, r: Rect, pad = 28): boolean {
  107 |   return (
  108 |     p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad
  109 |   )
  110 | }
  111 | 
  112 | function overlap(a: Rect, b: Rect): number {
  113 |   const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  114 |   const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  115 |   return w > 0 && h > 0 ? w * h : 0
  116 | }
  117 | 
  118 | async function rectOf(loc: Locator): Promise<Rect | null> {
  119 |   const b = await loc.boundingBox()
  120 |   return b ? { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height } : null
  121 | }
  122 | 
  123 | /** Topmost + opaque, the same predicate the fullscreen stacking spec uses:
  124 |  *  a panel drawn under the map has opacity 1 and correct geometry and is
  125 |  *  still invisible. */
  126 | const PANEL_TOPMOST = (testid: string) => `(() => {
  127 |   const el = document.querySelector('[data-testid="${testid}"]')
  128 |   if (!el) return null
  129 |   let node = el, product = 1
  130 |   while (node && node !== document.documentElement) {
  131 |     product *= Number(getComputedStyle(node).opacity)
  132 |     node = node.parentElement
  133 |   }
  134 |   const r = el.getBoundingClientRect()
  135 |   const probes = [
  136 |     ['top', r.left + r.width * 0.5, r.top + 6],
  137 |     ['middle', r.left + r.width * 0.5, r.top + r.height * 0.5],
  138 |     ['bottom', r.left + r.width * 0.5, r.bottom - 6],
  139 |   ]
  140 |   const covered = []
  141 |   for (const [name, x, y] of probes) {
  142 |     const top = document.elementFromPoint(x, y)
  143 |     if (!top || !(el === top || el.contains(top))) {
  144 |       covered.push({ probe: name, hit: top ? (top.getAttribute('data-testid') || top.tagName.toLowerCase()) : 'nothing' })
  145 |     }
  146 |   }
  147 |   return { effectiveOpacity: product, covered, rect: { x: r.left, y: r.top, w: r.width, h: r.height } }
  148 | })()`
  149 | 
  150 | async function waitTopmost(page: Page, testid: string, where: string) {
  151 |   try {
  152 |     await page.waitForFunction(
  153 |       `(() => { const s = ${PANEL_TOPMOST(testid)}; return !!s && s.effectiveOpacity >= 0.999 && s.covered.length === 0 })()`,
  154 |       undefined,
  155 |       { timeout: 10_000 },
  156 |     )
  157 |   } catch {
  158 |     const state = await page.evaluate(PANEL_TOPMOST(testid))
  159 |     throw new Error(`${testid} never settled opaque and on top (${where}): ${JSON.stringify(state)}`)
  160 |   }
  161 | }
  162 | 
  163 | for (const density of DENSITIES) {
  164 |   for (const vp of VIEWPORTS) {
  165 |     test(`the IGW continues into the external lane at ${vp.name} · ${density}`, async ({
  166 |       context,
  167 |       page,
  168 |     }) => {
  169 |       test.setTimeout(150_000)
  170 |       const groups = logicalGroupSnapshot()
  171 |       const triggers = triggerBundleSnapshot(groups.snapshot)
  172 |       const egress = externalEgressSnapshot(triggers.snapshot)
  173 |       await seedAuthCookie(context)
  174 |       await routeSnapshot(page, egress.snapshot)
  175 |       await page.setViewportSize({ width: vp.width, height: vp.height })
  176 |       await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
> 177 |       await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
      |                                                                  ^ Error: expect(locator).toBeVisible() failed
  178 |       await page.getByRole("tab", { name: "Network topology" }).click()
  179 |       await page.getByTestId(`topology-estate-density-${density}`).click()
  180 | 
  181 |       // --- DEFAULT state: the lane is on the canvas without a click ---------
  182 |       const lane = page.getByTestId("topology-external-destinations-lane")
  183 |       await expect(lane, "the external-destination lane is not drawn by default").toBeVisible()
  184 |       const nodeCount = Number(await lane.getAttribute("data-node-count"))
  185 |       expect(nodeCount, `no destination node drawn at ${vp.name}·${density}`).toBeGreaterThan(0)
  186 |       await expect(lane).toHaveAttribute("data-gateway-id", egress.igwId)
  187 |       expect(Number(await lane.getAttribute("data-total-named"))).toBe(egress.expectedNamed)
  188 | 
  189 |       // Identity, not decoration: exactly one node carries the payload's
  190 |       // attribution and every other drawn node stays an address.
  191 |       expect(Number(await lane.getAttribute("data-attributed-count"))).toBe(1)
  192 |       const attributed = lane.locator('[data-identity="aws_service"]')
  193 |       await expect(attributed).toHaveCount(1)
  194 |       await expect(attributed).toContainText(egress.attributedService)
  195 |       const addresses = lane.locator('[data-identity="address"]')
  196 |       expect(await addresses.count()).toBeGreaterThan(0)
  197 | 
  198 |       // Two provenances, never merged into one claim.
  199 |       const provenance = page.getByTestId("topology-external-destinations-provenance")
  200 |       await expect(provenance).toContainText("observed")
  201 |       await expect(provenance).toContainText("configured routing")
  202 | 
  203 |       // --- the acceptance: a DRAWN edge, gateway chip to destination chip ---
  204 |       await expect
  205 |         .poll(
  206 |           async () => {
  207 |             const g = (await page.evaluate(CONTINUATION_GEOMETRY)) as {
  208 |               paths: Array<{ target: string }>
  209 |             }
  210 |             return g.paths.length
  211 |           },
  212 |           {
  213 |             timeout: 20_000,
  214 |             message: `no IGW → external-destination edge is drawn at ${vp.name}·${density}`,
  215 |           },
  216 |         )
  217 |         .toBeGreaterThan(0)
  218 | 
  219 |       const geo = (await page.evaluate(CONTINUATION_GEOMETRY)) as {
  220 |         hasOverlay: boolean
  221 |         hasIgw: boolean
  222 |         igwRect: Rect | null
  223 |         paths: Array<{
  224 |           target: string
  225 |           start: { x: number; y: number }
  226 |           end: { x: number; y: number }
  227 |           length: number
  228 |           authority: string | null
  229 |           pathBasis: string | null
  230 |           motion: string | null
  231 |           dash: string | null
  232 |           animations: number
  233 |         }>
  234 |         destinations: Array<{ flowId: string; identity: string; rect: Rect }>
  235 |       }
  236 |       expect(geo.hasOverlay, "the flow overlay is drawn").toBe(true)
  237 |       expect(geo.hasIgw, "the in-map IGW chip is drawn").toBe(true)
  238 |       expect(geo.igwRect, "the IGW chip has a rect to leave from").not.toBeNull()
  239 | 
  240 |       const byId = new Map(geo.destinations.map(d => [d.flowId, d.rect]))
  241 |       const landed = geo.paths.filter(p => {
  242 |         const dst = byId.get(p.target)
  243 |         if (!dst) return false
  244 |         // Either orientation: the overlay routes right-to-left when the
  245 |         // destination sits left of the gateway at a narrow viewport.
  246 |         const forward = near(p.start, geo.igwRect!) && near(p.end, dst)
  247 |         const reverse = near(p.end, geo.igwRect!) && near(p.start, dst)
  248 |         return forward || reverse
  249 |       })
  250 |       expect(
  251 |         landed.length,
  252 |         `a gateway→destination path is drawn but neither end lands on the chips at ${vp.name}·${density}: ${JSON.stringify(
  253 |           { igw: geo.igwRect, paths: geo.paths, destinations: geo.destinations },
  254 |         )}`,
  255 |       ).toBeGreaterThan(0)
  256 |       // A zero-length or hairline path would satisfy "an edge exists" while
  257 |       // drawing nothing a reader can see.
  258 |       expect(Math.max(...landed.map(p => p.length)), "the drawn continuation is a hairline").toBeGreaterThan(8)
  259 | 
  260 |       // --- and it must NOT be drawn as observed, authoritative traffic ------
  261 |       //
  262 |       // The evidence behind this continuation is ACTUAL_TRAFFIC to a
  263 |       // NetworkEndpoint plus a ROUTES_VIA route. That is not proof that each
  264 |       // packet crossed this gateway, so the line may not borrow the solid,
  265 |       // animated treatment the renderer reserves for
  266 |       // observed+authoritative+observed_segment flows. Asserted on what was
  267 |       // RENDERED — a dash pattern and the absence of animation elements —
  268 |       // because the payload fields being right does not prove the renderer
  269 |       // honoured them.
  270 |       for (const p of geo.paths) {
  271 |         expect(p.authority, `continuation ${p.target} is not marked inferred at ${vp.name}·${density}`).toBe(
  272 |           "inferred",
  273 |         )
  274 |         expect(
  275 |           p.pathBasis,
  276 |           `continuation ${p.target} is not marked synthetic at ${vp.name}·${density}`,
  277 |         ).toBe("synthetic_expansion")
```