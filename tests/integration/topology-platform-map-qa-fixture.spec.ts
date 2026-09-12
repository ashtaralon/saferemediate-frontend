import { expect, test } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import { ESTATE_URL, SNAPSHOT, railHeaderBadgeOverlaps, routeSnapshot } from "./topology-fixture"

// Deterministic fixture spec (renamed from *-qa-live 2026-09-02): it never
// reaches a backend — see tests/integration/topology-fixture.ts.

test("fullscreen platform map shows named Lambda, protected AZ labels, directional flow, legend, and e2e service path", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000)
  await seedAuthCookie(context)
  await routeSnapshot(page)
  await page.setViewportSize({ width: 2048, height: 1100 })
  await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })

  // The page resolves the system through the product scope + scoped catalog
  // (all answered by routeSnapshot) before it mounts the map and its tabs.
  await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  await page.getByRole("tab", { name: "Network topology" }).click()
  await expect(page.getByRole("heading", { name: "Service index" })).toBeVisible()
  await expect(page.getByText("Next worst")).toHaveCount(0)

  const dependencies = page
    .getByTestId("topology-flow-mode-toggle")
    .getByRole("button", { name: "Dependencies" })
    .first()
  await dependencies.click()
  await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  const legend = page.getByTestId("topology-flow-legend").first()
  await expect(legend).toBeVisible()
  await expect(legend).toContainText("Service call")
  await expect(legend).toContainText("AWS data service")
  await expect(legend).toContainText("VPC endpoint")
  await expect(legend).toContainText("Internet egress")
  await expect(legend).toContainText("Database")
  const authorityState = page.getByTestId("topology-traffic-authority-state").first()
  await expect(authorityState).toContainText("Confirmed TCP paths")
  await expect(authorityState).toContainText("missing segment is not evidence of no traffic")

  // Flow-log coverage pill: every number is the payload's lane_coverage block.
  const coverage = SNAPSHOT.traffic_authority.lane_coverage
  const pill = page.getByTestId("topology-lane-coverage").first()
  await expect(pill).toBeVisible()
  await expect(pill.getByTestId("topology-lane-coverage-totals")).toHaveText(
    `${coverage.authoritative} of ${coverage.eligible} eligible endpoints covered · ${coverage.unknown} unknown · ${coverage.not_applicable} not applicable · generation 7`,
  )
  await expect(pill.getByTestId("topology-lane-coverage-serverless")).toHaveAttribute("data-lane-state", "unknown")
  await expect(pill.getByTestId("topology-lane-coverage-regional")).toHaveAttribute("data-lane-state", "not_applicable")
  await expect(pill.getByTestId("topology-coverage-gap")).toHaveCount(
    (SNAPSHOT.traffic_authority.coverage_gaps ?? coverage.warnings).length,
  )

  // The INLINE map, before fullscreen: this is the surface in the operator's own
  // screenshot, and it is the tight one — the Lambda and Regional lanes take the
  // right third, so the VPC frame is ~950px. It is a single-frame canvas like
  // the fullscreen one, so its IGW and endpoints are in the VPC BOUNDARY column
  // beside the frame, not on the header line, and the VPC id — which used to
  // lose that line to five pills and render as "VPC…" — has it to itself.
  // Document-wide is unambiguous here and only here: the fullscreen overlay is
  // not mounted yet, so exactly one map exists. Every query AFTER the enlarge
  // click has to scope to the overlay.
  await expect(page.getByTestId("topology-estate-map-fullscreen")).toHaveCount(0)
  const inlineGeom = await page.evaluate(() => {
    const column = document.querySelector('[data-testid="topology-vpc-boundary-column"]')
    const frame = document.querySelector('[data-testid="topology-vpc-frame"]')
    const id = document.querySelector('[data-testid="topology-vpc-frame-id"]') as HTMLElement | null
    if (!column || !frame || !id) return null
    const c = column.getBoundingClientRect()
    const f = frame.getBoundingClientRect()
    return {
      idVisibleFraction: id.clientWidth / id.scrollWidth,
      headerStrip: document.querySelector('[data-testid="topology-vpc-boundary-strip"]') !== null,
      rightOfFrame: c.left >= f.right - 1,
      clippedPills: [
        ...document.querySelectorAll(
          '[data-testid="topology-igw-rail-chip"],[data-testid="topology-vpce-rail-chip"]',
        ),
      ].filter(el => {
        const r = el.getBoundingClientRect()
        return r.width < 40 || r.left < c.left - 1 || r.right > c.right + 1
      }).length,
    }
  })
  expect(inlineGeom).not.toBeNull()
  expect(inlineGeom!.headerStrip).toBe(false)
  expect(inlineGeom!.rightOfFrame).toBe(true)
  // Every device fits the column: none clipped, none narrower than a pill.
  expect(inlineGeom!.clippedPills).toBe(0)
  expect(inlineGeom!.idVisibleFraction).toBeGreaterThan(0.6)

  await page.getByTestId("topology-estate-map-enlarge").click()
  const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  await expect(fullscreen).toBeVisible()

  const lambda = fullscreen.getByRole("button", { name: /alon-prod-continuous-traffic/i })
  await expect(lambda).toBeVisible()
  const lambdaBox = await lambda.boundingBox()
  expect(lambdaBox).not.toBeNull()
  expect(lambdaBox!.x).toBeGreaterThanOrEqual(0)
  expect(lambdaBox!.y).toBeGreaterThanOrEqual(0)
  expect(lambdaBox!.x + lambdaBox!.width).toBeLessThanOrEqual(2048)
  expect(lambdaBox!.y + lambdaBox!.height).toBeLessThanOrEqual(1100)

  const movingPacket = fullscreen.getByTestId("topology-flow-packet").first()
  await expect(movingPacket).toBeAttached()
  await expect(movingPacket.locator("animateMotion, animatemotion")).toHaveAttribute("dur", "6.4s")
  const firstPosition = await movingPacket.evaluate(packet => {
    const rect = packet.getBoundingClientRect()
    return { x: rect.x, y: rect.y }
  })
  await page.waitForTimeout(550)
  const secondPosition = await movingPacket.evaluate(packet => {
    const rect = packet.getBoundingClientRect()
    return { x: rect.x, y: rect.y }
  })
  expect(
    Math.abs(firstPosition.x - secondPosition.x) + Math.abs(firstPosition.y - secondPosition.y),
  ).toBeGreaterThan(2)

  const azLabels = fullscreen.locator('[data-flow-obstacle="az-header-row"] [title^="eu-west-1"]')
  const azCount = await azLabels.count()
  expect(azCount).toBeGreaterThanOrEqual(2)
  for (let index = 0; index < azCount; index += 1) {
    const label = azLabels.nth(index)
    const isTopmost = await label.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return top === element || element.contains(top)
    })
    expect(isTopmost).toBe(true)
  }

  // Rail tier headers are flow obstacles: no edge label paints over them.
  await page.waitForTimeout(600) // double-rAF measure after the fit
  expect(await railHeaderBadgeOverlaps(page)).toEqual([])

  // The IGW and the VPC endpoints render in the VPC BOUNDARY column between the
  // VPC frame and the rail — the IGW at the TOP (the path up to the internet),
  // the endpoints at the BOTTOM, level with the data tier — not side by side on
  // the frame's header line (Alon, 2026-09-11: "u cant put it like here, one
  // next to the other"). Geometry is the assertion, not the testid: both layouts
  // render the same chips, so only their boxes can tell them apart.
  const igwChips = await fullscreen.getByTestId("topology-igw-rail-chip").count()
  const vpceChips = await fullscreen.getByTestId("topology-vpce-rail-chip").count()
  expect(igwChips, "this payload attaches an IGW to the drawn VPC").toBeGreaterThan(0)
  expect(vpceChips, "this payload has VPC endpoints").toBeGreaterThan(0)
  await expect(fullscreen.getByTestId("topology-vpc-boundary-column")).toBeVisible()
  await expect(fullscreen.getByTestId("topology-vpc-boundary-column-header")).toHaveText(/VPC boundary/i)
  await expect(fullscreen.getByTestId("topology-vpc-boundary-strip")).toHaveCount(0)
  // `root.querySelector`, not `document.querySelector`: the inline map is still
  // mounted behind the fullscreen overlay, so a document-wide query measures
  // whichever instance happens to come first in the DOM — a different frame
  // width, and therefore different geometry, than the one under assertion.
  const boundaryGeom = await fullscreen.evaluate((root: HTMLElement) => {
    const q = (sel: string) => root.querySelector(sel)
    const frame = q('[data-testid="topology-vpc-frame"]')
    const column = q('[data-testid="topology-vpc-boundary-column"]')
    const corridor = q('[data-testid="topology-flow-corridor"]')
    const igw = q('[data-testid="topology-igw-rail-chip"]')
    const id = q('[data-testid="topology-vpc-frame-id"]') as HTMLElement | null
    if (!frame || !column || !corridor || !igw || !id) return null
    const f = frame.getBoundingClientRect()
    const c = column.getBoundingClientRect()
    const k = corridor.getBoundingClientRect()
    const g = igw.getBoundingClientRect()
    const vpceEls = [...root.querySelectorAll('[data-testid="topology-vpce-rail-chip"]')]
    const vpces = vpceEls.map(el => el.getBoundingClientRect())
    return {
      // Beside the frame, before the flow corridor: VPC | boundary | gutter | rail.
      rightOfFrame: c.left >= f.right - 1,
      leftOfCorridor: c.right <= k.left + 1,
      igwInColumn: column.contains(igw),
      igwOutsideFrame: !frame.contains(igw),
      // px from the column's top: under its header and the "↑ Internet" line.
      igwFromTop: g.top - c.top,
      igwAboveEveryEndpoint: vpces.every(v => v.top >= g.bottom),
      // px from the last endpoint's bottom to the column's bottom: bottom-anchored,
      // with only its own caption under it.
      endpointsFromBottom: vpces.length > 0 ? c.bottom - Math.max(...vpces.map(v => v.bottom)) : null,
      // No pill may be clipped away: a hidden endpoint is a device the graph
      // reports and the map silently denies.
      clippedPills: [igw, ...vpceEls].filter(el => {
        const r = el.getBoundingClientRect()
        return r.width < 40 || r.left < c.left - 1 || r.right > c.right + 1 || r.top < c.top - 1 || r.bottom > c.bottom + 1
      }).length,
      captions: [...root.querySelectorAll('[data-testid="topology-boundary-caption"]')].map(el => el.textContent ?? ""),
      // The frame still says which VPC it is; the strip's departure only gave the
      // id more room. Measured, not read: `textContent` returns the whole id
      // however little of it is on screen.
      frameIdWidth: Math.round(id.getBoundingClientRect().width),
      frameIdVisibleFraction: id.clientWidth / id.scrollWidth,
    }
  })
  expect(boundaryGeom).not.toBeNull()
  expect(boundaryGeom!.rightOfFrame).toBe(true)
  expect(boundaryGeom!.leftOfCorridor).toBe(true)
  expect(boundaryGeom!.igwInColumn).toBe(true)
  expect(boundaryGeom!.igwOutsideFrame).toBe(true)
  expect(boundaryGeom!.igwFromTop).toBeLessThanOrEqual(60)
  expect(boundaryGeom!.igwAboveEveryEndpoint).toBe(true)
  expect(boundaryGeom!.endpointsFromBottom).not.toBeNull()
  expect(boundaryGeom!.endpointsFromBottom!).toBeLessThanOrEqual(24)
  expect(boundaryGeom!.clippedPills).toBe(0)
  // One caption per device, each counted from the edges the map draws — never a
  // route table the payload does not carry. This payload routes egress from
  // several workloads through the IGW, draws EC2 → SSM endpoint flows and one
  // S3 access through the S3 gateway endpoint, and nothing to ec2messages: so
  // the IGW counts workloads, at least one endpoint is in use, and an unused one
  // says "not observed" rather than inventing a number.
  expect(boundaryGeom!.captions).toHaveLength(igwChips + vpceChips)
  // The first IGW is the one the egress edges name; a further one on this frame
  // (this payload also carries the OTHER VPC's gateway, which falls to the
  // primary frame) is reached by nothing and says so.
  for (const caption of boundaryGeom!.captions.slice(0, igwChips)) {
    expect(caption).toMatch(/^egress: (\d+ workloads?|not observed)$/)
  }
  expect(boundaryGeom!.captions[0]).toMatch(/^egress: \d+ workloads?$/)
  for (const caption of boundaryGeom!.captions.slice(igwChips)) expect(caption).toMatch(/^use: (\d+ workloads?|not observed)$/)
  expect(boundaryGeom!.captions.slice(igwChips).some(caption => /^use: \d+ workload/.test(caption))).toBe(true)
  expect(boundaryGeom!.captions.slice(igwChips)).toContain("use: not observed")
  expect(boundaryGeom!.frameIdWidth).toBeGreaterThanOrEqual(132)
  expect(boundaryGeom!.frameIdVisibleFraction).toBeGreaterThan(0.6)
  // The old column only appears now for a device with no frame to sit on.
  await expect(fullscreen.getByTestId("topology-boundary-rail-header")).toContainText(
    "Not in this VPC",
  )
  // Once, not twice. Moving the chips out left the column with a single kind of
  // content but two headings for it, a dashed rule apart — the browser showed
  // "Not in this VPC" stacked on itself, which reads as two sections.
  expect(
    await fullscreen
      .getByTestId("topology-network-rail")
      .getByText("Not in this VPC")
      .count(),
  ).toBe(1)

  // This payload's only load balancer is in vpc-086bcc2186fa42c96 — NOT the VPC
  // this canvas draws — and the scoped grid used to drop it without a word: it is
  // not this frame's gap (so not the unplaced area) and not stale (so not the
  // diagnostics list). The rail now says where it really is, in text, because a
  // chip here would assert a placement the graph contradicts.
  const foreignIngress = fullscreen.getByTestId("topology-foreign-ingress-reference")
  await expect(foreignIngress).toBeVisible()
  await expect(foreignIngress).toHaveAttribute("data-foreign-ingress-count", "1")
  // No heading of its own — the column's one heading, asserted above, is this
  // block's heading. It carried a second "Not in this VPC" back when the IGW and
  // VPCE chips shared the column and it needed to separate itself from them.
  await expect(foreignIngress).toContainText("ALB · alon-prod-3tier-alb")
  // The co-tenant is read off that VPC's subnets, not asserted by this spec.
  await expect(foreignIngress).toContainText("payment-production")
  const foreignLine = foreignIngress.getByTestId("topology-foreign-ingress-line").first()
  // The visible id is truncated to fit a 136px rail; the full one has to survive
  // somewhere, or the reference names a VPC the operator cannot look up.
  await expect(foreignLine).toHaveAttribute(
    "data-foreign-ingress-vpc",
    "vpc-086bcc2186fa42c96",
  )
  await expect(foreignLine).toHaveAttribute("title", /vpc-086bcc2186fa42c96/)
  // Referenced, never drawn: the ALB gets no chip inside the VPC on screen. Every
  // workload chip carries `data-flow-id={node.id}`, and this ALB's id is an ARN
  // containing its name — so the zero below is a real absence, and the count
  // beside it proves the selector finds chips at all rather than nothing.
  await expect(fullscreen.getByTestId("topology-alb-band")).toHaveCount(0)
  expect(
    await fullscreen.locator("[data-flow-id]").count(),
    "the canvas draws no flow-anchored chips, so the ALB's absence below is vacuous",
  ).toBeGreaterThan(0)
  await expect(
    fullscreen.locator('[data-flow-id*="alon-prod-3tier-alb"]'),
  ).toHaveCount(0)

  // Where the column's leftover height goes. Three states, one measurement,
  // because every wrong answer here was a plausible-looking version of the same
  // pixels landing somewhere useless:
  //
  //   fr split      — 1.35fr : 1.2fr : 0.65fr. Spends the slack on whichever
  //                   tier is listed first, not on whichever tier holds
  //                   anything: measured on this payload at 1800×1000, Web took
  //                   245px to show ONE chip per subnet while App fitted two
  //                   rows into 218px. Misallocation.
  //   content + start — rows hug their chips and the slack lands OUTSIDE the VPC
  //                   border: the frame is a subgrid child spanning `1 / -1`, so
  //                   it ends where the last row ends — measured 449px of
  //                   unframed void under the Data tier, which reads as "the
  //                   diagram stopped". Fixed by a trailing `1fr` track, which
  //                   then held the slack as one dead band inside the border.
  //   live          — `minmax(floor, auto)` tier maxes with no explicit
  //                   alignContent. An `auto` max puts a track in grid's stretch
  //                   set (CSS Grid §12.8) and `align-content: normal` behaves
  //                   as stretch, so leftover height is shared EQUALLY by the
  //                   three tier rows and the chips get the room. The chrome
  //                   rows keep `max-content` maxes and stay out of that set.
  //
  // None of this is visible in the CSS (every row looks symmetrical) or to a
  // jsdom test (no layout), so it is measured in the browser at this spec's tall
  // viewport — the slack only exists when the column has height to place, which
  // is why these assertions are not in the rail spec.
  const measureTierFill = () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')!
      const grid = root.querySelector<HTMLElement>('[data-testid="topology-single-vpc-grid"]')
      const frame = grid?.querySelector('[data-testid="topology-vpc-frame"]')
      if (!grid || !frame) return null
      // Used track sizes, not the authored template — the whole question is what
      // the layout engine did with the slack.
      const tracks = () =>
        getComputedStyle(grid).gridTemplateRows
          .split(" ")
          .map(v => Math.round(parseFloat(v)))
      const voidBelowFrame = () =>
        Math.round(grid.getBoundingClientRect().bottom - frame.getBoundingClientRect().bottom)
      const read = () => ({ tracks: tracks(), void: voidBelowFrame() })
      const live = read()
      const kept = { rows: grid.style.gridTemplateRows, align: grid.style.alignContent }
      // Control 1 — content-sized tier rows. Same floors, `max-content` maxes, so
      // the tier tracks leave the stretch set and every track sits at exactly its
      // content size. That is both the pre-#850 state AND the baseline the bonus
      // below is measured against.
      const hugged = kept.rows.replace(/,\s*auto\)/g, ", max-content)")
      grid.style.gridTemplateRows = hugged
      grid.style.alignContent = "start"
      void grid.getBoundingClientRect() // flush layout before re-measuring
      const hug = read()
      // Control 2 — the fr weights #849 removed. Same leftover height, allocated
      // by declaration order instead of equally. A bound nothing can violate is
      // decoration, so the spread assertion needs a template that blows it.
      grid.style.gridTemplateRows = "auto auto minmax(0, 1.35fr) minmax(0, 1.2fr) minmax(0, 0.65fr)"
      grid.style.alignContent = "stretch"
      void grid.getBoundingClientRect()
      const frSplit = read()
      grid.style.gridTemplateRows = kept.rows
      grid.style.alignContent = kept.align
      void grid.getBoundingClientRect()
      return {
        live,
        hug,
        frSplit,
        restored: read(),
        rows: kept.rows,
        rewroteMaxes: hugged !== kept.rows,
        frameHeight: Math.round(frame.getBoundingClientRect().height),
      }
    })
  const fill = await measureTierFill()
  expect(fill, "the fullscreen VPC frame is a child of the single-VPC grid").not.toBeNull()
  expect(
    fill!.rewroteMaxes,
    `the tier rows must carry \`auto\` maxes for stretch to reach them; the template is "${fill!.rows}"`,
  ).toBe(true)
  expect(
    fill!.hug.tracks,
    "the content-sized control changed no track size, so it never applied",
  ).not.toEqual(fill!.live.tracks)
  // Header + AZ band + three tiers. The dead trailing `1fr` band is gone: the
  // tiers hold that height now, so a sixth track means the fill track came back.
  expect(
    fill!.live.tracks.length,
    `the grid must have 5 rows — chrome, band, three tiers — not ${fill!.live.tracks.length}`,
  ).toBe(5)
  expect(fill!.frameHeight, "the VPC frame has real height to measure against").toBeGreaterThan(200)

  // #850's guarantee, unchanged: the border reaches the bottom of the column.
  expect(
    fill!.live.void,
    `${fill!.live.void}px of the column sits below the VPC border — the frame must reach the bottom of its row`,
  ).toBeLessThanOrEqual(8)
  expect(
    fill!.hug.void,
    `content-sized rows leave only ${fill!.hug.void}px unframed here, so the bound above proves nothing`,
  ).toBeGreaterThan(100)
  expect(fill!.restored.void, "the row template is restored after the control measurements").toBeLessThanOrEqual(8)

  // What each row did with the slack. Bonus = used size − content size, read
  // from the same two track lists, so the chrome rows are a built-in negative
  // control: `max-content` maxes keep them out of the stretch set and their
  // bonus must be zero.
  const bonus = fill!.live.tracks.map((px, i) => px - fill!.hug.tracks[i])
  const tierBonus = bonus.slice(2)
  expect(
    bonus.slice(0, 2),
    `the chrome rows must not stretch — they grew ${bonus.slice(0, 2).join("/")}px`,
  ).toEqual([0, 0])
  expect(
    Math.min(...tierBonus),
    `a tier row got ${Math.min(...tierBonus)}px of the column's slack — every tier must gain room for its chips`,
  ).toBeGreaterThan(0)
  const spread = Math.max(...tierBonus) - Math.min(...tierBonus)
  expect(
    spread,
    `the tier rows split the slack ${tierBonus.join("/")}px — stretch must share it equally, not by declaration order`,
  ).toBeLessThanOrEqual(2)
  const frSpread = (() => {
    const b = fill!.frSplit.tracks.map((px, i) => px - fill!.hug.tracks[i]).slice(2)
    return Math.max(...b) - Math.min(...b)
  })()
  expect(
    frSpread,
    `the fr split allocates within ${frSpread}px of evenly here, so the spread bound above proves nothing`,
  ).toBeGreaterThan(40)
  // Cross-check, two independent instruments: the height the tiers gained is the
  // height that used to sit unframed below the border. Bounding rects and used
  // track sizes have to agree, or one of them is being misread.
  const absorbed = tierBonus.reduce((a, b) => a + b, 0)
  expect(
    Math.abs(absorbed + fill!.live.void - fill!.hug.void),
    `tiers absorbed ${absorbed}px but ${fill!.hug.void}px was unframed — the two measurements disagree`,
  ).toBeLessThanOrEqual(6)

  // No two workload chips may paint the same string. Labels clip with a CSS
  // ellipsis, which never enters the text, so a shared prefix long enough to
  // fill the chip made siblings that differ only in a trailing index render
  // byte-identical — and "which service talks to which" is the whole point of
  // this view. The control below proves the collision was real at this width
  // rather than asserting a property the un-elided build also had.
  const measureChipLabels = () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')!
      const frame = root.querySelector('[data-testid="topology-vpc-frame"]')
      if (!frame) return null
      const chips = Array.from(
        frame.querySelectorAll<HTMLElement>(
          '[data-testid="topology-service-stack"], [data-testid="topology-service-node-icon"], [data-testid="topology-foreign-node"]',
        ),
      )
        // A stack of N is labelled by TYPE, not by a name, so two such stacks
        // reading alike is correct and its title carries no single name.
        .filter(chip => (chip.getAttribute("data-stack-count") ?? "1") === "1")
        .map(chip => ({
          label: chip.querySelector<HTMLElement>('[data-testid="topology-chip-label"]'),
          // Every workload chip's title starts with the resource's full name.
          name: (chip.getAttribute("title") ?? "").split(" · ")[0],
        }))
        .filter((c): c is { label: HTMLElement; name: string } => !!c.label && c.name.length > 0)
      if (chips.length < 2) return null
      const rendered = chips.map(c => ({
        shown: c.label.textContent ?? "",
        name: c.name,
        overflowPx: c.label.scrollWidth - c.label.clientWidth,
      }))
      const sharedLen = (a: string, b: string) => {
        let i = 0
        while (i < a.length && i < b.length && a[i] === b[i]) i += 1
        return i
      }
      // The closest-named pair the frame actually holds — the pair most at risk,
      // found from the DOM rather than named in this file.
      let pair = { a: 0, b: 1, shared: -1 }
      for (let i = 0; i < chips.length; i += 1) {
        for (let j = i + 1; j < chips.length; j += 1) {
          const shared = sharedLen(chips[i].name, chips[j].name)
          if (shared > pair.shared) pair = { a: i, b: j, shared }
        }
      }
      // Write the un-elided name back and ask whether the label's visible box
      // can show ANYTHING past the prefix the pair shares. If it cannot, the two
      // chips paint the same string — the defect, measured, not assumed.
      const unElided = [pair.a, pair.b].map(idx => {
        const c = chips[idx]
        const kept = c.label.textContent
        c.label.textContent = c.name
        void c.label.getBoundingClientRect()
        let sharedPrefixWidthPx = 0
        const textNode = c.label.firstChild
        if (textNode) {
          const range = document.createRange()
          range.setStart(textNode, 0)
          range.setEnd(textNode, Math.min(pair.shared, c.name.length))
          sharedPrefixWidthPx = Math.round(range.getBoundingClientRect().width)
        }
        const out = {
          name: c.name,
          overflowPx: c.label.scrollWidth - c.label.clientWidth,
          sharedPrefixWidthPx,
          visibleWidthPx: c.label.clientWidth,
        }
        c.label.textContent = kept
        void c.label.getBoundingClientRect()
        return out
      })
      return { rendered, sharedPrefix: chips[pair.a].name.slice(0, pair.shared), unElided }
    })
  const chipLabels = await measureChipLabels()
  expect(chipLabels, "the fullscreen VPC frame renders at least two named workload chips").not.toBeNull()
  const shownLabels = chipLabels!.rendered.map(r => r.shown)
  const duplicated = shownLabels.filter((l, i) => shownLabels.indexOf(l) !== i)
  expect(
    duplicated,
    `chips paint the same text ${JSON.stringify(duplicated)} for different resources ${JSON.stringify(
      chipLabels!.rendered.filter(r => duplicated.includes(r.shown)).map(r => r.name),
    )}`,
  ).toEqual([])
  const closestPairShown = chipLabels!.rendered.filter(r => chipLabels!.unElided.some(u => u.name === r.name))
  expect(
    closestPairShown.map(r => r.overflowPx).every(px => px <= 1),
    `the closest-named pair is still clipped after eliding: ${JSON.stringify(closestPairShown)}`,
  ).toBe(true)
  expect(
    chipLabels!.sharedPrefix.length,
    "this payload's closest-named pair shares no prefix, so nothing here is under test",
  ).toBeGreaterThan(6)
  for (const u of chipLabels!.unElided) {
    expect(
      u.overflowPx,
      `"${u.name}" fits its chip un-elided (${u.visibleWidthPx}px), so eliding it proves nothing`,
    ).toBeGreaterThan(0)
    expect(
      u.sharedPrefixWidthPx,
      `un-elided, "${u.name}" shows ${u.visibleWidthPx}px and the prefix it shares is only ${u.sharedPrefixWidthPx}px, so the tail was visible and the chips did not collide`,
    ).toBeGreaterThanOrEqual(u.visibleWidthPx)
  }

  // What the chips stopped saying is said once, here, and the two must tell one
  // story: every shortened label is exactly its full name minus what this badge
  // states. Without that tie, the header could name any prefix at all.
  const namePrefix = fullscreen.getByTestId("topology-vpc-name-prefix")
  await expect(namePrefix).toBeVisible()
  const badgeText = (await namePrefix.textContent()) ?? ""
  const badge = /^(.+)… ×(\d+)$/.exec(badgeText)
  expect(badge, `the frame's prefix badge reads "${badgeText}"`).not.toBeNull()
  const statedPrefix = badge![1]
  // The family prefix backs off to a token boundary EVERY member shares, so it
  // is a prefix of the closest pair's own overlap rather than equal to it.
  expect(
    chipLabels!.sharedPrefix.startsWith(statedPrefix),
    `the badge states "${statedPrefix}" but the closest pair shares "${chipLabels!.sharedPrefix}"`,
  ).toBe(true)
  const shortened = chipLabels!.rendered.filter(r => r.shown.startsWith("…"))
  expect(shortened.length, "no chip in the frame is shortened, so the badge describes nothing").toBeGreaterThanOrEqual(2)
  for (const c of shortened) {
    expect(c.shown, `"${c.name}" is not "${statedPrefix}" plus what its chip shows`).toBe(
      `…${c.name.slice(statedPrefix.length)}`,
    )
  }
  // Counts workloads, which is ≥ the shortened chips: a member inside a depth
  // stack is in the family but has no chip of its own to shorten.
  expect(Number(badge![2]), "the badge counts fewer workloads than there are shortened chips").toBeGreaterThanOrEqual(
    shortened.length,
  )

  await lambda.click()
  const detail = page.getByTestId("topology-service-detail-panel")
  await expect(detail).toBeVisible()
  await expect(detail.getByText("Service inspector")).toBeVisible()
  await expect(detail.getByText("AWS-managed runtime · not VPC-attached").first()).toBeVisible()
  const pathMap = detail.getByTestId("topology-service-path-map")
  await expect(pathMap).toBeVisible()
  await expect(pathMap).toContainText("Neptune graph")
  await expect(pathMap).toContainText("Generation 7 · confirmed TCP")
  await expect(pathMap).toContainText("alon-prod-continuous-traffic")
  await expect(pathMap).toContainText("alon-demo-data-bucket-745783559495")
  // The words, not the graph relationship type. The identifier an operator
  // would paste into Cypher stays on the hover title.
  const s3Segment = pathMap.getByText("S3 access", { exact: true }).first()
  await expect(s3Segment).toBeVisible()
  await expect(s3Segment).toHaveAttribute("title", "S3 access · ACTUAL_S3_ACCESS")
  await expect(pathMap.getByText("ACTUAL_S3_ACCESS")).toHaveCount(0)
  await expect(pathMap.getByTestId("topology-inspector-flow-packet").first()).toBeAttached()
  await expect(detail.getByText("alon-demo-data-bucket-745783559495").last()).toBeVisible()
  await expect(detail).toHaveAttribute("data-expanded", "false")

  const resize = detail.getByTestId("topology-service-detail-resize")
  await resize.click()
  await expect(detail).toHaveAttribute("data-expanded", "true")
  const expandedBox = await detail.boundingBox()
  expect(expandedBox).not.toBeNull()
  expect(expandedBox!.width).toBeGreaterThan(1900)
  await resize.click()
  await expect(detail).toHaveAttribute("data-expanded", "false")

  await page.screenshot({
    path: "test-results/topology-platform-map-fullscreen.png",
    fullPage: false,
  })

  await detail.getByRole("button", { name: "Close service details" }).click()
  await expect(detail).toHaveCount(0)

  const ssmMessagesVpce = fullscreen
    .getByTestId("topology-vpce-rail-chip")
    .filter({ hasText: "SSM Messages" })
    .first()
  await expect(ssmMessagesVpce).toBeVisible()
  await ssmMessagesVpce.click()

  const vpceDetail = page.getByTestId("topology-service-detail-panel")
  await expect(vpceDetail).toBeVisible()
  await expect(vpceDetail.getByText("SSM Messages VPC endpoint").first()).toBeVisible()
  await expect(vpceDetail.getByText("Network boundary · Interface endpoint")).toBeVisible()
  const vpcePathMap = vpceDetail.getByTestId("topology-service-path-map")
  await expect(vpcePathMap).toContainText("SafeRemediate-Test-Frontend-1")
  await expect(vpcePathMap).toContainText("AWS SSM Messages")
  await expect(vpcePathMap.getByText(/^(traffic|AWS service|via VPCE)$/).first()).toBeVisible()
  await expect(vpcePathMap.getByText(/ACTUAL_TRAFFIC|AWS_SERVICE|VPC_ENDPOINT/)).toHaveCount(0)

  const focusedPacket = fullscreen
    .locator('[data-testid="topology-flow-packet"][data-flow-focused="true"]')
    .first()
  await expect(focusedPacket).toBeAttached()
  await expect(focusedPacket.locator("animateMotion, animatemotion")).toHaveAttribute("dur", "4.8s")

  await vpceDetail.getByTestId("topology-service-detail-resize").click()
  await expect(vpceDetail).toHaveAttribute("data-expanded", "true")
  await page.screenshot({
    path: "test-results/topology-platform-map-vpce-expanded.png",
    fullPage: false,
  })
})

// ---------------------------------------------------------------------------
// Inspector identity (2026-09-12 review, defect A). The IGW chip is keyed by the
// `__igw__` canvas anchor so egress edges have one stable target; the chip
// itself carries the gateway's AWS id (data-igw-id). Selecting it used to send
// the ANCHOR to Inventory as a resource id — "InternetGateway __igw__ not found
// in graph" — although the payload named the gateway. This drives the real
// click path and reads the ids off the requests the page actually makes.
// ---------------------------------------------------------------------------
test("the IGW inspector asks Inventory about the gateway's AWS id, never the __igw__ anchor", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000)
  await seedAuthCookie(context)
  await routeSnapshot(page)
  // Every resource read the panel can make, answered "not in this fixture":
  // the assertion is the id in the URL, not the dossier a backend would render.
  const resourceReads: string[] = []
  for (const pattern of [
    "**/api/proxy/inspector/**",
    "**/api/proxy/operational-map/**",
    "**/api/proxy/decision-coverage/**",
  ]) {
    await page.route(pattern, async route => {
      resourceReads.push(route.request().url())
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "not in this fixture" }),
      })
    })
  }
  const everyProxyRequest: string[] = []
  page.on("request", request => {
    if (request.url().includes("/api/proxy/")) everyProxyRequest.push(request.url())
  })

  await page.setViewportSize({ width: 2048, height: 1100 })
  await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  await page.getByRole("tab", { name: "Network topology" }).click()

  const igwChip = page.getByTestId("topology-igw-rail-chip").first()
  await expect(igwChip).toBeVisible()
  // Canvas identity and AWS identity, side by side on the chip.
  await expect(igwChip).toHaveAttribute("data-flow-id", "__igw__")
  const gatewayId = await igwChip.getAttribute("data-igw-id")
  expect(gatewayId).toMatch(/^igw-[0-9a-f]+$/)
  const payloadIgwIds = (SNAPSHOT.vpc_topology.edges.igws as Array<{ id: string }>).map(igw => igw.id)
  expect(payloadIgwIds).toContain(gatewayId)

  await igwChip.click()
  const panel = page.getByTestId("topology-service-detail-panel")
  await expect(panel).toBeVisible()
  await expect(panel.getByTestId("estate-operations-resource-id")).toHaveText(gatewayId!)
  await expect(panel.getByTestId("estate-anchor-identity-unresolved")).toHaveCount(0)

  // Inventory was asked about the gateway by its own id…
  await expect
    .poll(() => resourceReads.filter(url => url.includes("/api/proxy/inspector/")).length)
    .toBeGreaterThan(0)
  for (const url of resourceReads.filter(url => url.includes("/api/proxy/inspector/"))) {
    expect(new URL(url).pathname).toBe(`/api/proxy/inspector/${encodeURIComponent(gatewayId!)}`)
  }
  // …and so were the operational reads. The anchor reached no request at all.
  await expect
    .poll(() => resourceReads.filter(url => url.includes("/api/proxy/operational-map/")).length)
    .toBeGreaterThan(0)
  for (const url of resourceReads.filter(url => url.includes("/api/proxy/operational-map/"))) {
    expect(url).toContain(`resource_id=${gatewayId}`)
  }
  expect(everyProxyRequest.filter(url => url.includes("__igw__"))).toEqual([])
})

// ---------------------------------------------------------------------------
// Logical groups (2026-09-12 review, defect B). The captured payload carries no
// target group, ASG or DB cluster, so this fixture adds ONE target group to the
// drawn VPC, bound by TARGETS edges to two of the payload's own EC2 instances in
// two zones, and asserts the band it lands in: neutral, beside the amber
// placement-gap area, linked to those members, spanning their zones, and never
// drawn inside an AZ x tier cell. Fixture data in a test file; the product code
// renders only what the payload it was handed says.
// ---------------------------------------------------------------------------
test("a logical group is drawn in its own band beside the placement-gap area, linked to its members and never in a cell", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000)
  await seedAuthCookie(context)

  const frameVpc = SNAPSHOT.vpc_topology.vpc_id as string
  const subnetsById = new Map(
    (SNAPSHOT.vpc_topology.subnets as Array<{ id: string; az: string | null }>).map(subnet => [subnet.id, subnet]),
  )
  type PayloadNode = { id: string; name: string; type: string; vpc_id: string | null; subnet_id: string | null }
  const instances = (SNAPSHOT.nodes as PayloadNode[]).filter(
    node => node.type === "EC2" && node.vpc_id === frameVpc && node.subnet_id && subnetsById.get(node.subnet_id)?.az,
  )
  // One member per zone, so the span the band claims is two zones wide.
  const byZone = new Map<string, PayloadNode>()
  for (const instance of instances) {
    const az = subnetsById.get(instance.subnet_id!)!.az!
    if (!byZone.has(az)) byZone.set(az, instance)
  }
  const members = [...byZone.values()]
  expect(members.length, "the captured payload has EC2 instances in at least two zones of the drawn VPC").toBeGreaterThanOrEqual(2)
  const expectedAzs = [...byZone.keys()].sort()

  const targetGroup = {
    id: "arn:aws:elasticloadbalancing:eu-west-1:745783559495:targetgroup/fixture-tg-web/0123456789abcdef",
    name: "fixture-tg-web",
    type: "TargetGroup",
    resource_label: "TargetGroup",
    subnet_id: null,
    subnet_ids: [],
    vpc_id: frameVpc,
    account_id: SNAPSHOT.account_id,
    region: SNAPSHOT.region,
    placement_tier: null,
    score: null,
    stale: null,
    is_jewel: false,
    security_group_ids: [],
  }
  const snapshot = {
    ...SNAPSHOT,
    nodes: [...SNAPSHOT.nodes, targetGroup],
    traffic_edges: [
      ...SNAPSHOT.traffic_edges,
      ...members.map(member => ({
        edge_class: "internal",
        source_id: targetGroup.id,
        target_id: member.id,
        port: null,
        protocol: "TARGETS",
        last_seen: null,
        external_destinations: null,
        evidence_type: "configured",
        evidence_source: "aws_configuration",
        authority_state: "configured",
        path_basis: "configured_route",
      })),
    ],
  }
  await routeSnapshot(page, snapshot)
  await page.setViewportSize({ width: 2048, height: 1100 })
  await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  await page.getByRole("tab", { name: "Network topology" }).click()

  const band = page.getByTestId("topology-logical-group-band").first()
  await expect(band).toBeVisible()
  await expect(band.getByTestId("topology-logical-group-band-header")).toHaveText(
    "Logical groups · members carry the placement (1)",
  )
  await expect(band).toContainText("Not a collector gap")
  await expect(band).not.toContainText("does not say where")
  const entry = band.getByTestId("topology-logical-group")
  await expect(entry).toHaveAttribute("data-node-id", targetGroup.id)
  await expect(entry).toHaveAttribute("data-member-ids", members.map(member => member.id).join("|"))
  await expect(entry).toHaveAttribute("data-scope-azs", expectedAzs.join("|"))
  await expect(entry.getByTestId("topology-logical-group-member")).toHaveCount(members.length)
  await expect(entry.getByTestId("topology-logical-group-scope")).toContainText(`spans ${expectedAzs.join(", ")}`)
  await expect(entry.getByTestId("topology-placement-picker")).toHaveCount(0)

  // Never counted as a placement gap: whatever else this payload leaves
  // unplaced, the amber area does not list the group and its count is its own
  // chips, not the groups.
  const area = page.getByTestId("topology-unplaced-area").first()
  if (await area.count()) {
    await expect(area.locator(`[data-flow-id="${targetGroup.id}"]`)).toHaveCount(0)
    await expect(area).not.toContainText(targetGroup.name)
    const header = (await area.getByTestId("topology-unplaced-area-header").textContent()) ?? ""
    const counted = Number(/\((\d+)\)/.exec(header)?.[1] ?? Number.NaN)
    expect(counted).toBe(await area.getByTestId("topology-service-node-icon").count())
  }

  // Geometry: inside the region frame, below every AZ x tier cell — the group
  // chip is in the band and in no cell.
  const geom = await page.evaluate(({ groupId }) => {
    const bandEl = document.querySelector('[data-testid="topology-logical-group-band"]')
    const region = document.querySelector('[data-testid="topology-region-frame"]')
    const cells = Array.from(
      document.querySelectorAll('[data-testid="topology-cell-glance"], [data-testid="topology-cell-inventory"]'),
    )
    if (!bandEl || !region) return null
    const b = bandEl.getBoundingClientRect()
    return {
      cells: cells.length,
      insideRegion: region.contains(bandEl),
      belowEveryCell: cells.every(cell => cell.getBoundingClientRect().bottom <= b.top + 1),
      chipInCell: cells.some(cell => cell.querySelector(`[data-flow-id="${groupId}"]`) !== null),
      chipInBand: bandEl.querySelector(`[data-flow-id="${groupId}"]`) !== null,
    }
  }, { groupId: targetGroup.id })
  expect(geom).not.toBeNull()
  expect(geom!.cells).toBeGreaterThan(0)
  expect(geom!.insideRegion).toBe(true)
  expect(geom!.belowEveryCell).toBe(true)
  expect(geom!.chipInCell).toBe(false)
  expect(geom!.chipInBand).toBe(true)
})
