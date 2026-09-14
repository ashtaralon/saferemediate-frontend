# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> release QA — egress destinations beyond the IGW >> egress map on live C1 at 1366x768
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:1912:9

# Error details

```
ReferenceError: openMap is not defined
```

# Test source

```ts
  1828 |     expect(pageErrors, "reduced motion: uncaught page errors").toEqual([])
  1829 |   })
  1830 | })
  1831 | 
  1832 | // ---------------------------------------------------------------------------
  1833 | // Release QA — the egress map on the DEPLOYED C1 build (merge 53549ead).
  1834 | //
  1835 | // Read-only. Everything here is measured against the payload THE SAME PAGE
  1836 | // fetched, so a screen that agrees with itself but not with the graph fails.
  1837 | //
  1838 | // The claims under test are the ones the review named: the IGW continues into
  1839 | // destination nodes; that continuation is drawn DASHED and never animated,
  1840 | // because ACTUAL_TRAFFIC to a NetworkEndpoint plus ROUTES_VIA is not proof a
  1841 | // packet crossed the gateway; the "+N more" disclosure holds the destinations
  1842 | // it offers; panels stack above the map; the Data tier stays clear; a mirrored
  1843 | // relationship is badged once; and the diagnostics stay collapsed by default.
  1844 | // ---------------------------------------------------------------------------
  1845 | test.describe("release QA — egress destinations beyond the IGW", () => {
  1846 |   const RELEASE_VIEWPORTS = [
  1847 |     { name: "1600x900", width: 1600, height: 900 },
  1848 |     { name: "1512x771", width: 1512, height: 771 },
  1849 |     { name: "1366x768", width: 1366, height: 768 },
  1850 |     { name: "1024x720", width: 1024, height: 720 },
  1851 |   ] as const
  1852 | 
  1853 |   /** Every continuation path on the live page, with the treatment the renderer
  1854 |    *  gave it — read off the DOM, not off the payload. */
  1855 |   const LIVE_CONTINUATION = `(() => {
  1856 |     const svg = document.querySelector('[data-testid="topology-flow-overlay"]')
  1857 |     const igw = document.querySelector('[data-flow-id="__igw__"]')
  1858 |     const out = { hasOverlay: !!svg, hasIgw: !!igw, igwRect: null, paths: [], destinations: [] }
  1859 |     if (igw) { const r = igw.getBoundingClientRect(); out.igwRect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
  1860 |     for (const n of Array.from(document.querySelectorAll('[data-testid="topology-external-destination-node"], [data-testid="topology-external-destination-unknown"]'))) {
  1861 |       const r = n.getBoundingClientRect()
  1862 |       out.destinations.push({
  1863 |         flowId: n.getAttribute('data-flow-id'),
  1864 |         identity: n.getAttribute('data-identity') || 'unknown-group',
  1865 |         label: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
  1866 |         rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
  1867 |       })
  1868 |     }
  1869 |     if (!svg) return out
  1870 |     for (const g of Array.from(svg.querySelectorAll('g[data-flow-source="__igw__"]'))) {
  1871 |       const target = g.getAttribute('data-flow-target') || ''
  1872 |       if (target.indexOf('extdst:') !== 0) continue
  1873 |       const path = g.querySelector('path[data-flow-line="stroke"]') || g.querySelector('path[d]')
  1874 |       if (!path) continue
  1875 |       const total = path.getTotalLength(); if (!total) continue
  1876 |       const m = path.getScreenCTM(); if (!m) continue
  1877 |       const a = path.getPointAtLength(0).matrixTransform(m)
  1878 |       const b = path.getPointAtLength(total).matrixTransform(m)
  1879 |       const dash = getComputedStyle(path).strokeDasharray
  1880 |       out.paths.push({
  1881 |         target, length: total,
  1882 |         start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
  1883 |         authority: g.getAttribute('data-flow-authority'),
  1884 |         pathBasis: g.getAttribute('data-flow-path-basis'),
  1885 |         motion: g.getAttribute('data-flow-motion'),
  1886 |         dash: dash && dash !== 'none' ? dash : null,
  1887 |         animations: g.querySelectorAll('animate, animateMotion, animateTransform').length,
  1888 |       })
  1889 |     }
  1890 |     return out
  1891 |   })()`
  1892 | 
  1893 |   const TOPMOST = (testid) => `(() => {
  1894 |     const el = document.querySelector('[data-testid="${testid}"]')
  1895 |     if (!el) return null
  1896 |     let n = el, o = 1
  1897 |     while (n && n !== document.documentElement) { o *= Number(getComputedStyle(n).opacity); n = n.parentElement }
  1898 |     const r = el.getBoundingClientRect()
  1899 |     const probes = [[r.left + r.width/2, r.top + 6], [r.left + r.width/2, r.top + r.height/2], [r.left + r.width/2, r.bottom - 6]]
  1900 |     const covered = []
  1901 |     for (const [x, y] of probes) {
  1902 |       const t = document.elementFromPoint(x, y)
  1903 |       if (!t || !(el === t || el.contains(t))) covered.push(t ? (t.getAttribute('data-testid') || t.tagName.toLowerCase()) : 'nothing')
  1904 |     }
  1905 |     return { effectiveOpacity: o, covered, rect: { x: r.left, y: r.top, w: r.width, h: r.height }, inViewport: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1 }
  1906 |   })()`
  1907 | 
  1908 |   const near = (p, r, pad = 30) =>
  1909 |     p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad
  1910 | 
  1911 |   for (const vp of RELEASE_VIEWPORTS) {
  1912 |     test(`egress map on live C1 at ${vp.name}`, async ({ page }) => {
  1913 |       test.setTimeout(240_000)
  1914 |       const consoleErrors: string[] = []
  1915 |       const failedRequests: string[] = []
  1916 |       const pageErrors: string[] = []
  1917 |       page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)) })
  1918 |       page.on("requestfailed", r => failedRequests.push(`${r.method()} ${r.url().slice(0, 200)}`))
  1919 |       page.on("pageerror", e => pageErrors.push(String(e).slice(0, 300)))
  1920 | 
  1921 |       await page.setViewportSize({ width: vp.width, height: vp.height })
  1922 | 
  1923 |       // The deployed revision this QA is about.
  1924 |       const bv = await page.request.get("/api/build-version")
  1925 |       const build = bv.ok() ? await bv.json() : null
  1926 |       report("release-build-version", build)
  1927 | 
> 1928 |       await openMap(page, `release-${vp.name}`)
       |       ^ ReferenceError: openMap is not defined
  1929 |       const deps = page.getByTestId("topology-estate-flow-mode-all_access").first()
  1930 |       if (await deps.count()) { await deps.click().catch(() => undefined); await page.waitForTimeout(1200) }
  1931 | 
  1932 |       // --- the page's OWN payload, so the screen is checked against the graph
  1933 |       const res = await page.request.get(TOPOLOGY_RISK_PATH)
  1934 |       const payload = res.ok() ? await res.json() : null
  1935 |       const edges = (payload?.traffic_edges ?? payload?.data?.traffic_edges ?? []) as Array<Record<string, unknown>>
  1936 |       const observedEgress = edges.filter(e => {
  1937 |         const t = String(e.target_id ?? "")
  1938 |         if (!(t === "__igw__" || t.startsWith("igw-"))) return false
  1939 |         if (e.evidence_type === "configured" || e.path_basis === "configured_route" || e.authority_state === "configured") return false
  1940 |         return e.evidence_type === "observed" || e.external_destinations != null || ((e.egress_breakdown as unknown[]) ?? []).length > 0
  1941 |       })
  1942 |       const gateways = [...new Set(observedEgress.flatMap(e => ((e.egress_hops as Array<{kind:string;id:string}>) ?? []).filter(h => h.kind === "igw").map(h => h.id)))]
  1943 |       report("release-payload", { observed_egress_legs: observedEgress.length, gateways })
  1944 | 
  1945 |       // --- Glance (default) then Inventory, embedded -----------------------
  1946 |       for (const density of ["glance", "inventory"] as const) {
  1947 |         const toggle = page.getByTestId(`topology-estate-density-${density}`)
  1948 |         if (await toggle.count()) { await toggle.click(); await page.waitForTimeout(1200) }
  1949 | 
  1950 |         const lane = page.getByTestId("topology-external-destinations-lane")
  1951 |         const laneVisible = await lane.isVisible().catch(() => false)
  1952 |         report(`release-lane-${density}-${vp.name}`, {
  1953 |           visible: laneVisible,
  1954 |           nodes: laneVisible ? await lane.getAttribute("data-node-count") : null,
  1955 |           totalNamed: laneVisible ? await lane.getAttribute("data-total-named") : null,
  1956 |           hidden: laneVisible ? await lane.getAttribute("data-hidden-count") : null,
  1957 |           attributed: laneVisible ? await lane.getAttribute("data-attributed-count") : null,
  1958 |           gateway: laneVisible ? await lane.getAttribute("data-gateway-id") : null,
  1959 |         })
  1960 | 
  1961 |         if (observedEgress.length > 0) {
  1962 |           expect(laneVisible, `${density}·${vp.name}: payload has ${observedEgress.length} observed egress legs and no lane is drawn`).toBe(true)
  1963 |           await lane.scrollIntoViewIfNeeded()
  1964 |           if (gateways.length > 0) {
  1965 |             expect(gateways, `${density}·${vp.name}: the lane names a gateway the payload does not`).toContain(
  1966 |               await lane.getAttribute("data-gateway-id"),
  1967 |             )
  1968 |           }
  1969 | 
  1970 |           // The continuation, and how it was DRAWN.
  1971 |           const geo = (await page.evaluate(LIVE_CONTINUATION)) as any
  1972 |           report(`release-continuation-${density}-${vp.name}`, {
  1973 |             paths: geo.paths.length,
  1974 |             destinations: geo.destinations.length,
  1975 |             treatments: geo.paths.map((p: any) => ({ authority: p.authority, pathBasis: p.pathBasis, motion: p.motion, dash: p.dash, animations: p.animations })),
  1976 |           })
  1977 |           expect(geo.paths.length, `${density}·${vp.name}: no IGW → destination path is drawn`).toBeGreaterThan(0)
  1978 |           const byId = new Map(geo.destinations.map((d: any) => [d.flowId, d.rect]))
  1979 |           const landed = geo.paths.filter((p: any) => {
  1980 |             const dst = byId.get(p.target); if (!dst) return false
  1981 |             return (near(p.start, geo.igwRect) && near(p.end, dst)) || (near(p.end, geo.igwRect) && near(p.start, dst))
  1982 |           })
  1983 |           expect(landed.length, `${density}·${vp.name}: a continuation path lands on neither chip`).toBeGreaterThan(0)
  1984 |           // Dashed, static, never live.
  1985 |           for (const p of geo.paths) {
  1986 |             expect(p.authority, `${density}·${vp.name}: continuation not marked inferred`).toBe("inferred")
  1987 |             expect(p.pathBasis, `${density}·${vp.name}: continuation not marked synthetic`).toBe("synthetic_expansion")
  1988 |             expect(p.motion, `${density}·${vp.name}: continuation qualified for traffic motion`).toBe("none")
  1989 |             expect(p.dash, `${density}·${vp.name}: continuation drawn SOLID — reads as a measured path`).not.toBeNull()
  1990 |             expect(p.animations, `${density}·${vp.name}: continuation animated as live traffic`).toBe(0)
  1991 |           }
  1992 | 
  1993 |           // The Data tier stays clear of the lane.
  1994 |           const laneBox = await lane.boundingBox()
  1995 |           const cells = page.locator('[data-tier="data"]')
  1996 |           for (let i = 0; i < (await cells.count()); i++) {
  1997 |             const c = await cells.nth(i).boundingBox()
  1998 |             if (!c || !laneBox) continue
  1999 |             const w = Math.min(laneBox.x + laneBox.width, c.x + c.width) - Math.max(laneBox.x, c.x)
  2000 |             const h = Math.min(laneBox.y + laneBox.height, c.y + c.height) - Math.max(laneBox.y, c.y)
  2001 |             expect(w > 0 && h > 0 ? Math.round(w * h) : 0, `${density}·${vp.name}: lane overlaps data-tier cell ${i}`).toBe(0)
  2002 |           }
  2003 | 
  2004 |           // "+N more" must HOLD what it offers.
  2005 |           const hidden = Number(await lane.getAttribute("data-hidden-count"))
  2006 |           if (hidden > 0) {
  2007 |             const more = page.getByTestId("topology-external-destinations-more")
  2008 |             await more.click()
  2009 |             const panel = page.getByTestId("topology-external-destinations-more-details")
  2010 |             await expect(panel).toBeVisible()
  2011 |             await page.waitForTimeout(400)
  2012 |             const items = panel.getByTestId("topology-external-destinations-more-item")
  2013 |             const listed = await items.count()
  2014 |             const stack = (await page.evaluate(TOPMOST("topology-external-destinations-more-details"))) as any
  2015 |             report(`release-more-${density}-${vp.name}`, { hidden, listed, stack })
  2016 |             expect(listed, `${density}·${vp.name}: +${hidden} disclosure lists ${listed}`).toBe(hidden)
  2017 |             expect(stack.covered, `${density}·${vp.name}: the +N panel is painted under the map`).toEqual([])
  2018 |             expect(stack.inViewport, `${density}·${vp.name}: the +N panel is outside the viewport`).toBe(true)
  2019 |             await expect(panel).toContainText("not an inventory")
  2020 |             await shot(page, `c1-release-more-${density}-${vp.name}`)
  2021 |             await page.keyboard.press("Escape")
  2022 |           }
  2023 |         }
  2024 |         await shot(page, `c1-release-${density}-${vp.name}`)
  2025 |       }
  2026 | 
  2027 |       // --- collapsed-by-default diagnostics + trigger labels ---------------
  2028 |       const coverage = page.getByTestId("topology-lane-coverage").first()
```