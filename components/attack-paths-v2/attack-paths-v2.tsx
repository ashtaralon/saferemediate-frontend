"use client"

// Attack Paths v2 — 3-column redesign.
//
// Per the 2026-05-21 design discussion:
//   Column 1 (left)   — Crown jewel list, click selects a jewel
//   Column 2 (center) — Paths grouped by source type (Lambda / EC2 /
//                       Principal / External Account / etc.), click
//                       selects a path
//   Column 3 (right)  — Per-path analysis: embedded path-filtered
//                       flow map + (sprint 2+) network/identity/data
//                       plane panels + potential damage + hardening
//
// Slice 1 ships the shell + embedded map. Plane panels, damage
// narrative, and hardening land in later slices. The shell is
// deep-linkable via ?system + ?jewel + ?path URL params so operators
// can share links to specific paths.
//
// Data: reuses the existing /api/proxy/identity-attack-paths/{system}
// endpoint and the IdentityAttackPathsResponse shape — no new backend
// for Slice 1. Backend already emits damage_narrative,
// reduction_narrative, risk_reduction, and damage_capability per path;
// Slice 1 surfaces these directly in the right column header.

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Loader2, AlertTriangle, RefreshCw, Maximize2, Minimize2 } from "lucide-react"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { FreshnessBanner } from "@/components/freshness-banner"
import { filterActivePaths, narrowActivePaths } from "@/lib/active-filters"
import type { ActivePathList } from "@/lib/active-filters"
import { CrownJewelListPanel } from "@/components/identity-attack-paths/crown-jewel-list-panel"
import type {
  IdentityAttackPathsResponse,
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"
import { BackToDashboard } from "@/components/back-to-dashboard"
import { PathListGrouped } from "./path-list-grouped"
import { CurrentAccessSourceList } from "./current-access-source-list"
import { ExfilPathListColumn } from "./exfil-path-list-column"
import type { ExfilPayload } from "./exfil-view-v3"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import { classifyIapResponse } from "@/lib/attack-paths/iap-response-health"
import {
  isIapBodyCacheable,
  isServeJewelsAuthoritative,
  resolveJewelPickerList,
  resolveJewelRailPaths,
  resolveRailIapHold,
  shouldShowAttackPathsNotComputed,
} from "@/lib/attack-paths/resolve-jewel-rail"
import { iapHoldTitle } from "@/lib/attack-paths/path-evidence-view"
import {
  isTargetCatalogCacheable,
  targetCatalogTotals,
  targetCatalogToJewelSummaries,
  type TargetCatalog,
} from "@/lib/attack-paths/target-catalog"
import {
  LIFECYCLE_HELD_EXPLANATION,
  NO_TARGET_COVERAGE_CAUSE,
  heldPathsPhrase,
  targetIncompleteCoverageNote,
  targetZeroConclusion,
} from "@/lib/attack-paths/lifecycle-coverage"
import {
  readConvergencePaths,
  selectedPathCount,
  selectedPathCountLines,
  type SelectedPathCount,
} from "@/lib/attack-paths/convergence-readiness"
import { ConvergenceMapLoader } from "./convergence-map-loader"
import { CrownJewelUnionViewLink } from "./crown-jewel-union-view-link"
import { JewelExposurePanel } from "./jewel-exposure-panel"
import { AttackerViewV3 } from "./attacker-view-v3"
// v4 was a wrong-direction experiment (cloned Phase View v0.3's 9-lane
// grid, but Alon meant PER-PATH VIEW's TrafficFlowMap — same renderer
// v3 already uses). Reverted 2026-05-27. v4 file kept parked for ref.
import { ExfilViewV3 } from "./exfil-view-v3"
import { AttackerCanvasV2 } from "./attacker-canvas-v2"
import TopologyView from "./topology-view"
import { TopologyAttackGraph } from "@/components/attack-map/topology-attack-graph"
import { AtlasLateralView } from "./atlas-lateral-view"
import { ZoomMinus1Landing } from "./zoom-minus1-landing"
import { NoSystemsNotice } from "./no-systems-notice"
import type { BlastRadiusPayload } from "./blast-radius-kpi-strip"
import {
  buildModeBarTabs,
  modeBarHighlight,
  type AttackPathsMode,
} from "./mode-bar-tabs"
// Explorer tab now renders the real Traffic Map (same TrafficFlowMap engine the
// Topology tab uses), per Alon 2026-07 — replaced the AttackExplorer
// graph/surface/scorecard lenses. Static import mirrors attacker-view-v3, which
// already pulls TrafficFlowMap into this bundle.
import { ConvergencePathList } from "./convergence-path-list"
import { CrownJewelConvergenceView } from "./crown-jewel-convergence-view"
import { Zoom0FanInPanel } from "./zoom0-fan-in-panel"
import { PathCVEAssessmentPanel } from "./path-cve-assessment-panel"
import { pathCVEsForMode } from "./path-cve-model"
import { useAttackPathReport } from "./use-attack-path-report"
import { useBoundedAutoRetry } from "./use-bounded-auto-retry"
import { buildConvergenceFetchUrl, buildTargetCatalogUrl } from "@/lib/attack-paths/convergence-fetch-url"
import { attackPathReadClaims, scopeClaimsFrom, scopeClaimsKey } from "@/lib/attack-paths/scope-claims"
import { AttackPathSystemIdentity } from "@/lib/attack-paths/read-scope-context"
import type { CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
import { matchConvergencePathId } from "@/lib/attack-paths/iap-to-convergence"
import { useCrownJewelConvergence } from "@/lib/attack-paths/use-crown-jewel-convergence"
import {
  catalogEntries,
  catalogSystemName,
  selectCatalogSystem,
  systemScopeQuery,
  unrepeatedLabels,
  scopedStorageKey,
  useScopedSystemCatalog,
  type CatalogEntry,
} from "@/lib/scoped-system-catalog"
import { useAccountScope } from "@/lib/account-scope-context"
import {
  buildBlastRadiusCacheKey,
  buildBlastRadiusUrl,
  normalizeBlastRadiusScope,
} from "./blast-radius-scope"

/** AP201: soft background-IAP auto-retries per outage (8 s apart) before only the manual Retry remains. */
const IAP_AUTO_RETRY_LIMIT = 3
const IAP_AUTO_RETRY_DELAY_MS = 8000
/** Transport only (a cold backend). A 4xx or a typed hold is an answer and is never auto-retried. */
const isIapTransportError = (error: unknown): boolean =>
  String(error).includes("502") || String(error).includes("504")

function isTrustEnvelope(x: any): x is { provenance: any; result: any } {
  return x && typeof x === "object" && "result" in x && "provenance" in x
}

export function AttackPathsV2({
  systemName: systemNameProp,
  systemKey: systemKeyProp = null,
  systemAccountId: systemAccountIdProp = null,
  embedded = false,
  defaultMode = "attack-path",
  showEmbeddedAttackMap = true,
  mapOnlyPanel = false,
  onOpenRoleSplit,
  onOpenVulnerability,
}: {
  // Embedded mode (dashboard ATTACK PATH tab): `systemName` is supplied by
  // the dashboard and wins over the ?system URL param; the shell renders at a
  // contained height (not full-screen), drops BackToDashboard, and locks the
  // system to the dashboard's selection. Defaults preserve the standalone
  // /attack-paths-v2 route behavior exactly.
  systemName?: string | null
  /** A7 B5: on a v2 install the system's KEY (two systems may share a name, never a key) and, for a tag / source key,
   *  its account. The caller's wins over the page URL's system_key; absent both, every read is by name as before. */
  systemKey?: string | null
  systemAccountId?: string | null
  embedded?: boolean
  // Seeds the view mode when the URL has no explicit ?mode= param. An
  // explicit ?mode= always wins. Default attack-path = Zoom −1 blast-radius
  // landing (no jewel) → Zoom 0 fan-in → Zoom 1 investigation (S4).
  defaultMode?: string
  /** When false, PathAnalysisPanel hides the per-path Attack map block
   *  (AttackPathLaneFlowMap). Dashboard Attack Paths tab may set false;
   *  deep-link ?mode=attacker_map still forces the map-only panel. */
  showEmbeddedAttackMap?: boolean
  /** Deep-link / folded Attacker Map: right column is ONLY the embedded
   *  Attack map block — no mode chips, path report, or evidence. */
  mapOnlyPanel?: boolean
  /** Navigate to the per-resource role-split remediation view (owned by the
   *  page shell, which holds the section-switch state). Threaded to the
   *  attack-path panel's shared-role callout. */
  onOpenRoleSplit?: (roleName: string) => void
  /** Switch the owning shell to Vulnerabilities after the focus query is set. */
  onOpenVulnerability?: (focus: { cveId: string; nodeId: string }) => void
} = {}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const systemsCatalog = useScopedSystemCatalog()
  const lastSystemStorageKey = scopedStorageKey("cyntro:lastSystem", systemsCatalog.scopeKey)

  // URL-driven state — four keys: system (which AWS account/system),
  // jewel (which crown jewel selected), path (which path selected),
  // expand ("path" → hide left+center columns, give path analysis the
  // full screen; null → standard 3-column layout). Deep-linkable so a
  // shared URL preserves the maximize state.
  // useSearchParams returns null on the server / before hydration; the
  // optional chain + ?? guard against that without a useEffect.
  // 2026-05-30 — dropped hardcoded "alon-prod" default. The page now
  // honestly degrades to an empty state when no system is selected
  // (see EmptyState rendering below), and the system picker upstream
  // is the entry point operators land on.
  const requestedSystemName = systemNameProp ?? searchParams?.get("system") ?? null
  // A7 B5: ONE identity -- key AND account -- for every per-system read below: the caller's (props; the system page passes
  // the key it was opened by), else the page URL's (a link built by systemDetailHref / buildAttackPathsV2CjUrl). A tag /
  // source key is one system PER ACCOUNT, so its account rides with it. Absent both, every URL, body and cache key below is
  // byte-identical to before.
  const urlSystemKey = String(searchParams?.get("system_key") || "").trim() || null
  const identityKey = systemKeyProp || urlSystemKey
  const identityAccount = systemKeyProp
    ? (systemAccountIdProp || null)
    : urlSystemKey
      ? (searchParams?.get("account_id") || null)
      : null
  const identityCacheSuffix = identityKey ? `:key=${identityKey}:${identityAccount ?? ""}` : ""
  const selectedJewelId = searchParams?.get("jewel") ?? null
  const selectedPathId = searchParams?.get("path") ?? null
  // Exfil tab uses its own per-path selection (orthogonal to attack-path
  // selection). 2026-05-31: lifted from inside ExfilViewV3 so the center
  // column can render the path list mirroring PathListGrouped.
  const selectedExfilPathId = searchParams?.get("exfil_path") ?? null
  const expandMode = searchParams?.get("expand") ?? null
  // Canvas-expand toggle: hides columns 1+2 so the right-column view
  // (any mode) gets the full screen. Was originally gated to per-path
  // mode only; now available across every view via the toggle in the
  // shared ModeToggle bar. URL param name kept ("expand=path") for
  // bookmark back-compat.
  const isPathExpanded = expandMode === "path"
  // The three-column dashboard is a contained workspace. Expanded mode is a
  // different contract: the side rails are gone and the complete interactive
  // map must participate in the dashboard's normal page scroll. A fixed 78vh
  // shell here creates a second, easy-to-miss scrollbar and clips the canvas
  // when operators use the browser scrollbar.
  const shellHeight = embedded
    ? isPathExpanded
      ? "min-h-[78vh]"
      : "h-[78vh] min-h-[600px]"
    : "h-screen"
  // 2026-05-31 (merge): single "Attack Path" mode replaces the legacy
  // "path" (Per-Path) + "attacker" (Attacker View) modes. The merged
  // panel reads from one facade endpoint and renders Per-Path's header
  // wrapper around Attacker View's canvas. Old ?mode=path and
  // ?mode=attacker URLs are redirected below (router.replace) so deep
  // links keep working. Other modes (exposure, attacker_v2, phase,
  // exfil, topology) are unchanged.
  const modeParam = searchParams?.get("mode") ?? defaultMode
  // v0.3 phase view = the 9-lane attacker-phase Attacker View built
  // 2026-05-22. Renders chains from materialized AttackPath nodes (hop-
  // reified per v0.2 §3) — every line on the canvas comes from a real
  // Neo4j edge, no checkpoint inference. Default route still "path" to
  // avoid disrupting existing operators; phase view opted in via URL.
  // 2026-05-24: added "attacker_v2" — the typed, edge-proven canvas
  // (api/attack_canvas_view.py + components/attack-paths-v2/
  // attacker-canvas-v2.tsx). Lives alongside V1 "attacker" for
  // side-by-side comparison; V1 stays the default until V2 is
  // proven correct + explicit deprecation sign-off.
  // 2026-05-25: added "exfil" — the EXFIL view (PRD same date) that
  // BFS-forwards from the crown jewel to surface every door the
  // data can leave through. Distinct mental model from the
  // attacker/per-path/exposure tabs (which BFS backwards toward
  // entry points). See components/attack-paths-v2/exfil-view-v3.tsx
  // (greenfield rebuild 2026-05-26 — single dynamic TFM, no static grid).
  const viewMode: "attack-path" | "exposure" | "attacker_v2" | "phase" | "exfil" | "topology" | "lateral" | "attacker_map" | "convergence" =
    // back-compat: mode renamed explorer -> attacker_map (2026-07) when the
    // Explorer traffic-map was replaced by the Attacker Map. Old deep links
    // still land here.
    modeParam === "attacker_map" || modeParam === "explorer"
      ? "attacker_map"
      : modeParam === "exposure"
      ? "exposure"
      : modeParam === "convergence"
        ? "convergence"
      : modeParam === "attacker_v2"
        ? "attacker_v2"
        : modeParam === "phase"
          ? "phase"
          : modeParam === "exfil"
            ? "exfil"
            : modeParam === "topology"
              ? "topology"
              : modeParam === "lateral"
                ? "lateral"
                : // Legacy "path" / "attacker" both collapse into the
                // merged "attack-path" (URL gets rewritten by the
                // useEffect below so deep links stop showing the old
                // param values).
                "attack-path"

  // The right column is reused across every map mode. Browsers preserve its
  // scrollTop when React swaps the child view, which made Lateral or Exfil
  // appear to open halfway down after leaving another map. Treat each mode,
  // jewel, and expand state as a fresh canvas viewport.
  const mainScrollRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (embedded && isPathExpanded) {
      mainScrollRef.current?.scrollIntoView({ block: "start", behavior: "auto" })
      return
    }
    mainScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" })
  }, [embedded, viewMode, selectedJewelId, isPathExpanded])

  // Beta gate (2026-06-11) — the typed-DTO "Attack Map" canvas is an
  // engineering comparison surface, not an operator tab. Hidden from
  // the default tab bar; reachable via ?beta=1 (and kept visible when
  // a deep link already points at it so the URL doesn't strand).
  const showBeta = searchParams?.get("beta") === "1" || viewMode === "attacker_v2"

  // 2026-05-30 v3 — auto-resolve which system to load when no ?system=
  // param is in the URL. Precedence:
  //   1. scope-keyed localStorage — the system the operator
  //      was on last time. Single biggest UX win — "click Attack Paths
  //      v2 from the sidebar, land on the system you were just on".
  //   2. First system in the systems API response.
  //   3. Inline picker below (operator picks manually).
  //
  // localStorage is also WRITTEN by the side-effect below whenever
  // systemName changes — so each successful visit updates the memory.
  //
  // Robust to backend field-name variants (name / SystemName /
  // system_name — all three have shipped over time).
  const [availableSystems, setAvailableSystems] = useState<string[]>([])
  // A7 B5: the catalogue's rows as identities -- a page opened by KEY is resolved by its key (and account), never by a
  // name several systems share.
  const [catalogIdentities, setCatalogIdentities] = useState<CatalogEntry[]>([])
  const [autoRedirectDone, setAutoRedirectDone] = useState(false)
  // D10: why the catalogue lists nothing when it could not be read (an HTTP status / "unreachable"); null when it answered.
  const [catalogFailure, setCatalogFailure] = useState<string | null>(null)
  // A URL, prop, or remembered value is not read authority. Until it appears
  // in the scoped catalog, every downstream data hook receives null and
  // therefore cannot issue a per-system request.
  const keyedSelection = identityKey
    ? selectCatalogSystem(
        { system: requestedSystemName, systemKey: identityKey, accountId: identityAccount },
        catalogIdentities,
      )
    : null
  const systemName = identityKey
    ? (keyedSelection && keyedSelection.kind === "SELECTED" ? keyedSelection.entry.name : null)
    : catalogSystemName(requestedSystemName, availableSystems)

  // Write the current system to localStorage so the next visit
  // resumes here.
  useEffect(() => {
    if (!catalogSystemName(systemName, availableSystems)) return
    try {
      localStorage.setItem(lastSystemStorageKey, systemName!)
    } catch {
      /* private mode / quota */
    }
  }, [availableSystems, lastSystemStorageKey, systemName])

  // Legacy mode-param redirect (2026-05-31 merge). Old deep links
  // (?mode=path or ?mode=attacker) silently rewrite to the unified
  // ?mode=attack-path so bookmarks keep working. router.replace so the
  // back-button doesn't trap the operator on the rewrite URL.
  useEffect(() => {
    if (modeParam === "path" || modeParam === "attacker") {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      params.set("mode", "attack-path")
      router.replace(`${pathname}?${params.toString()}`)
    }
  }, [modeParam, searchParams, router, pathname])

  useEffect(() => {
    // Always fetch the systems list — the switcher in the header
    // needs it even when systemName IS set, so the operator can
    // swap to a different system without leaving the page.
    if (!systemsCatalog.ready) return
    if (!systemsCatalog.url) {
      setAvailableSystems([])
      setCatalogIdentities([])
      setCatalogFailure(null)
      setAutoRedirectDone(true)
      return
    }
    const catalogUrl = systemsCatalog.url
    let aborted = false
    ;(async () => {
      try {
        const r = await fetch(catalogUrl)
        if (!r.ok) {
          if (!aborted) {
            setCatalogFailure(`HTTP ${r.status}`)
            setAutoRedirectDone(true)
          }
          return
        }
        const j = await r.json()
        if (aborted) return
        setCatalogFailure(null)
        const rawArr = Array.isArray(j?.systems) ? j.systems : []
        const names: string[] = rawArr
          .map((s: any): string =>
            typeof s === "string"
              ? s
              : (s?.name as string) ?? (s?.SystemName as string) ?? (s?.system_name as string) ?? "",
          )
          .filter(Boolean)
          .sort()
        setAvailableSystems(names)
        setCatalogIdentities(catalogEntries(j, systemsCatalog.customerId))
        // Auto-redirect only fires when no system is in the URL.
        const requested = catalogSystemName(systemName, names)
        if (requested) {
          setAutoRedirectDone(true)
          return
        }
        // T10 S1: a URL that already names a system -- even one several accounts serve, or one outside this scope -- is
        // never redirected away from. Redirecting it to a default would open ANOTHER system, and redirecting a repeated
        // label to itself would loop.
        if (requestedSystemName) {
          setAutoRedirectDone(true)
          return
        }

        // Pick the target system: last-used (if still in the list) →
        // first available. localStorage-resume is the dominant UX
        // expectation — operators don't want a different system every
        // time they refresh.
        let target: string | undefined
        try {
          const last = localStorage.getItem(lastSystemStorageKey)
          target = catalogSystemName(last, names) || undefined
        } catch {
          /* private mode */
        }
        // The first label exactly one account serves -- never the first of several accounts' systems.
        if (!target) target = unrepeatedLabels(names)[0]

        if (target) {
          const params = new URLSearchParams(searchParams?.toString() ?? "")
          params.set("system", target)
          router.replace(`${pathname}?${params.toString()}`)
        } else {
          setAutoRedirectDone(true)
        }
      } catch {
        if (!aborted) {
          setCatalogFailure("unreachable")
          setAutoRedirectDone(true)
        }
      }
    })()
    return () => {
      aborted = true
    }
  }, [lastSystemStorageKey, pathname, requestedSystemName, router, searchParams, systemName, systemsCatalog.ready, systemsCatalog.url, systemsCatalog.customerId])

  // Progressive load (P0 perf):
  //   1. /targets — inventory-first target catalog (AP3-104): every in-scope
  //      crown-jewel target with an explicit state, zero paths included →
  //      left rail + shell
  //   2. by-crown-jewel/summary per selected jewel → path rail (critical)
  //   3. full IAP 5×5 — background only; never bricks the path rail on 502
  // (Render wake happens via the catalog fetch + keep-warm cron — don't fire
  // the full keep-warm sweep from the browser on every tab open.)
  // AP201 (R11): the operator's tenant / account claims travel with every per-jewel read and key its client cache,
  // so a control plane with several workload accounts is asked for the selected one and a cached catalog for one
  // account is never painted for another. A7 B5: a page opened by key also names ONE system (key + its account).
  // The same account scope feeds the blast-radius read below.
  const accountScope = useAccountScope()
  const selectedClaims = scopeClaimsFrom(accountScope)
  // AP201 review S1: THE one claim rule (attackPathReadClaims); every component read gets the same claims from
  // <AttackPathSystemIdentity> below (useAttackPathReadClaims), so no read names another account than this banner.
  const scopeClaims = attackPathReadClaims(accountScope, { systemKey: identityKey, systemAccountId: identityAccount })
  // When the system key's own account overrides a different selected account, the reads are scoped to the KEY's
  // account (appendScopeClaims) -- the page says so instead of silently ignoring the selection.
  const accountOverride = scopeClaims.systemAccountId && selectedClaims.accountId
    && scopeClaims.systemAccountId !== selectedClaims.accountId
    ? { readAccount: scopeClaims.systemAccountId, selectedAccount: selectedClaims.accountId }
    : null
  const scopeClaimsCacheKey = scopeClaimsKey(scopeClaims)
  // Review S2: the selected account keys every client cache it reaches; with no selection the keys stay as before.
  const selectedClaimsCacheSuffix = selectedClaims.accountId ? `:${scopeClaimsCacheKey}` : ""
  const jewelsUrl = systemName ? buildTargetCatalogUrl(systemName, scopeClaims) : null
  const {
    data: jewelsRaw,
    loading: jewelsLoading,
    error: jewelsError,
    hold: jewelsHold,
    isStale: jewelsIsStale,
    retry: retryJewels,
  } = useCachedFetch<TargetCatalog>(jewelsUrl, {
    cacheKey: `ap-targets:${systemName}${scopeClaimsCacheKey ? `:${scopeClaimsCacheKey}` : ""}`,
    maxStaleMs: 10 * 60 * 1000,
    // Never SWR-paint a cached NOT_READY / empty catalog — that is how the
    // rail stuck on "No crown jewels · showing cached" after SERVE recovered.
    isCacheable: isTargetCatalogCacheable,
  })

  // Full IAP fan-out is OPTIONAL enrichment only — never gate the path rail.
  // Cold alon-prod routinely exceeds the 55s proxy abort → HTTP 502 and used
  // to brick the middle column. Paths come from by-crown-jewel/summary
  // (materialized AttackPath rows). Keep a background 5×5 fetch for when it
  // succeeds (richer severity / damage), but do not block or hard-error on it.
  const fetchUrl = systemName
    // AP201 T-14: the IAP envelope carries THE page's claims too (selected account; a key's own account wins). With no
    // selection and no key the URL is byte-identical; with a key only it equals the old systemScopeQuery spelling.
    ? `/api/proxy/identity-attack-paths/${encodeURIComponent(systemName)}?envelope=true&max_jewels=12&max_paths_per_jewel=8${scopeClaimsCacheKey ? `&${scopeClaimsCacheKey}` : ""}`
    : null
  const {
    data: rawData,
    loading: isLoading,
    error: _iapBackgroundError,
    hold: iapFetchHold,
    isStale: iapIsStale,
    retry: retryFullIap,
  } = useCachedFetch<any>(fetchUrl, {
    cacheKey: `iap-v2:5x5:${systemName}${identityCacheSuffix}${selectedClaimsCacheSuffix}`,
    // The hook already fails closed on typed refusals and semantic_status
    // holds (returned as `hold`). This also refuses to persist a legacy
    // 200 `error` with no rows, from a backend that predates semantic_status.
    isCacheable: isIapBodyCacheable,
  })

  // The full IAP fan-out above is optional enrichment and can legitimately
  // return an empty path array while the materialized blast-radius summary is
  // available. Use the same authoritative totals as Zoom -1 for the shell
  // header so operators never see "0 paths" beside a non-zero overview.
  //
  // The compose is per-tenant and per-account/region: the serving graph
  // refuses to infer scope and returns 503 on an unscoped GET. Bind the
  // fetch (and its SWR cache key) to the active Estate scope so a cached
  // response for one tenant/account can never paint another's session.
  const blastRadiusScope = normalizeBlastRadiusScope(accountScope)
  const blastRadiusUrl = buildBlastRadiusUrl(systemName ?? "", blastRadiusScope)
  const { data: blastRadiusData } = useCachedFetch<BlastRadiusPayload>(blastRadiusUrl, {
    cacheKey: buildBlastRadiusCacheKey(systemName ?? "", blastRadiusScope),
  })
  // Intentionally ignore _iapBackgroundError for the path rail UI.

  const retry = () => {
    retryJewels()
    retryFullIap()
  }

  // Catalog rows → rail summaries. Pure adapter; a zero-path target keeps
  // its state (no severity, no score) instead of being filtered away.
  const liteJewels: CrownJewelSummary[] = useMemo(
    () => targetCatalogToJewelSummaries(jewelsRaw),
    [jewelsRaw],
  )
  const targetCatalogServeState = jewelsRaw?.serve_state ?? null
  const targetCatalogNotReadyReason = jewelsRaw?.not_ready_reason ?? null
  const targetCatalogCounts = jewelsRaw?.counts ?? null
  const catalogTotals = useMemo(() => targetCatalogTotals(jewelsRaw), [jewelsRaw])

  // Envelope unwrap. Backend wraps in {provenance, result}; we want the
  // result. Proxy stale fallback may also stamp fromStaleCache on the
  // outer object — keep that visible for freshness UX.
  const data: IdentityAttackPathsResponse | null = useMemo(() => {
    if (!rawData) return null
    return isTrustEnvelope(rawData) ? rawData.result : rawData
  }, [rawData])

  const serveJewelsOk = isServeJewelsAuthoritative(jewelsRaw, jewelsError)

  // Soft auto-retry of background IAP only — never surfaces in the path rail.
  // AP201: bounded (use-bounded-auto-retry.ts). Unbounded, a failed backend was re-read every 8 s for as long as the
  // page stayed open (measured: 4 reads in 25 s, 25 in a session); after the limit the manual Retry remains.
  useBoundedAutoRetry({
    error: _iapBackgroundError,
    data: rawData,
    loading: isLoading,
    retry: retryFullIap,
    limit: IAP_AUTO_RETRY_LIMIT,
    delayMs: IAP_AUTO_RETRY_DELAY_MS,
    isTransient: isIapTransportError,
    // a new system is a new read with its own budget
    resetKey: fetchUrl,
  })

  const fromProxyStale =
    Boolean((rawData as { fromStaleCache?: boolean } | null)?.fromStaleCache) ||
    Boolean((data as { fromStaleCache?: boolean } | null)?.fromStaleCache)

  // The SERVE catalog is authoritative once loaded (including empty and
  // NOT_READY). Full IAP jewels only before the catalog responds or when it
  // failed — never overwrite SERVE path_count with IAP phantoms. Zero-path
  // targets stay listed with their explicit state (AP3-104): hiding them
  // made "never considered" and "proved unreachable" both look like absence.
  const jewels: CrownJewelSummary[] = useMemo(
    () =>
      resolveJewelPickerList({
        // AP201 (M14): one authority predicate. An unreadable 200 body is a failed catalog here too, so the IAP
        // jewels may stand in exactly as they do after an HTTP failure.
        serveJewels: serveJewelsOk ? liteJewels : null,
        serveJewelsError: jewelsError,
        iapJewels: data?.crown_jewels ?? null,
      }),
    [serveJewelsOk, liteJewels, jewelsError, data?.crown_jewels],
  )

  // Trust gate: distinguish a real "0 crown jewels" from a cold/failed
  // routing compute that returned HTTP 200 with an error envelope (jewels
  // are derived from the Neo4j graph, so an empty list is only meaningful
  // when the graph source was actually read). Prevents the false-empty
  // "No crown jewels defined for this system yet" on a slow/erroring
  // backend — CLAUDE.md rule #1. See lib/attack-paths/iap-response-health.
  const iapHealth = useMemo(
    () => classifyIapResponse(rawData, data),
    [rawData, data],
  )
  // Held / unavailable IAP beside an empty, IAP-sourced rail: the rail names
  // the hold instead of "No crown jewels detected".
  const railIapHold = useMemo(
    () =>
      resolveRailIapHold({
        serveJewelsRaw: jewelsRaw,
        serveJewelsError: jewelsError,
        jewelsEmpty: jewels.length === 0,
        iapBody: rawData,
        fetchHold: iapFetchHold,
        catalogHold: jewelsHold,
      }),
    [jewelsRaw, jewelsError, jewels.length, rawData, iapFetchHold, jewelsHold],
  )
  // Client-side stale-node gate. Runs on EVERY render — fresh AND
  // localStorage-SWR-cached. Drops paths whose nodes carry
  // is_active=false. The backend already filters on fresh responses;
  // this catches the case where useCachedFetch surfaces a stale IAP
  // response from before backend hardening landed (e.g. on a 502).
  // See lib/active-filters.ts and
  // feedback_frontend_cache_can_serve_stale_phantoms.md.
  const allPaths: ActivePathList<IdentityAttackPath> = useMemo(
    () => filterActivePaths(data?.paths ?? []),
    [data?.paths],
  )

  // Paths still loading for a selected jewel — center column spinner.
  // Prefer by-crown-jewel summary (fast, materialized) over waiting on the
  // full IAP fan-out that routinely 502s on alon-prod cold compute.
  const showingStale =
    fromProxyStale || iapIsStale || jewelsIsStale

  // AP201 (M13) + review S14: the header's totals are the CATALOG's only. The blast-radius totals are another model over
  // another population (target-catalog.ts) and no longer stand in while the catalog loads. While it loads the header reads
  // "N loaded paths · M listed jewels" when the IAP list has already answered with paths, else "Loading crown-jewel
  // targets…"; a NOT_READY, failed or unreadable catalog shows no count.
  const displayedPathCount = catalogTotals?.pathCount
  const displayedReachableJewelCount = catalogTotals?.reachableTargetCount


  // Paths for the currently-selected jewel. Empty list = no jewel
  // selected or no paths to it. narrowActivePaths preserves the
  // ActivePathList brand through the filter so the downstream
  // PathListGrouped prop type still matches.
  const selectedJewel = useMemo(
    () =>
      jewels.find(
        (j) =>
          j.id === selectedJewelId ||
          (selectedJewelId != null && j.canonical_id === selectedJewelId),
      ) ?? null,
    [jewels, selectedJewelId],
  )
  // AP187: when the selected target's coverage is not complete, the header's count is its listed paths only and says
  // so, with the row's own note (held, withheld, unreadable, coverage incomplete) beside it.
  const selectedCoverageNote = selectedJewel
    ? targetIncompleteCoverageNote(selectedJewel.target_state, selectedJewel.coverage_cause ?? NO_TARGET_COVERAGE_CAUSE)
    : null
  // AP188 (F4 P1): the rail's own Collapse notifies the page, so the aside itself narrows (it stayed 320px before).
  const [railCollapsed, setRailCollapsed] = useState(false)
  const selectedJewelHasPaths = Number(selectedJewel?.path_count ?? 0) > 0
  // AP182/AP183: a cause recorded on the selected target (lifecycle-held, a withheld receipt code, unreadable evidence)
  // means its coverage is incomplete. It replaces both a "no route" claim and the missing-manifest copy. A target with
  // nothing recorded keeps the established copy. AP195/AP196: one mapping with the path list and the Topology view
  // (targetZeroConclusion), and a catalog count that could not be read is never "no route" either.
  const currentAccessZero =
    selectedJewel && !selectedJewelHasPaths
      ? targetZeroConclusion(
          selectedJewel.target_state,
          selectedJewel.coverage_cause ?? NO_TARGET_COVERAGE_CAUSE,
          selectedJewel.catalog_path_count !== null,
        )
      : null

  const iapJewelPaths: ActivePathList<IdentityAttackPath> = useMemo(() => {
    if (!selectedJewelId) return filterActivePaths([])
    return narrowActivePaths(allPaths, (p) => {
      if (p.crown_jewel_id === selectedJewelId) return true
      if (selectedJewel?.id && p.crown_jewel_id === selectedJewel.id) return true
      if (selectedJewel?.canonical_id && p.crown_jewel_id === selectedJewel.canonical_id)
        return true
      return false
    })
  }, [selectedJewelId, selectedJewel, allPaths])

  // Always load materialized paths for the selected jewel — this is what
  // keeps the middle rail usable when full IAP returns HTTP 502.
  const {
    data: jewelSummaryConvergence,
    loading: jewelSummaryLoading,
    retrying: jewelSummaryRetrying,
    attempts: jewelSummaryAttempts,
    error: jewelSummaryError,
    settled: jewelSummarySettled,
    retry: retryJewelSummary,
  } = useCrownJewelConvergence(
    selectedJewelHasPaths && selectedJewel ? systemName : null,
    selectedJewelHasPaths ? selectedJewel : null,
    selectedPathId,
    [...allPaths],
    { systemKey: identityKey, systemAccountId: identityAccount },
  )

  const jewelRail = useMemo(
    () =>
      resolveJewelRailPaths({
        serve: jewelSummaryConvergence,
        serveError: jewelSummaryError,
        jewel: selectedJewel,
        iapPaths: [...iapJewelPaths],
      }),
    [
      jewelSummaryConvergence,
      jewelSummaryError,
      serveJewelsOk,
      selectedJewel,
      iapJewelPaths,
    ],
  )

  const jewelPaths: ActivePathList<IdentityAttackPath> = useMemo(
    () => filterActivePaths(jewelRail.paths),
    [jewelRail.paths],
  )

  const pathsPending =
    Boolean(selectedJewelId) &&
    selectedJewelHasPaths &&
    jewelPaths.length === 0 &&
    jewelRail.source === "none" &&
    (jewelSummaryLoading || jewelSummaryRetrying)

  const pathsHardError =
    Boolean(selectedJewelId) &&
    jewelPaths.length === 0 &&
    !pathsPending &&
    jewelRail.source === "none" &&
    Boolean(jewelSummaryError) &&
    // AP201 (M4): a settled answer (typed hold, final 4xx) ends at attempt 1 and is never retried; waiting for
    // attempt 3 left the rail on "Loading paths…" with no Retry.
    (jewelSummaryAttempts >= 3 || jewelSummarySettled)

  // IAP only when SERVE unreachable — label as non-authoritative.
  const pathsFromIapFallback = jewelRail.source === "iap_fallback"

  const pathsWarming =
    Boolean(selectedJewelId) &&
    selectedJewelHasPaths &&
    jewelPaths.length === 0 &&
    !pathsHardError &&
    jewelRail.source === "none" &&
    (jewelSummaryLoading || jewelSummaryRetrying || Boolean(jewelSummaryError))

  // AP188: the header's count for the selected target, from the rail's own read state. A pending, failed, held or
  // not-ready read is never a zero, and the catalog's count is said as the catalog's, never as loaded detail.
  const selectedCount: SelectedPathCount | null = selectedJewel
    ? selectedPathCount({
        jewel: selectedJewel,
        coverageNote: selectedCoverageNote,
        railSource: jewelRail.source,
        listedCount: jewelPaths.length,
        serve: jewelSummaryConvergence,
        loading: pathsPending || pathsWarming,
        failed: pathsHardError,
        error: jewelSummaryError,
      })
    : null
  // AP189: a NOT_READY serve answer makes the path list's empty state "not ready", never "no attack paths today".
  const selectedAnswerReading = jewelRail.source === "serve" ? readConvergencePaths(jewelSummaryConvergence) : null
  const selectedAnswerNotReady = selectedAnswerReading?.kind === "not_ready"
  // AP201 (M6): a listed answer that is not every path (coverage partial, truncated, ...) makes an empty list
  // "incomplete", never "no attack paths today".
  const selectedAnswerPartial = selectedAnswerReading?.kind === "paths" ? selectedAnswerReading.partial : null

  // ─── Exfil-paths fetch (parent-owned) ────────────────────────────
  // Single source of truth for both the center-column rail
  // (ExfilPathListColumn) and the canvas (ExfilViewV3 — receives via
  // props). Gated on viewMode === "exfil" + a jewel id: every other
  // mode skips the fetch (network savings — exfil costs include the
  // ATLAS chain enrichment, ~200-400ms).
  const exfilEnabled = viewMode === "exfil" && !!systemName && !!selectedJewelId
  const exfilRequestBody = useMemo(
    () =>
      JSON.stringify({
        system_name: systemName ?? "",
        // A7 B5: the key names ONE system (the backend's optional body field); absent, the body is byte-identical.
        ...(identityKey ? { system_key: identityKey } : {}),
        jewel_id: selectedJewelId ?? "",
        include_capable: true,
        include_observed: true,
        max_destinations: 50,
        // Exfil starts after compromise of the crown jewel; the ATLAS
        // ingress simulation belongs to the Lateral tab. Keeping it out of
        // this first render prevents N path-engine calls from blocking the
        // destination map.
        include_atlas: false,
        include_details: false,
        atlas_max_hops: 6,
      }),
    [systemName, selectedJewelId, identityKey],
  )
  const exfilFetchInit = useMemo<RequestInit>(
    () => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: exfilRequestBody,
    }),
    [exfilRequestBody],
  )
  const {
    data: exfilData,
    loading: exfilLoading,
    error: exfilError,
    retry: exfilRetry,
    retrying: exfilRetrying,
    attempt: exfilAttempt,
  } = useRetryFetch<ExfilPayload>(
    exfilEnabled ? "/api/proxy/attack-chain/exfil-paths" : null,
    {
      fetchInit: exfilFetchInit,
      refetchKey: `exfil:${systemName}:${selectedJewelId ?? ""}${identityCacheSuffix}`,
      maxRetries: 2,
      initialDelayMs: 1000,
    },
  )

  const convergenceFetchUrl = useMemo(() => {
    if (viewMode !== "convergence" || !systemName || !selectedJewel || !selectedJewelHasPaths) return null
    return buildConvergenceFetchUrl(systemName, selectedJewel, scopeClaims)
    // Review S9: the URL carries the claims, so the claims are a dependency (one string of all four).
  }, [viewMode, systemName, selectedJewel, selectedJewelHasPaths, scopeClaimsCacheKey])

  const {
    data: convergenceData,
    loading: convergenceLoading,
    error: convergenceError,
    retry: convergenceRetry,
  } = useCachedFetch<CrownJewelConvergence>(convergenceFetchUrl, {
    cacheKey: `cj-convergence:${systemName}:${selectedJewelId ?? ""}${identityCacheSuffix}${selectedClaimsCacheSuffix}`,
  })

  const convergenceSource = useMemo((): "live" | "fallback" => {
    if (convergenceData?.paths?.length) return "live"
    if (jewelSummaryConvergence?.paths?.length) return "live"
    return "fallback"
  }, [convergenceData, jewelSummaryConvergence])

  // Live SERVE / summary only. Never paint IAP-synthesized topology —
  // Zoom0 already refuse-draws on fallback; convergence view must match
  // that delete-not-fallback contract.
  const effectiveConvergenceData = useMemo((): CrownJewelConvergence | null => {
    if (convergenceData?.paths?.length) return convergenceData
    if (jewelSummaryConvergence?.paths?.length) return jewelSummaryConvergence
    return null
  }, [convergenceData, jewelSummaryConvergence])

  const convergencePathId = useMemo(
    () =>
      effectiveConvergenceData
        ? matchConvergencePathId(
            effectiveConvergenceData.paths,
            selectedPathId,
            jewelPaths,
          )
        : null,
    [effectiveConvergenceData, selectedPathId, jewelPaths],
  )

  // Auto-select first convergence path when entering the tab.
  useEffect(() => {
    if (viewMode !== "convergence") return
    if (!effectiveConvergenceData?.paths?.length) return
    if (convergencePathId) return
    const firstId = effectiveConvergenceData.paths[0]?.path_id
    if (firstId) setUrl({ path: firstId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, effectiveConvergenceData, convergencePathId])

  // Auto-select the first exfil path when data arrives + URL doesn't
  // already specify one (or specifies a stale id no longer in the
  // list). Backend pre-sorts paths[] highest-traffic first, so this
  // matches the auto-pick behavior ExfilViewV3 had internally before
  // 2026-05-31 when the fetch was lifted up here.
  useEffect(() => {
    if (viewMode !== "exfil") return
    if (!exfilData?.paths) return
    if (exfilData.paths.length === 0) return
    if (
      selectedExfilPathId &&
      exfilData.paths.some((p) => p.path_id === selectedExfilPathId)
    )
      return
    const firstId = exfilData.paths[0]?.path_id
    if (firstId) {
      setUrl({ exfilPath: firstId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setUrl
    // intentionally not in deps (would re-run every URL change and
    // re-pick when it shouldn't).
  }, [viewMode, exfilData, selectedExfilPathId])

  // S4: do NOT auto-select the first crown jewel. No ?jewel= = Zoom −1
  // system blast-radius landing. Operators pick a jewel deliberately
  // for Zoom 0 fan-in (Alon / PRD-attacker-lens-three-zoom).
  // Clear stale ?jewel= (removed/renamed OR SERVE-empty projection) so
  // Zoom −1 can render — previously jewels.length === 0 early-returned
  // and left a phantom jewel id that tripped the IAP "not computed" gate.
  useEffect(() => {
    if (!selectedJewelId || jewelsLoading) return
    const serveSettled = jewelsRaw != null || Boolean(jewelsError)
    if (!serveSettled && (isLoading || !rawData)) return
    const stillThere = jewels.some(
      (j) =>
        j.id === selectedJewelId ||
        (j.canonical_id != null && j.canonical_id === selectedJewelId),
    )
    if (stillThere) return
    setUrl({ jewel: null, path: null, exfilPath: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setUrl
  }, [
    jewels,
    selectedJewelId,
    jewelsLoading,
    jewelsRaw,
    jewelsError,
    isLoading,
    rawData,
  ])

  // The selected path object, if any. A stale deep link temporarily resolves
  // to null while the current generation settles; the effect below then
  // clears it and restores the jewel fan-in instead of drawing fake blanks.
  const selectedPath = useMemo(() => {
    if (!selectedPathId) return null
    return (
      jewelPaths.find(
        (p) => p.id === selectedPathId || p.attack_path_id === selectedPathId,
      ) ?? null
    )
  }, [selectedPathId, jewelPaths])

  // A bookmarked path id belongs to one immutable generation and can disappear
  // after a valid rebuild. Once the selected jewel's current path set has
  // settled, clear a stale id instead of rendering a blank "FROM — Resource"
  // dossier. Other modes may then apply their normal first-path selection.
  useEffect(() => {
    if (!selectedPathId || !selectedJewelId) return
    if (pathsPending || pathsWarming || jewelSummaryLoading || jewelSummaryRetrying) return
    if (selectedPath) return
    setUrl({ path: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setUrl is URL-state
    // plumbing whose identity changes with the current search params.
  }, [
    selectedPathId,
    selectedJewelId,
    selectedPath,
    pathsPending,
    pathsWarming,
    jewelSummaryLoading,
    jewelSummaryRetrying,
  ])

  const {
    report: selectedPathReport,
    loading: selectedPathReportLoading,
    error: selectedPathReportError,
    retry: retrySelectedPathReport,
  } = useAttackPathReport(selectedPath)

  const openVulnerability = (cveId: string, nodeId: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    params.set("system", systemName ?? "")
    params.set("view", "cves")
    params.set("cve", cveId)
    params.set("asset", nodeId)
    params.set("vulnerability_focus", "1")
    if (onOpenVulnerability) {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      onOpenVulnerability({ cveId, nodeId })
      return
    }

    const standalone = new URLSearchParams()
    if (systemName) standalone.set("system", systemName)
    standalone.set("view", "cves")
    standalone.set("cve", cveId)
    standalone.set("asset", nodeId)
    standalone.set("vulnerability_focus", "1")
    router.push(`/?${standalone.toString()}`)
  }

  // Auto-select the highest-traffic path when a jewel is selected and no
  // path id is in the URL — EXCEPT on Attack Path mode, where Zoom 0
  // (jewel fan-in) is the default until the operator picks a path
  // (PRD-attacker-lens-three-zoom S1).
  useEffect(() => {
    if (viewMode === "convergence") return
    if (viewMode === "attack-path") return
    if (viewMode === "lateral") return
    if (!selectedJewelId) return
    if (selectedPathId) return
    if (jewelPaths.length === 0) return
    // Rank by sum(hit_count) on observed edges. Ties broken by
    // severity score then hop count.
    const ranked = [...jewelPaths].sort((a, b) => {
      const ha = (a.edges ?? []).reduce(
        (s, e) => s + (e.is_observed ? e.hit_count ?? 0 : 0),
        0,
      )
      const hb = (b.edges ?? []).reduce(
        (s, e) => s + (e.is_observed ? e.hit_count ?? 0 : 0),
        0,
      )
      if (hb !== ha) return hb - ha
      const sa = a.severity?.overall_score ?? 0
      const sb = b.severity?.overall_score ?? 0
      if (sb !== sa) return sb - sa
      return (a.hop_count ?? 0) - (b.hop_count ?? 0)
    })
    if (ranked[0]) {
      // Use the URL setter so deep links + back-button restore work.
      setUrl({ path: ranked[0].id })
    }
    // setUrl intentionally excluded from deps — it closes over the
    // current URL params so its identity changes on every render; we
    // only want to trigger when jewel selection or path-set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJewelId, selectedPathId, jewelPaths, viewMode])

  // Selection helpers — write to URL so deep links work and the
  // browser back button restores state.
  const setUrl = (next: { jewel?: string | null; path?: string | null; exfilPath?: string | null; expand?: string | null; mode?: string | null }) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (next.jewel !== undefined) {
      if (next.jewel === null) params.delete("jewel")
      else params.set("jewel", next.jewel)
    }
    if (next.path !== undefined) {
      if (next.path === null) params.delete("path")
      else params.set("path", next.path)
    }
    if (next.exfilPath !== undefined) {
      if (next.exfilPath === null) params.delete("exfil_path")
      else params.set("exfil_path", next.exfilPath)
    }
    if (next.expand !== undefined) {
      if (next.expand === null) params.delete("expand")
      else params.set("expand", next.expand)
    }
    if (next.mode !== undefined) {
      if (next.mode === null || next.mode === "path") params.delete("mode")
      else params.set("mode", next.mode)
    }
    // Always preserve system param across navigations.
    if (!params.get("system") && systemName) params.set("system", systemName)
    router.replace(`${pathname}?${params.toString()}`)
  }

  const handleSetMode = (next: "attack-path" | "exposure" | "attacker_v2" | "phase" | "exfil" | "topology" | "lateral" | "attacker_map" | "convergence") => {
    // Switching to exposure / phase / topology clears the path
    // selection — those aggregate across paths (phase shows every
    // chain targeting the jewel; topology / exposure are jewel-scoped
    // not path-scoped). attack-path and attacker_v2 require a path —
    // preserve it.
    setUrl({
      mode: next,
      path:
        next === "exposure" || next === "phase" || next === "topology"
          ? null
          : undefined,
    })
  }

  const handleToggleExpand = () => {
    setUrl({ expand: isPathExpanded ? null : "path" })
  }

  // Esc key handler — diagnostic: temporarily removed pending hooks-
  // order investigation 2026-05-21. The Expand/Collapse button still
  // works; only the Esc-key shortcut is gone for now.

  const handleSelectJewel = (jewelId: string) => {
    // Selecting a new jewel resets the path selection — different
    // jewel = different path set, so an old path id wouldn't match.
    // Also clears exfil_path: exfil path ids are also per-jewel.
    setUrl({ jewel: jewelId, path: null, exfilPath: null })
  }

  const handleSelectPath = (pathId: string) => {
    setUrl({ path: pathId })
  }

  const handleSelectExfilPath = (pathId: string) => {
    setUrl({ exfilPath: pathId })
  }

  // ─── No-system-selected guard ──────────────────────────────────
  // 2026-05-30 v2: page used to default to "alon-prod" silently. The
  // useEffect above auto-redirects to the first available system on
  // mount; while that fetch is in flight (or if it fails / returns
  // 0 systems) we render an inline picker so the operator can pick
  // manually instead of staring at a spinner.
  if (!systemName) {
    return (
      <div className={`flex ${shellHeight} items-center justify-center bg-background p-6`}>
        <div className="rounded-xl border border-border bg-card p-6 max-w-md w-full">
          <div className="text-sm font-semibold text-foreground mb-1">
            Select a system
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Attack Paths v2 needs a system to render.
            {!autoRedirectDone && availableSystems.length === 0 && (
              <> Loading available systems…</>
            )}
          </p>
          {availableSystems.length > 0 && (
            <div className="space-y-1.5">
              {availableSystems.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams?.toString() ?? "")
                    params.set("system", s)
                    // A7 B5: a picked name is a new system -- never paired with the key of the one that did not resolve.
                    params.delete("system_key")
                    router.replace(`${pathname}?${params.toString()}`)
                  }}
                  className="w-full text-left rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {autoRedirectDone && availableSystems.length === 0 && (
            <NoSystemsNotice catalogFailure={catalogFailure} />
          )}
        </div>
      </div>
    )
  }

  // ─── Loading / error states ────────────────────────────────────
  // Zoom −1 (default, no jewel) only needs systemName — blast-radius is
  // its own fetch. Do NOT block the whole tab on full IAP.
  const zoomMinus1Ready =
    viewMode === "attack-path" && !selectedJewelId && Boolean(systemName)
  const hasUsableJewels = jewels.length > 0
  // First-paint spinner only when we can't show Zoom −1 and still have
  // no authoritative jewel list (SERVE empty is settled — don't wait on IAP).
  if (
    !zoomMinus1Ready &&
    !hasUsableJewels &&
    !serveJewelsOk &&
    (jewelsLoading || isLoading) &&
    !data
  ) {
    return (
      <div className={`flex ${shellHeight} items-center justify-center bg-background`}>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading attack paths for {systemName}…</span>
        </div>
      </div>
    )
  }

  // Hard error only when SERVE jewels failed (or never loaded) and IAP
  // also failed — never when SERVE answered empty successfully.
  if (
    !zoomMinus1Ready &&
    !hasUsableJewels &&
    !serveJewelsOk &&
    !data &&
    ((_iapBackgroundError && !isLoading) || (jewelsError && !jewelsLoading))
  ) {
    return (
      <div className={`flex ${shellHeight} items-center justify-center bg-background`}>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 max-w-md">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-semibold">Could not load attack paths</span>
          </div>
          <div className="text-xs text-muted-foreground mb-3">
            {String(_iapBackgroundError || jewelsError)}
          </div>
          <button
            onClick={retry}
            className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/20 transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      </div>
    )
  }

  // Errored / cold-compute IAP envelope with no usable jewels — honest
  // "couldn't compute", NEVER false "No crown jewels". A SERVE catalog
  // answer (including empty / NOT_READY) wins: IAP "Graph snapshot is stale"
  // must not brick the tab when the projection pin already answered.
  if (
    !zoomMinus1Ready &&
    shouldShowAttackPathsNotComputed({
      serveJewelsRaw: jewelsRaw,
      serveJewelsError: jewelsError,
      jewelsEmpty: jewels.length === 0,
      iapFailed: iapHealth.failed,
      jewelsLoading,
      iapLoading: isLoading,
    })
  ) {
    return (
      <div className={`flex ${shellHeight} items-center justify-center bg-background`}>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 max-w-md">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-semibold">Attack paths not computed yet</span>
          </div>
          <div className="text-xs text-muted-foreground mb-1">
            The crown-jewel routing compute didn&apos;t complete for {systemName}
            {" "}— this is not the same as &quot;no crown jewels.&quot; The backend
            was likely cold or the graph snapshot wasn&apos;t ready.
          </div>
          {iapHealth.reason && (
            <div className="text-[11px] font-mono text-muted-foreground/80 mb-3">
              {iapHealth.reason}
            </div>
          )}
          <button
            onClick={retry}
            className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      </div>
    )
  }

  // ─── Main 3-column layout ──────────────────────────────────────
  return (
    // AP188 (F4 P2): below lg the three panes stack and the shell scrolls, so the selected explanation is reached by
    // ordinary scrolling; from lg up the row and its fixed columns are exactly as before. (AP192: below lg the fixed
    // 320 + 400 columns left the graph pane 180px wide at 900 and 48px at 768, too narrow for any mode tab.)
    // AP201 review B1/S1: every component read under the page names the same account (useAttackPathReadClaims).
    <AttackPathSystemIdentity systemKey={identityKey} systemAccountId={identityAccount}>
    <div className={`flex flex-col lg:flex-row ${shellHeight} bg-background text-foreground overflow-y-auto lg:overflow-hidden${embedded ? " rounded-xl border border-border" : ""}`}>
      {/* Column 1 — Crown jewels (hidden when path is maximized) */}
      <aside
        className={`${isPathExpanded ? "hidden" : railCollapsed ? "w-full lg:w-9" : "w-full lg:w-[320px]"} shrink-0 border-r border-border bg-background overflow-y-auto`}
      >
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-start gap-2">
            {!embedded && (
              <BackToDashboard
                className="p-1.5 -ml-1.5 rounded-md hover:bg-accent transition-colors shrink-0"
                iconClassName="w-4 h-4 text-muted-foreground"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                CYNTRO · ATTACK PATHS V2
              </div>
              {/* Standalone route: switcher lets the operator swap system
                  without leaving the page. Embedded in the dashboard tab:
                  the system is fixed by the dashboard's selection (the prop
                  wins over ?system), so we render a static label instead of
                  a switcher that would desync from the dashboard. */}
              {accountOverride ? (
                <div className="text-[10px] text-amber-800 dark:text-amber-300" data-testid="ap-read-account-override">
                  Reads scoped to account {accountOverride.readAccount} (this system&apos;s own account), not the selected
                  account {accountOverride.selectedAccount}.
                </div>
              ) : null}
              {embedded ? (
                <div className="text-sm font-semibold text-foreground truncate">
                  {systemName}
                </div>
              ) : (
              <SystemSwitcher
                currentSystem={systemName}
                availableSystems={availableSystems}
                onSwitch={(s) => {
                  const params = new URLSearchParams(searchParams?.toString() ?? "")
                  params.set("system", s)
                  // A7 B5: another system -- the previous system's key never rides along with the new name.
                  params.delete("system_key")
                  // Drop jewel/path when switching system — those ids
                  // are per-system and won't resolve on a different one.
                  params.delete("jewel")
                  params.delete("path")
                  router.replace(`${pathname}?${params.toString()}`)
                }}
              />
              )}
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {typeof displayedPathCount === "number" &&
                typeof displayedReachableJewelCount === "number"
                  ? `${displayedPathCount} active paths · ${displayedReachableJewelCount} reachable targets`
                  : data && allPaths.length > 0
                    ? `${allPaths.length} loaded paths · ${jewels.length} listed jewels`
                  : jewelsLoading
                    ? "Loading crown-jewel targets…"
                    : railIapHold
                      ? iapHoldTitle(railIapHold)
                      : `${jewels.length} targets${isLoading ? " · totals loading…" : ""}`}
                {/* AP182: with a catalog the counts above ARE its listed paths (displayedPathCount =
                    catalogTotals.pathCount). When some are held, or a target's coverage was withheld or served
                    unreadable, say so beside them, never as a total. */}
                {catalogTotals?.lifecycleHeld ? (
                  <span title={LIFECYCLE_HELD_EXPLANATION} data-testid="catalog-held-not-counted">
                    {` · ${heldPathsPhrase(catalogTotals.heldPathCount)}, not counted`}
                  </span>
                ) : null}
                {catalogTotals && catalogTotals.withheldTargetCount > 0 ? (
                  <span data-testid="catalog-coverage-withheld">
                    {` · coverage withheld for ${catalogTotals.withheldTargetCount} target${
                      catalogTotals.withheldTargetCount === 1 ? "" : "s"
                    }`}
                  </span>
                ) : null}
                {catalogTotals && catalogTotals.unreadableTargetCount > 0 ? (
                  <span data-testid="catalog-coverage-unreadable">
                    {` · coverage evidence unreadable for ${catalogTotals.unreadableTargetCount} target${
                      catalogTotals.unreadableTargetCount === 1 ? "" : "s"
                    }`}
                  </span>
                ) : null}
                {showingStale ? " · showing cached" : ""}
              </div>
            </div>
          </div>
        </div>
        <CrownJewelListPanel
          jewels={jewels}
          totalReachable={displayedReachableJewelCount}
          serveState={targetCatalogServeState}
          notReadyReason={targetCatalogNotReadyReason}
          stateCounts={targetCatalogCounts}
          selectedJewelId={selectedJewelId}
          onSelect={handleSelectJewel}
          iapHold={railIapHold}
          onCollapsedChange={setRailCollapsed}
        />
      </aside>

      {/* Column 2 — Paths grouped by source type (hidden when maximized,
          and hidden in exposure mode since exposure aggregates across
          paths). Operator can still get back to per-path view via the
          mode toggle in the right-column header. */}
      <section
        className={`${isPathExpanded || viewMode === "exposure" || viewMode === "topology" || viewMode === "lateral" ? "hidden" : "w-full lg:w-[400px]"} shrink-0 border-r border-border overflow-y-auto bg-muted/30`}
      >
        {!selectedJewelId ? (
          <EmptyState
            title="Select a crown jewel"
            subtitle="Pick an asset on the left to see every path that reaches it."
          />
        ) : pathsPending || pathsWarming ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
            <div className="text-center">
              <div className="font-medium text-foreground">
                {jewelSummaryRetrying || jewelSummaryAttempts > 1
                  ? "Backend warming up — loading paths…"
                  : "Loading paths for this jewel…"}
              </div>
              <div className="text-[11px] mt-1">
                {selectedJewel?.path_count
                  ? `${selectedJewel.path_count} materialized path${selectedJewel.path_count === 1 ? "" : "s"} expected`
                  : "Materialized attack paths for this crown jewel"}
                {jewelSummaryAttempts > 1
                  ? ` · attempt ${jewelSummaryAttempts}`
                  : ""}
              </div>
            </div>
          </div>
        ) : pathsHardError ? (
          <div className="m-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 mb-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4" />
              {jewelSummarySettled ? "Paths not served for this target" : "Paths still warming"}
            </div>
            <div className="text-xs text-muted-foreground mb-3" data-testid="paths-hard-error-reason">
              {jewelSummaryError ||
                "Backend was cold and didn’t answer in time. Retry — the next try is usually fast."}
            </div>
            <button
              onClick={() => {
                retryJewelSummary()
                retryFullIap()
              }}
              className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-500/25 transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Retry paths
            </button>
          </div>
        ) : (
          <>
            {pathsFromIapFallback ? (
              <div
                className="mx-4 mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300"
                data-testid="path-rail-non-authoritative-iap"
              >
                SERVE unreachable — showing legacy IAP paths. Not projection
                truth; Zoom0 canvas stays fail-closed.
              </div>
            ) : null}
            {viewMode === "exfil" ? (
          // Exfil tab: channel-grouped exfil-path rail. Mirrors
          // PathListGrouped's role for the attack-path tab — same
          // mental model, same column slot. 2026-05-31.
          <ExfilPathListColumn
            paths={exfilData?.paths ?? []}
            selectedPathId={selectedExfilPathId}
            onSelectPath={handleSelectExfilPath}
            jewelName={selectedJewel?.name ?? null}
            loading={exfilLoading}
            error={exfilError}
            answered={exfilData != null}
            notApplicableReason={
              exfilData?.applicability?.state === "NOT_APPLICABLE"
                ? exfilData.applicability.reason
                : null
            }
          />
        ) : viewMode === "convergence" ? (
          <ConvergencePathList
            paths={effectiveConvergenceData?.paths ?? []}
            selectedPathId={convergencePathId}
            onSelectPath={handleSelectPath}
            loading={convergenceLoading && !effectiveConvergenceData}
          />
        ) : (
          <>
            {/* AP201 (CP-B): Current Access by SOURCE -- every compute the serve answer names, grouped by what the
                server said about it; "Approval not recorded" on every row. Only over the serve answer (never the IAP
                fallback); the path list below keeps every route. */}
            {jewelRail.source === "serve" ? (
              <CurrentAccessSourceList
                data={jewelSummaryConvergence}
                activePaths={jewelPaths}
                jewelName={selectedJewel?.name ?? null}
                jewelType={selectedJewel?.type ?? null}
                selectedPathId={selectedPathId}
                onSelectPath={handleSelectPath}
              />
            ) : null}
            <PathListGrouped
              paths={jewelPaths}
              jewel={jewels.find((j) => j.id === selectedJewelId) ?? null}
              selectedPathId={selectedPathId}
              onSelectPath={handleSelectPath}
              answerNotReady={selectedAnswerNotReady}
              answerPartial={selectedAnswerPartial}
            />
          </>
        )}
          </>
        )}
      </section>

      {/* Column 3 — Per-path analysis OR Exposure view, gated by mode */}
      <main
        ref={mainScrollRef}
        className={`flex-1 min-h-[70vh] lg:min-h-0 bg-background ${
          embedded && isPathExpanded
            ? "flex flex-col min-h-[78vh] overflow-visible"
            : isPathExpanded && (viewMode === "attacker_map" || viewMode === "attack-path")
            ? "flex flex-col min-h-0 overflow-hidden"
            : "overflow-y-auto"
        }`}
      >
        {/* Topology view is system-level, not jewel-level — render it
            even when no jewel is selected. The mode toggle still
            renders so the user can switch back to a path view. */}
        {viewMode === "topology" ? (
          <>
            <ModeToggle
              mode={viewMode}
              onChange={handleSetMode}
              jewelName={jewels.find((j) => j.id === selectedJewelId)?.name ?? null}
              count={selectedCount}
              isExpanded={isPathExpanded}
              onToggleExpand={handleToggleExpand}
              showBeta={showBeta}
            />
            {jewels.length > 0 ? (
              <TopologyAttackGraph
                systemName={systemName}
                systemKey={identityKey}
                systemAccountId={identityAccount}
                initialJewel={selectedJewel ?? jewels[0]}
                jewels={jewels}
              />
            ) : (
              <div className="flex h-[760px] items-center justify-center text-sm text-slate-400">
                No crown jewels on this system yet — connect collectors to populate.
              </div>
            )}
          </>
        ) : !selectedJewelId ? (
          // Zoom −1 (S4): system blast-radius landing. Pick a jewel on
          // the left → Zoom 0 fan-in. Attack Map / Lateral / Exfil chips
          // stay on the mode bar as alternate presentations.
          <>
            <ModeToggle
              mode={viewMode}
              onChange={handleSetMode}
              jewelName={null}
              isExpanded={isPathExpanded}
              onToggleExpand={handleToggleExpand}
              showBeta={showBeta}
            />
            <ZoomMinus1Landing
              systemName={systemName}
              scope={blastRadiusScope}
            />
          </>
        ) : (
          <>
            <ModeToggle
              mode={viewMode}
              onChange={handleSetMode}
              jewelName={jewels.find((j) => j.id === selectedJewelId)?.name ?? null}
              count={selectedCount}
              isExpanded={isPathExpanded}
              onToggleExpand={handleToggleExpand}
              showBeta={showBeta}
            />
            {currentAccessZero && ["attack-path", "attacker_map", "attacker_v2", "convergence"].includes(viewMode) ? (
              <EmptyState
                title={currentAccessZero.title}
                subtitle={currentAccessZero.subtitle}
                large
              />
            ) : viewMode === "exposure" ? (
              <JewelExposurePanel
                jewel={jewels.find((j) => j.id === selectedJewelId)!}
                systemName={systemName}
              />
            ) : viewMode === "attacker_v2" ? (
              // V2 — typed, edge-proven canvas. Lives alongside V1
              // for side-by-side comparison until V2 is proven
              // correct + explicit deprecation sign-off.
              !selectedPath ? (
                <EmptyState
                  title="Select a path for V2 canvas"
                  subtitle="V2 renders the same path via the typed AttackCanvas DTO from POST /api/attack-chain/canvas — every node and edge backed by an explicit Neptune relationship, no frontend inference."
                  large
                />
              ) : (
                <AttackerCanvasV2
                  systemName={systemName}
                  pathId={selectedPath.id}
                  path={selectedPath}
                  jewel={jewels.find((j) => j.id === selectedJewelId) ?? null}
                />
              )
            ) : viewMode === "phase" ? (
              // v0.3 — 9-lane attacker-phase view. Reads materialized
              // :AttackPath nodes (hop-reified per v0.2 §3) via the
              // chains-for-cj endpoint. Doesn't depend on a selected
              // path — it shows ALL chains targeting the selected jewel,
              // ranked by severity / freshness / foothold.
              !selectedJewelId ? (
                <EmptyState
                  title="Select a crown jewel for phase view"
                  subtitle="Phase view shows every attack chain targeting the selected jewel across 9 attacker-phase lanes (Entry → Reach → Land → Steal Creds → Become → Reach Data → Exfil + Persist + Defense)."
                  large
                />
              ) : (
                <AttackerViewV3
                  jewelId={selectedJewelId}
                  jewelName={jewels.find((j) => j.id === selectedJewelId)?.name ?? selectedJewelId}
                  systemName={systemName}
                />
              )
            ) : viewMode === "exfil" ? (
              // EXFIL view — Phase A 2026-05-25 PRD. BFS-forward from
              // the crown jewel to surface the data's escape routes.
              // Five-column canvas: SOURCE → ACCESSORS → EGRESS PLANES
              // → EXTERNAL GATES → DESTINATIONS. Phase A only fills the
              // NETWORK egress sub-lane + Internet destination from
              // existing data; IDENTITY and DATA-PROPAGATION sub-lanes
              // render NotWiredCards with the collector backlog inline.
              !selectedJewelId ? (
                <EmptyState
                  title="Select a crown jewel for exfil view"
                  subtitle="Exfil view answers 'where does the data go from this jewel?' — every door the data can leave through, plus which ones are actively exfiltrating right now."
                  large
                />
              ) : (
                <div className="min-h-full bg-muted/20">
                  <div className="px-6 pt-5">
                    {selectedPath ? (
                      <PathCVEAssessmentPanel
                        report={selectedPathReport}
                        loading={selectedPathReportLoading}
                        error={selectedPathReportError}
                        retry={retrySelectedPathReport}
                        selectedMode="EXFILTRATION"
                        onOpenVulnerability={openVulnerability}
                        compact
                      />
                    ) : (
                      <div className="rounded-xl border border-border bg-card p-3 text-[11px] text-muted-foreground">Select an attack path to correlate its CVEs with exfiltration evidence.</div>
                    )}
                  </div>
                  <ExfilViewV3
                    systemName={systemName}
                    jewel={jewels.find((j) => j.id === selectedJewelId) ?? null}
                    data={exfilData ?? null}
                    loading={exfilLoading}
                    error={exfilError}
                    retry={exfilRetry}
                    retrying={exfilRetrying}
                    attempt={exfilAttempt}
                    selectedPathId={selectedExfilPathId}
                    onSelectPath={handleSelectExfilPath}
                    cveAssessments={pathCVEsForMode(selectedPathReport, "EXFILTRATION")}
                  />
                </div>
              )
            ) : viewMode === "lateral" ? (
              // Jewel-scoped attacker model. The operator picks the initial
              // compromised service; observed access to the jewel is not an
              // eligibility gate. ATLAS owns chain enumeration and replay.
              !selectedJewelId || !selectedJewel ? (
                <EmptyState
                  title="Select a crown jewel"
                  subtitle="Then choose the service where the attacker first lands and simulate every modeled route to the jewel."
                  large
                />
              ) : (
                <div className="min-h-full bg-muted/20">
                  <div className="px-6 pt-5">
                    {selectedPath ? (
                      <PathCVEAssessmentPanel
                        report={selectedPathReport}
                        loading={selectedPathReportLoading}
                        error={selectedPathReportError}
                        retry={retrySelectedPathReport}
                        selectedMode="LATERAL"
                        onOpenVulnerability={openVulnerability}
                        compact
                      />
                    ) : (
                      <div className="rounded-xl border border-border bg-card p-3 text-[11px] text-muted-foreground">Select an attack path to correlate its CVEs with lateral-movement evidence.</div>
                    )}
                  </div>
                  <AtlasLateralView
                    systemName={systemName}
                    systemKey={identityKey}
                    systemAccountId={identityAccount}
                    jewelId={selectedJewelId}
                    jewelName={selectedJewel.name}
                    cveAssessments={pathCVEsForMode(selectedPathReport, "LATERAL")}
                  />
                </div>
              )
            ) : viewMode === "convergence" ? (
              selectedJewel ? (
                <CrownJewelConvergenceView
                  jewel={selectedJewel}
                  data={effectiveConvergenceData}
                  loading={convergenceLoading && !effectiveConvergenceData}
                  error={convergenceSource === "live" ? convergenceError : null}
                  retry={convergenceRetry}
                  selectedPathId={convergencePathId}
                  source={convergenceSource}
                />
              ) : (
                <EmptyState
                  title="Select a crown jewel"
                  subtitle="Convergence fans every materialized path to the jewel over real subnet and security-group placement."
                  large
                />
              )
            ) : viewMode === "attacker_map" ? (
              // Attack Map chip — same path-authority Zoom0 canvas as Attack
              // Path (SERVE hop DTOs). The legacy AttackPathPanel map-only
              // path used facade IAP architecture and painted VPC EC2 paths
              // as "No subnets / SG unavailable" while Attack Path showed
              // the real subnet/SG/NACL spine from /detail.
              selectedJewel && systemName ? (
                <div
                  className="flex h-full min-h-0 flex-col"
                  data-testid="attack-path-flow-map-slot"
                >
                  <Zoom0FanInPanel
                    systemName={systemName}
                    systemKey={identityKey}
                    systemAccountId={identityAccount}
                    jewel={selectedJewel}
                    paths={[...jewelPaths]}
                    selectedPathId={selectedPathId}
                    onRequestMode={handleSetMode}
                    onClearPath={() => setUrl({ path: null })}
                    isExpanded={isPathExpanded}
                    documentScroll={embedded && isPathExpanded}
                    cveReport={selectedPathReport}
                    cveReportLoading={selectedPathReportLoading}
                    cveReportError={selectedPathReportError}
                    onRetryCVEReport={retrySelectedPathReport}
                    onOpenVulnerability={openVulnerability}
                  />
                </div>
              ) : (
                <EmptyState
                  title="Select a crown jewel"
                  subtitle="Attack Map draws Neptune paths to the jewel on live VPC topology. Pick a crown jewel on the left."
                  large
                />
              )
            ) : jewelPaths.length === 0 && selectedPathId && selectedJewel ? (
              // IAP has no synthesized paths for this jewel (e.g. materialized-only
              // convergence rows) — render the convergence spine directly.
              <div className="flex flex-col h-full overflow-auto">
                <div className="px-6 py-2 border-b border-border bg-background/95 flex items-center justify-between gap-3">
                  <span className="text-xs font-mono text-amber-700 dark:text-amber-300 truncate">
                    {selectedJewel.name}
                  </span>
                  <CrownJewelUnionViewLink systemName={systemName} systemKey={identityKey}
                    systemAccountId={identityAccount} jewel={selectedJewel} />
                </div>
                <ConvergenceMapLoader
                  systemName={systemName}
                  systemKey={identityKey}
                  systemAccountId={identityAccount}
                  cjArn={
                    selectedJewel.canonical_id ??
                    (selectedJewel.id.startsWith("arn:") ? selectedJewel.id : null)
                  }
                  cjName={selectedJewel.name}
                  initialSelectedPathId={selectedPathId}
                  fallbackJewel={selectedJewel}
                  fallbackPaths={[]}
                />
              </div>
            ) : selectedJewel && systemName ? (
              // Zoom 0 stays mounted after path pin — fan-in is selection;
              // Current Access dossier opens beside the path-authority map.
              // Legacy Zoom-1 AttackPathPanel is no longer the default drill-in.
              <Zoom0FanInPanel
                systemName={systemName}
                systemKey={identityKey}
                systemAccountId={identityAccount}
                jewel={selectedJewel}
                paths={[...jewelPaths]}
                selectedPathId={selectedPathId}
                onRequestMode={handleSetMode}
                onClearPath={() => setUrl({ path: null })}
                isExpanded={isPathExpanded}
                documentScroll={embedded && isPathExpanded}
                cveReport={selectedPathReport}
                cveReportLoading={selectedPathReportLoading}
                cveReportError={selectedPathReportError}
                onRetryCVEReport={retrySelectedPathReport}
                onOpenVulnerability={openVulnerability}
              />
            ) : (
              <EmptyState
                title="Select a path"
                subtitle={
                  jewelPaths.length === 0 && !selectedPathId
                    ? "No attack paths to this jewel today. Switch to Exposure view to see standing access."
                    : `Pick one of the ${jewelPaths.length} paths on the left to pin Current Access.`
                }
                large
              />
            )}
          </>
        )}
      </main>
    </div>
    </AttackPathSystemIdentity>
  )
}

// ─── Helper: Per-path ↔ Exposure mode toggle ────────────────────
//
// Sticky bar above the right-column panel. Two pills, URL-driven via
// ?mode={path|exposure}. Switching to exposure clears any selected path
// (the URL handler in setUrl does that) so the operator can't end up in
// a state where the URL says ?mode=exposure but the panel still reads
// from a stale ?path id.
function ModeToggle({
  mode,
  onChange,
  jewelName,
  count = null,
  isExpanded,
  onToggleExpand,
  showBeta = false,
}: {
  mode: AttackPathsMode
  onChange: (next: AttackPathsMode) => void
  jewelName: string | null
  /** AP187/AP188: the selected target's path count as the page's read state supports it (convergence-readiness). */
  count?: SelectedPathCount | null
  isExpanded: boolean
  onToggleExpand: () => void
  /** Gate for beta engineering canvases (?beta=1). */
  showBeta?: boolean
}) {
  // Attack Map + Lateral Movement restored as primary chips (operator
  // asked for the previous presentation options after S4 folded them).
  const tabs = buildModeBarTabs(showBeta)
  const highlight = modeBarHighlight(mode)
  return (
    // AP192: the bar wraps by the room the graph pane gives it, never by the viewport. The tab strip comes last and is
    // sized by its content (flex-auto): it shares the first line only when every tab fits there, otherwise it takes a
    // full line of its own and scrolls inside it. So the strip and the selected-target count are never 0px wide.
    <div className="px-6 py-3 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-20 flex flex-wrap items-center gap-3 min-w-0 shrink-0">
      {/* Freshness pill — graph age from CollectorRun.finished_at.
          Lives in the shared tab bar so every view tab inherits an
          honest "Graph synced X min ago" signal. Replaces the
          implicit "live" framing the tab subtitles use. */}
      <FreshnessBanner variant="pill" className="shrink-0" />
      {/* Quiet context — mode descriptions live in the tab tooltips. The
         path count is suppressed in topology mode because the canvas
         displays its own count from /by-crown-jewel (different endpoint,
         different number). Showing both invites confusion. */}
      {/* AP187/AP188: the selected target's count in the words its read state supports (convergence-readiness): a
          whole count keeps "<name> · N paths", a partial one says "listed", and loading / unavailable / not ready say
          so, never a zero. A note line takes the first line's width and never widens the block (w-0 min-w-full), so
          the tab strip beside it keeps its room. Full text in the titles. AP188 (F4/F5): shown at every width (it was
          md-only); AP192: the bar wraps by its own room, so the count is never squeezed to 0px. */}
      {(() => {
        const lines = jewelName && mode !== "topology" && count ? selectedPathCountLines(jewelName, count) : null
        if (lines?.secondary) {
          return (
            <div className="text-[10px] min-w-0 max-w-[220px] shrink" data-testid="mode-bar-target-count">
              <div className="truncate text-muted-foreground" title={lines.title ? `${lines.primary} — ${lines.title}` : lines.primary}>
                {lines.primary}
              </div>
              <div className="w-0 min-w-full truncate text-amber-700 dark:text-amber-400" title={lines.secondary} data-testid="mode-bar-coverage-note">
                {lines.secondary}
              </div>
            </div>
          )
        }
        return (
          <div
            className="text-[10px] text-muted-foreground min-w-0 truncate max-w-[220px] shrink"
            data-testid="mode-bar-target-count"
            title={lines?.title ?? undefined}
          >
            {jewelName ? (lines ? lines.primary : jewelName) : null}
          </div>
        )
      })()}
      <button
        onClick={onToggleExpand}
        title={isExpanded ? "Collapse — restore jewels + paths columns" : "Expand canvas — hide jewels + paths columns"}
        aria-label={isExpanded ? "Collapse canvas" : "Expand canvas"}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        {isExpanded ? (
          <>
            <Minimize2 className="h-3 w-3" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Collapse</span>
          </>
        ) : (
          <>
            <Maximize2 className="h-3 w-3" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Expand</span>
          </>
        )}
      </button>
      {/* ATLAS is an inline section at the bottom of the Attacker View
          canvas (atlas-inline-section.tsx). EXFIL inverts the BFS
          direction: jewel = SOURCE, external destinations = SINKS.
          Topology shows the customer's architecture, not the
          attacker's path. */}
      {/* AP188 (F5): the row keeps its full width (w-max) inside the overflow-x-auto wrapper, so every tab is reachable
          by scrolling or keyboard focus; with max-w-full it was clipped at the wrapper and the last tabs were
          unreachable. AP192: the wrapper is flex-auto (its basis is the row's own width), so in the wrapping bar it
          takes a full line whenever the first line has no room for every tab; a flex-1 item (basis 0) was squeezed to
          58px below md and to 0px at 900 / 1024. */}
      <div className="min-w-0 flex-auto overflow-x-auto" data-testid="mode-bar-tabs">
        <div className="flex rounded-md border border-border overflow-hidden w-max">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            // AP188 (F5): a tab reached by keyboard scrolls fully into view (focus alone left it partly clipped).
            onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
            title={tab.title}
            className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors border-r border-border last:border-r-0 ${
              highlight === tab.key
                ? "bg-primary/10 text-primary"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
        </div>
      </div>
    </div>
  )
}

// ─── Helper: empty / placeholder state ──────────────────────────
/**
 * System switcher — sidebar header dropdown. Replaces the static
 * system-name label so operators can swap to a different system
 * without leaving the page. The localStorage-resume effect picks up
 * the new value on next visit.
 */
function SystemSwitcher({
  currentSystem,
  availableSystems,
  onSwitch,
}: {
  currentSystem: string
  availableSystems: string[]
  onSwitch: (s: string) => void
}) {
  const [open, setOpen] = useState(false)
  const hasOthers = availableSystems.filter((s) => s !== currentSystem).length > 0
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-left w-full mt-0.5 flex items-center gap-1.5 hover:opacity-80 transition-opacity"
        title={hasOthers ? "Switch system" : "Only system available"}
      >
        <span className="text-sm font-semibold text-foreground truncate">{currentSystem}</span>
        {hasOthers && (
          <span className="text-[9px] text-muted-foreground uppercase">▾</span>
        )}
      </button>
      {open && hasOthers && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[200px] max-h-[300px] overflow-y-auto rounded-md border border-border bg-card shadow-lg">
            <div className="px-3 py-2 text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border">
              Switch system
            </div>
            {availableSystems.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setOpen(false)
                  if (s !== currentSystem) onSwitch(s)
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors ${
                  s === currentSystem ? "text-primary font-semibold" : "text-foreground"
                }`}
              >
                {s === currentSystem ? "● " : "  "}
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function EmptyState({
  title,
  subtitle,
  large = false,
}: {
  title: string
  subtitle: string
  large?: boolean
}) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className={`text-center max-w-md ${large ? "py-20" : "py-12"}`}>
        <div className={`${large ? "text-lg" : "text-sm"} font-semibold text-foreground`}>
          {title}
        </div>
        <div className={`mt-1.5 ${large ? "text-sm" : "text-xs"} text-muted-foreground`}>
          {subtitle}
        </div>
      </div>
    </div>
  )
}
