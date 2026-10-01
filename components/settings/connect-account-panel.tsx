"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Terminal,
  X,
  XCircle,
} from "lucide-react"
import {
  OPTIONAL_CONNECTION_PARAMETERS,
  REGION_SOURCE_KEYS,
  accountAdminFailure,
  backendCount,
  changeCountText,
  connectionCheckOutcome,
  discoveryCaveats,
  discoverySummary,
  formatUtcInstantExact,
  memberTrustNotReadyMessage,
  proxiedAccountAdminPath,
  proxiedTemplatePath,
  regionDiscoveries,
  regionSourceLabel,
  safeExternalUrl,
  usdText,
  type AccountFeatureCoverage,
  type ConfigCost,
  type ConfigEnablement,
  type ConfigEniSourceStatus,
  type ConnectionInstructions,
  type FailedAccountRequest,
  type ManagedAccount,
  type RegionDiscovery,
  type RegionSourceKey,
  type SourceStatus,
  type VpcFlowSourceStatus,
} from "@/lib/account-admin"
import { coveragePageHref, formatCoverageInstant } from "@/lib/observation-coverage"

/** One badge per member-account `onboarding_status` (api/account_registry.py, cyntro_data/accounts/connector.py). */
export function MemberStatusBadge({ status }: { status: string }) {
  const base = "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold"
  if (status === "REGISTERING") {
    return (
      <span className={`${base} border-blue-200 bg-blue-50 text-blue-700`}>
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Registering
      </span>
    )
  }
  if (status === "AWAITING_CONNECTION") {
    return (
      <span className={`${base} border-amber-200 bg-amber-50 text-amber-800`}>
        <Clock className="h-3 w-3" aria-hidden /> Waiting for connection stack
      </span>
    )
  }
  if (status === "CONNECTED") {
    return (
      <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}>
        <CheckCircle2 className="h-3 w-3" aria-hidden /> Connected
      </span>
    )
  }
  if (status === "CONNECTION_FAILED") {
    return (
      <span className={`${base} border-red-200 bg-red-50 text-red-700`}>
        <XCircle className="h-3 w-3" aria-hidden /> Connection failed
      </span>
    )
  }
  if (status === "REGISTERED") {
    return <span className={`${base} border-teal-200 bg-teal-50 text-teal-700`}>Registered</span>
  }
  return <span className={`${base} border-slate-200 bg-slate-50 text-slate-600`}>{status.replaceAll("_", " ")}</span>
}

/** Connected is "operational", never "every source has complete history". */
export function OperationalNotCompleteNote({ accountId }: { accountId: string }) {
  return (
    <p data-testid="connected-means-operational" className="text-[11px] text-slate-500">
      Connected means Cyntro can operate in this account, not that its history is complete.{" "}
      <Link href={coveragePageHref(accountId)} className="font-semibold text-teal-700 hover:text-teal-800">
        Evidence coverage
      </Link>
    </p>
  )
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setState("copied")
    } catch {
      setState("failed")
    }
    window.setTimeout(() => setState("idle"), 1500)
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label}
      title={state === "failed" ? "Copy is unavailable here; select the value instead" : label}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
    >
      {state === "copied" ? <Check className="h-3 w-3 text-emerald-600" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      {state === "copied" ? "Copied" : state === "failed" ? "Select to copy" : "Copy"}
    </button>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 p-5">
      <div className="flex gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <div className="mt-2 space-y-3 text-sm text-slate-600">{children}</div>
        </div>
      </div>
    </section>
  )
}

function names(values?: (string | null)[]): string[] {
  return (values || []).filter((value): value is string => typeof value === "string" && value !== "")
}

/** One line per optional stack parameter, from what the connector found (notes) and the value the backend filled in. */
function OptionalParameterNotes({ instructions }: { instructions: ConnectionInstructions }) {
  const notes = instructions.notes || {}
  const region = instructions.region
  const value = (name: string) => String(instructions.parameters?.[name] ?? "").trim()
  const unreadable = names(notes.flow_log_groups_without_required_fields)
  const clusters = names(notes.eks_clusters)
  const lines: Record<(typeof OPTIONAL_CONNECTION_PARAMETERS)[number], ReactNode> = {
    ExistingFlowLogGroupArns: value("ExistingFlowLogGroupArns")
      ? "Flow-log groups Cyntro found in this account that it can read."
      : notes.discovered
        ? "Left blank: Cyntro found no flow-log group in this account that it can read."
        : "Left blank: Cyntro has not read this account yet, so it cannot list its flow-log groups.",
    FlowLogVpcId: `Optional. A VPC in ${region} that gets a Cyntro flow log in the format Cyntro reads (its own log group, recording from now on). Leave blank to skip.`,
    EksClusterName: value("EksClusterName")
      ? `The EKS cluster in ${region} whose Kubernetes objects Cyntro will read (view access, no Secrets).`
      : clusters.length
        ? `Optional. Clusters found: ${clusters.join(", ")}. Enter one that uses API authentication to let Cyntro read its Kubernetes objects, or leave blank.`
        : `Optional. An EKS cluster in ${region} (API authentication) whose Kubernetes objects Cyntro should read. Leave blank to skip.`,
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Optional parameters</p>
      <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
        {OPTIONAL_CONNECTION_PARAMETERS.map((name) => (
          <li key={name}>
            <span className="font-mono font-semibold text-slate-700">{name}</span> — {lines[name]}
          </li>
        ))}
      </ul>
      {unreadable.length ? (
        <p className="mt-2 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {unreadable.join(", ")} {unreadable.length === 1 ? "lacks" : "lack"} the tcp-flags / flow-direction fields
            Cyntro needs. Set FlowLogVpcId to have the stack add a Cyntro flow log for that VPC instead.
          </span>
        </p>
      ) : null}
    </div>
  )
}

function DiscoveryLines({ account }: { account: ManagedAccount | null }) {
  if (!account || account.onboarding_status !== "CONNECTED") return null
  const summary = discoverySummary(account.sources)
  const caveats = discoveryCaveats(account.sources)
  return (
    <>
      {summary ? <p className="text-xs text-slate-500">{summary}</p> : null}
      {caveats.map((caveat) => (
        <p key={caveat} className="text-xs text-amber-800">{caveat}</p>
      ))}
    </>
  )
}

// ── Data sources by Region (`notes.regions`) ─────────────────────────────

function nonEmptyStrings(values?: (string | null | undefined)[] | null): string[] {
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string" && value.trim() !== "") : []
}

const COVERAGE_BADGE_BASE = "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"

/** COVERED / PARTIAL / LACKING for one feature (per region in the panel, across regions on the list). */
export function FeatureCoverageBadge({ status }: { status: string }) {
  if (status === "COVERED") {
    return (
      <span className={`${COVERAGE_BADGE_BASE} border-emerald-200 bg-emerald-50 text-emerald-700`}>
        <CheckCircle2 className="h-3 w-3" aria-hidden /> Covered
      </span>
    )
  }
  if (status === "PARTIAL") {
    return <span className={`${COVERAGE_BADGE_BASE} border-amber-200 bg-amber-50 text-amber-800`}>Partial</span>
  }
  if (status === "LACKING") {
    return (
      <span className={`${COVERAGE_BADGE_BASE} border-orange-200 bg-orange-50 text-orange-800`}>
        <AlertTriangle className="h-3 w-3" aria-hidden /> Lacking coverage
      </span>
    )
  }
  return <span className={`${COVERAGE_BADGE_BASE} border-slate-200 bg-slate-50 text-slate-600`}>{status.replaceAll("_", " ")}</span>
}

/** The list row's per-feature chips from `coverage`; nothing when the backend sent none. */
export function AccountCoverageChips({ accountId, coverage }: { accountId: string; coverage?: AccountFeatureCoverage[] | null }) {
  const items = Array.isArray(coverage)
    ? coverage.filter((item) => item && typeof item.label === "string" && item.label !== "" && typeof item.status === "string")
    : []
  if (!items.length) return null
  return (
    <ul aria-label={`Feature coverage for ${accountId}`} className="flex flex-col gap-1 pt-0.5">
      {items.map((item) => {
        const regions = item.status === "COVERED" ? [] : nonEmptyStrings(item.regions_lacking)
        return (
          <li key={item.feature || item.label} data-testid={`coverage-chip-${item.feature}`} className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
            <FeatureCoverageBadge status={item.status} />
            <span>{item.label}</span>
            {regions.length ? <span className="text-slate-500">· lacking in {regions.join(", ")}</span> : null}
          </li>
        )
      })}
    </ul>
  )
}

function sourceStatusTone(status: string): string {
  if (status === "PRESENT" || status === "RECORDING") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "PARTIAL" || status === "RECORDING_DAILY") return "border-amber-200 bg-amber-50 text-amber-800"
  return "border-orange-200 bg-orange-50 text-orange-800"
}

function SubHeading({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{children}</p>
}

function SourceLine({
  region,
  sourceKey,
  source,
  children,
}: {
  region: string
  sourceKey: RegionSourceKey
  source: SourceStatus
  children?: ReactNode
}) {
  return (
    <li data-testid={`region-source-${region}-${sourceKey}`} className="text-xs text-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-800">{regionSourceLabel(sourceKey)}</span>
        {typeof source.status === "string" && source.status ? (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${sourceStatusTone(source.status)}`}>
            {source.status.replaceAll("_", " ")}
          </span>
        ) : null}
      </div>
      {source.detail ? <p className="mt-0.5 text-slate-600">{source.detail}</p> : null}
      {children}
    </li>
  )
}

function VpcFlowExtras({ source }: { source: VpcFlowSourceStatus }) {
  const usable = nonEmptyStrings(source.usable_groups)
  const without = nonEmptyStrings(source.vpcs_without)
  return (
    <>
      {usable.length ? (
        <p className="mt-0.5 text-[11px] text-slate-500">
          Flow-log {usable.length === 1 ? "group" : "groups"} Cyntro reads: <span className="font-mono">{usable.join(", ")}</span>
        </p>
      ) : null}
      {without.length ? (
        <p className="mt-0.5 text-[11px] text-slate-500">
          Without a usable flow log: <span className="font-mono">{without.join(", ")}</span>
        </p>
      ) : null}
    </>
  )
}

function ConfigEniExtras({ source }: { source: ConfigEniSourceStatus }) {
  const baseline = source.baseline && typeof source.baseline === "object" ? source.baseline : null
  const interfaces = backendCount(baseline?.interfaces)
  const recorded = backendCount(baseline?.recorded)
  const provenStart = typeof source.proven_coverage_start === "string" && source.proven_coverage_start ? source.proven_coverage_start : null
  return (
    <>
      {/* Only the backend's proven start; a deployed stack or a recorder alone is not history. */}
      {provenStart ? (
        <p data-testid="config-eni-proven-start" className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" aria-hidden /> Recording proven since {formatUtcInstantExact(provenStart)}
        </p>
      ) : null}
      {interfaces !== null && recorded !== null ? (
        <p className="mt-0.5 text-[11px] text-slate-500">
          Baseline: {recorded} of {interfaces} network {interfaces === 1 ? "interface" : "interfaces"} recorded
        </p>
      ) : null}
    </>
  )
}

function ConfigCostLines({ cost }: { cost: ConfigCost }) {
  const price =
    cost.price && typeof cost.price === "object" && usdText(cost.price.usd_per_item) && cost.price.unit ? cost.price : null
  // No price, no dollar amount: the backend's USD fields are shown only beside the price they came from.
  const baselineUsd = price ? usdText(cost.baseline_usd) : null
  const monthlyUsd = price ? usdText(cost.monthly_usd_estimate) : null
  const baselineItems = backendCount(cost.baseline_items)
  const changes = backendCount(cost.changes_last_7_days)
  const monthlyItems = backendCount(cost.monthly_items_estimate)
  return (
    <ul data-testid="config-cost" className="space-y-1">
      {price ? (
        <li>
          Price: {usdText(price.usd_per_item)} per {price.unit}
          {price.usage_type ? <> (<span className="font-mono">{price.usage_type}</span>)</> : null}
          {price.source ? ` · ${price.source}` : ""}
          {price.effective ? `, effective ${formatCoverageInstant(price.effective)}` : ""}
        </li>
      ) : cost.price_unavailable ? (
        <li data-testid="config-cost-price-unavailable">{cost.price_unavailable}</li>
      ) : null}
      {baselineItems !== null ? (
        <li>
          One-time baseline: {baselineItems} configuration {baselineItems === 1 ? "item" : "items"} (one per current network interface)
          {baselineUsd ? ` — ${baselineUsd}` : ""}
        </li>
      ) : null}
      {changes !== null ? (
        <li>
          Last 7 days: {changeCountText(changes, cost.changes_complete)} network-interface {changes === 1 ? "change" : "changes"} in CloudTrail
        </li>
      ) : null}
      {monthlyItems !== null ? (
        <li>
          Estimated ongoing: {monthlyItems} configuration {monthlyItems === 1 ? "item" : "items"} per month
          {monthlyUsd ? ` — ${monthlyUsd} per month` : ""}
        </li>
      ) : null}
      {cost.basis ? <li className="text-slate-500">{cost.basis}</li> : null}
    </ul>
  )
}

/** offer CYNTRO_STACK: an optional, collapsed-by-default Config recorder stack scoped to this account and region. */
function OptionalConfigStack({ region, accountId, enablement }: { region: string; accountId: string; enablement: ConfigEnablement }) {
  const [open, setOpen] = useState(false)
  const contentId = `config-stack-${region}`
  const features = nonEmptyStrings(enablement.features_affected)
  const fields = nonEmptyStrings(enablement.extracted_fields)
  const parameters = Object.entries(enablement.parameters || {})
    .map(([name, value]) => [name, String(value ?? "").trim()] as const)
    .filter(([, value]) => value !== "")
  const templateHref = proxiedAccountAdminPath(enablement.template_path)
  const consoleUrl = safeExternalUrl(enablement.console_url)
  const stackName = typeof enablement.stack_name === "string" && enablement.stack_name ? enablement.stack_name : null
  const cli = typeof enablement.cli === "string" && enablement.cli ? enablement.cli : null
  return (
    <div data-testid={`config-enablement-${region}`} className="mt-3 rounded-lg border border-slate-200">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? contentId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-50"
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        Enable AWS Config for network interfaces in {region} (optional)
      </button>
      <p className="px-3 pb-2.5 text-[11px] text-slate-500">
        Optional: nothing is enabled unless you deploy this stack. Declining leaves the account connected
        {features.length
          ? `, with ${features.join(", ")} lacking coverage in ${region}.`
          : `, with the features that need it lacking coverage in ${region}.`}
      </p>
      {open ? (
        <div id={contentId} className="space-y-3 border-t border-slate-200 p-3 text-xs text-slate-600">
          {features.length ? (
            <div>
              <SubHeading>Features that need it</SubHeading>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
            </div>
          ) : null}
          {enablement.scope_statement ? (
            <div>
              <SubHeading>What it records</SubHeading>
              <p className="mt-1">{enablement.scope_statement}</p>
            </div>
          ) : null}
          {fields.length ? (
            <div>
              <SubHeading>Fields Cyntro reads</SubHeading>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {fields.map((field) => (
                  <li key={field} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">{field}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {enablement.cost && typeof enablement.cost === "object" ? (
            <div>
              <SubHeading>Estimated cost</SubHeading>
              <div className="mt-1">
                <ConfigCostLines cost={enablement.cost} />
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <SubHeading>Deploy it in account {accountId}, {region}</SubHeading>
            {templateHref || consoleUrl ? (
              <div className="flex flex-wrap gap-2">
                {templateHref ? (
                  <a
                    href={templateHref}
                    download
                    aria-label={`Download template for the ${region} Config stack`}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#008f7d] px-3 py-2 text-xs font-semibold text-white hover:bg-[#007c6d]"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden /> Download template
                  </a>
                ) : null}
                {consoleUrl ? (
                  <a
                    href={consoleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open CloudFormation in ${region} for the Config stack`}
                    className="inline-flex items-center gap-2 rounded-lg border border-teal-200 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                  >
                    Open CloudFormation in {region} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : null}
              </div>
            ) : null}
            {stackName ? (
              <p className="inline-flex flex-wrap items-center gap-2">
                Stack name <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">{stackName}</code>
                <CopyButton value={stackName} label={`Copy stack name for the ${region} Config stack`} />
              </p>
            ) : null}
            {parameters.length ? (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <tbody>
                    {parameters.map(([name, value]) => (
                      <tr key={name} className="border-b border-slate-100 last:border-b-0" data-testid={`config-parameter-${region}-${name}`}>
                        <th scope="row" className="w-48 bg-slate-50 px-3 py-2 align-top font-mono font-semibold text-slate-700">
                          {name}
                        </th>
                        <td className="px-3 py-2 align-top">
                          <span className="break-all font-mono text-slate-800">{value}</span>
                        </td>
                        <td className="w-24 px-3 py-2 text-right align-top">
                          <CopyButton value={value} label={`Copy ${name} for the ${region} Config stack`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {cli ? (
              <div className="flex items-start gap-2">
                <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-100">
                  {cli}
                </pre>
                <CopyButton value={cli} label={`Copy CLI command for the ${region} Config stack`} />
              </div>
            ) : null}
            <p className="text-[11px] text-slate-500">
              When the stack reaches CREATE_COMPLETE, press Check connection above. This Region then shows when recording is
              proven to have started, or the reason it is still unproven.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** offer ADJUST_EXISTING_RECORDER / CONTROL_TOWER_MANAGED / UNREADABLE: the backend's paragraph and steps, no stack. */
function ConfigRecorderInstructions({ region, enablement }: { region: string; enablement: ConfigEnablement }) {
  const steps = nonEmptyStrings(enablement.instructions)
  if (!enablement.detail && !steps.length) return null
  return (
    <div data-testid={`config-enablement-${region}`} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
      <p className="font-semibold text-slate-800">AWS Config for network interfaces in {region}</p>
      {enablement.detail ? <p className="mt-1">{enablement.detail}</p> : null}
      {steps.length ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}
        </ol>
      ) : null}
    </div>
  )
}

function ConfigEnablementBlock({ region, accountId, enablement }: { region: string; accountId: string; enablement?: ConfigEnablement | null }) {
  if (!enablement || typeof enablement !== "object" || typeof enablement.offer !== "string") return null
  if (enablement.offer === "NONE_NEEDED") return null
  if (enablement.offer === "CYNTRO_STACK") return <OptionalConfigStack region={region} accountId={accountId} enablement={enablement} />
  return <ConfigRecorderInstructions region={region} enablement={enablement} />
}

function RegionSourcesCard({ discovery, accountId }: { discovery: RegionDiscovery; accountId: string }) {
  const region = discovery.region
  const features = Array.isArray(discovery.features)
    ? discovery.features.filter(
        (feature) => feature && typeof feature.label === "string" && feature.label !== "" && typeof feature.status === "string",
      )
    : []
  const sources = discovery.sources && typeof discovery.sources === "object" ? discovery.sources : {}
  const present = REGION_SOURCE_KEYS.filter((key) => sources[key] && typeof sources[key] === "object")
  return (
    <div role="group" aria-label={`Data sources in ${region}`} data-testid={`region-sources-${region}`} className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-sm font-semibold text-slate-900">{region}</p>
        {discovery.discovered_at ? (
          <p className="text-[11px] text-slate-400">Read {formatCoverageInstant(discovery.discovered_at)}</p>
        ) : null}
      </div>
      {features.length ? (
        <div className="mt-3">
          <SubHeading>Features</SubHeading>
          <ul className="mt-1.5 space-y-2">
            {features.map((feature) => {
              const lacking =
                feature.status === "COVERED"
                  ? []
                  : (Array.isArray(feature.lacking) ? feature.lacking : []).filter(
                      (item) => item && typeof item.source === "string" && typeof item.reason === "string",
                    )
              return (
                <li key={feature.feature || feature.label} data-testid={`region-feature-${region}-${feature.feature}`} className="text-xs text-slate-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <FeatureCoverageBadge status={feature.status} />
                    <span>{feature.label}</span>
                  </div>
                  {lacking.length ? (
                    <ul className="mt-1 space-y-0.5 pl-5 text-[11px] text-slate-600">
                      {lacking.map((item) => (
                        <li key={`${item.source}-${item.reason}`}>
                          <span className="font-semibold text-slate-700">{regionSourceLabel(item.source)}</span>: {item.reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      {present.length ? (
        <div className="mt-3">
          <SubHeading>Sources</SubHeading>
          <ul className="mt-1.5 space-y-2">
            {present.map((key) => {
              const source = sources[key] as SourceStatus
              return (
                <SourceLine key={key} region={region} sourceKey={key} source={source}>
                  {key === "vpc_flow" ? <VpcFlowExtras source={source as VpcFlowSourceStatus} /> : null}
                  {key === "config_eni" ? <ConfigEniExtras source={source as ConfigEniSourceStatus} /> : null}
                </SourceLine>
              )
            })}
          </ul>
        </div>
      ) : null}
      <ConfigEnablementBlock region={region} accountId={accountId} enablement={discovery.config_enablement} />
    </div>
  )
}

/** "Data sources by Region": what the connector found per region, per feature, with the backend's own sentences. */
function DataSourcesByRegion({ regions, accountId }: { regions: RegionDiscovery[]; accountId: string }) {
  return (
    <section aria-labelledby="data-sources-by-region-title" data-testid="data-sources-by-region" className="rounded-xl border border-slate-200 p-5">
      <h3 id="data-sources-by-region-title" className="text-sm font-semibold text-slate-900">
        Data sources by Region
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        What Cyntro found in each Region of this account and which features each source supports. A missing source does not
        block the connection; the features that need it are marked as lacking coverage.
      </p>
      <div className="mt-3 space-y-3">
        {regions.map((discovery) => (
          <RegionSourcesCard key={discovery.region} discovery={discovery} accountId={accountId} />
        ))}
      </div>
    </section>
  )
}

export function ConnectAccountPanel({
  customerId,
  accountId,
  account,
  failedRequests,
  onClose,
  onCheckConnection,
}: {
  customerId: string
  accountId: string
  /** The account's live row from the list (re-read while the page polls). */
  account: ManagedAccount | null
  failedRequests: FailedAccountRequest[]
  onClose: () => void
  /** POST validate; resolves the backend's `requested_at` for the request. */
  onCheckConnection: (accountId: string) => Promise<string>
}) {
  const [instructions, setInstructions] = useState<ConnectionInstructions | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; trustNotReady: boolean } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [requesting, setRequesting] = useState(false)
  const [checkRequestedAt, setCheckRequestedAt] = useState<string | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [rereadError, setRereadError] = useState<string | null>(null)
  const connectUrl = `/api/proxy/admin/accounts/${encodeURIComponent(accountId)}/connect?customer_id=${encodeURIComponent(customerId)}`

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(connectUrl, { cache: "no-store" })
        if (!response.ok) throw await accountAdminFailure(response, "Connection instructions")
        const body = (await response.json()) as ConnectionInstructions
        if (!cancelled) setInstructions(body)
      } catch (reason) {
        if (cancelled) return
        const trustMessage = memberTrustNotReadyMessage(reason)
        setInstructions(null)
        setError({
          message: trustMessage ?? (reason instanceof Error ? reason.message : String(reason)),
          trustNotReady: trustMessage !== null,
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [connectUrl, reloadKey])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function checkConnection() {
    setRequesting(true)
    setCheckError(null)
    try {
      setCheckRequestedAt(await onCheckConnection(accountId))
    } catch (reason) {
      setCheckError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRequesting(false)
    }
  }

  const outcome = checkRequestedAt ? connectionCheckOutcome(accountId, account, failedRequests, checkRequestedAt) : null
  const finishedCheck = outcome?.state === "FINISHED" ? checkRequestedAt : null

  // A finished check re-ran discovery: re-read the instructions once, quietly, so the per-region
  // sources (e.g. a newly proven Config start) are the connector's latest, not the panel's first read.
  useEffect(() => {
    if (!finishedCheck) return
    let cancelled = false
    async function reread() {
      try {
        const response = await fetch(connectUrl, { cache: "no-store" })
        if (!response.ok) throw await accountAdminFailure(response, "Re-reading the data sources")
        const body = (await response.json()) as ConnectionInstructions
        if (!cancelled) {
          setInstructions(body)
          setRereadError(null)
        }
      } catch (reason) {
        if (!cancelled) setRereadError(reason instanceof Error ? reason.message : String(reason))
      }
    }
    void reread()
    return () => {
      cancelled = true
    }
  }, [finishedCheck, connectUrl])

  const regions = regionDiscoveries(instructions?.notes)
  const parameters = Object.entries(instructions?.parameters || {})
    .map(([name, value]) => [name, String(value ?? "").trim()] as const)
    .filter(([, value]) => value !== "")
  const consoleUrl = safeExternalUrl(instructions?.console_url)

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-slate-950/45 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-account-title"
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-slate-200 p-6">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Connect AWS account</p>
            <h2 id="connect-account-title" className="mt-1 truncate text-xl font-semibold">
              {account?.display_name || accountId}
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{accountId}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {loading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading connection instructions
            </div>
          ) : error ? (
            <div
              role="alert"
              className={`flex items-start justify-between gap-4 rounded-xl border p-4 text-sm ${
                error.trustNotReady ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  {error.trustNotReady ? <p className="font-semibold">Member trust is not ready</p> : null}
                  <p className={error.trustNotReady ? "mt-1" : undefined}>{error.message}</p>
                </div>
              </div>
              <button onClick={() => setReloadKey((value) => value + 1)} className="shrink-0 font-semibold">
                Retry
              </button>
            </div>
          ) : instructions ? (
            <>
              <Step number={1} title="Download the connection stack">
                <p>The CloudFormation template shipped with this release. It creates the roles Cyntro reads this account through.</p>
                <a
                  href={proxiedTemplatePath(instructions.template_path)}
                  download
                  className="inline-flex items-center gap-2 rounded-lg bg-[#008f7d] px-3 py-2 text-xs font-semibold text-white hover:bg-[#007c6d]"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden /> Download template
                </a>
              </Step>

              <Step
                number={2}
                title={`Sign in to account ${instructions.account_id || accountId} and open CloudFormation in ${instructions.region}`}
              >
                <p>Use a session in that account itself, with permission to create IAM roles.</p>
                {consoleUrl ? (
                  <a
                    href={consoleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-teal-200 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                  >
                    Open CloudFormation in {instructions.region} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : (
                  <p className="text-xs text-slate-500">
                    The backend returned no console link. Open CloudFormation in {instructions.region} yourself.
                  </p>
                )}
              </Step>

              <Step number={3} title="Create the stack">
                <ol className="list-decimal space-y-1.5 pl-5">
                  <li>Create stack → Upload a template file → choose the downloaded template.</li>
                  <li>
                    <span className="inline-flex flex-wrap items-center gap-2">
                      Stack name <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">{instructions.stack_name}</code>
                      <CopyButton value={instructions.stack_name} label="Copy stack name" />
                    </span>
                  </li>
                  <li>Enter these parameters:</li>
                </ol>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <tbody>
                      {parameters.map(([name, value]) => (
                        <tr key={name} className="border-b border-slate-100 last:border-b-0" data-testid={`connect-parameter-${name}`}>
                          <th scope="row" className="w-48 bg-slate-50 px-3 py-2 align-top font-mono font-semibold text-slate-700">
                            {name}
                          </th>
                          <td className="px-3 py-2 align-top">
                            {name === "ExternalId" ? (
                              <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-mono text-amber-900">
                                <KeyRound className="h-3 w-3 shrink-0" aria-hidden />
                                <span className="break-all">{value}</span>
                              </span>
                            ) : (
                              <span className="break-all font-mono text-slate-800">{value}</span>
                            )}
                          </td>
                          <td className="w-24 px-3 py-2 text-right align-top">
                            <CopyButton value={value} label={`Copy ${name}`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parameters.some(([name]) => name === "ExternalId") ? (
                  <p className="text-xs text-slate-500">
                    ExternalId is not a secret (the roles also require this platform account and your Organization), but it must be entered exactly.
                  </p>
                ) : null}
                <OptionalParameterNotes instructions={instructions} />
                <p>Then acknowledge that CloudFormation might create IAM resources with custom names, and choose Create stack.</p>
              </Step>

              <Step number={4} title="Check connection">
                <p>When the stack reaches CREATE_COMPLETE, ask Cyntro to check the account. The account connector runs the check within seconds.</p>
                <button
                  onClick={() => void checkConnection()}
                  disabled={requesting || outcome?.state === "PENDING"}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#008f7d] px-3 py-2 text-xs font-semibold text-white hover:bg-[#007c6d] disabled:opacity-50"
                >
                  {requesting || outcome?.state === "PENDING" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Check connection
                </button>
                <div role="status" className="space-y-1.5">
                  {checkError ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{checkError}</p>
                  ) : requesting ? (
                    <p className="text-xs text-slate-500">Requesting a connection check…</p>
                  ) : outcome?.state === "PENDING" ? (
                    <p className="text-xs text-slate-500">Waiting for the account connector to finish the check…</p>
                  ) : outcome?.state === "FAILED" ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                      The account connector could not run the check: {outcome.detail || "it recorded no detail."}
                    </p>
                  ) : outcome?.state === "FINISHED" ? (
                    <>
                      <MemberStatusBadge status={outcome.status} />
                      {outcome.status === "CONNECTED" ? <OperationalNotCompleteNote accountId={accountId} /> : null}
                      {outcome.message ? <p className="text-xs text-slate-700">{outcome.message}</p> : null}
                      <DiscoveryLines account={account} />
                      {rereadError ? <p className="text-xs text-amber-800">{rereadError}</p> : null}
                      {outcome.status === "CONNECTED" && instructions.notes?.discovered === false ? (
                        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          Cyntro can now read this account. Reload the parameters to see the flow-log groups and EKS clusters it found.
                          <button
                            onClick={() => setReloadKey((value) => value + 1)}
                            className="inline-flex items-center gap-1 font-semibold text-teal-700"
                          >
                            <RefreshCw className="h-3 w-3" aria-hidden /> Reload parameters
                          </button>
                        </p>
                      ) : null}
                    </>
                  ) : account ? (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Current status</p>
                      <MemberStatusBadge status={account.onboarding_status} />
                      {account.onboarding_status === "CONNECTED" ? <OperationalNotCompleteNote accountId={account.account_id} /> : null}
                      {account.validation_message ? <p className="text-xs text-slate-600">{account.validation_message}</p> : null}
                      <DiscoveryLines account={account} />
                    </>
                  ) : null}
                </div>
              </Step>

              {instructions.cli ? (
                <details className="rounded-xl border border-slate-200 p-4">
                  <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                    <Terminal className="h-4 w-4" aria-hidden /> Use the AWS CLI instead
                  </summary>
                  <p className="mt-3 text-xs text-slate-500">
                    Run it with credentials for account {instructions.account_id || accountId}, from the folder holding the downloaded template.
                  </p>
                  <div className="mt-2 flex items-start gap-2">
                    <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-100">
                      {instructions.cli}
                    </pre>
                    <CopyButton value={instructions.cli} label="Copy CLI command" />
                  </div>
                </details>
              ) : null}

              {regions.length ? <DataSourcesByRegion regions={regions} accountId={instructions.account_id || accountId} /> : null}
            </>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
