/**
 * Linear Cloud Graph layout — the "execution spine" reading left → right:
 *   Internet → Internet Gateway → [ WORKLOAD: EC2 + folded SG (+ profile) ]
 *            → IAM role → S3 crown jewel → (exfil back to the same IGW)
 *
 * Replaces the nested AWS-containment layout for the Cloud Graph. It keeps the
 * data binding (buildContainmentFromArchitecture produces the cards/edges); this
 * module only RE-POSITIONS those same cards into the spine and synthesizes a
 * clean set of spine edges, then hands off to the existing nested renderer
 * (layoutContainmentNested) so node/edge React components are reused verbatim.
 *
 * Grouping rules (per design): the security group is folded onto the EC2 card it
 * secures (handled upstream in build-containment); the IAM role sits immediately
 * left of the crown jewel it reaches; network context (VPC/subnet/route/NACL)
 * becomes the frame around the workload rather than competing nodes.
 */

import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { CMCard, CMEdge, CMFrame, ContainmentModel } from "./containment-model"
import type { ContainmentViewMode } from "./build-containment-from-architecture"
import { layoutContainmentNested, type CloudGraphFlowResult } from "./build-cloud-graph-flow"

const CARD_W = 210
const GAP_X = 84
const CENTER_Y = 260
const V_GAP = 14
const SUBNET_HEADER = 30
const VPC_HEADER = 26
const PAD = 14

function clone(card: CMCard, x: number, y: number): CMCard {
  return { ...card, x, y, w: CARD_W }
}

function spineEdge(
  from: CMCard | undefined,
  to: CMCard | undefined,
  opts: { label: string; observed?: boolean | null; style?: CMEdge["style"] },
): CMEdge | null {
  if (!from || !to) return null
  return {
    id: `lin-${from.id}__${to.id}`,
    d: "",
    style: opts.style ?? "path",
    color: opts.observed ? "#16a34a" : "#9AA6B5",
    label: opts.label,
    layer: "path",
    sourceId: from.id,
    targetId: to.id,
    observed: opts.observed ?? false,
    flowActive: opts.observed === true,
  }
}

/** Stack a column of cards vertically, centered on CENTER_Y, at absolute x. */
function stackColumn(cards: CMCard[], x: number, out: CMCard[]): { top: number; bottom: number } | null {
  if (cards.length === 0) return null
  const totalH = cards.reduce((s, c) => s + c.h, 0) + V_GAP * (cards.length - 1)
  let cy = CENTER_Y - totalH / 2
  const top = cy
  for (const c of cards) {
    out.push(clone(c, x, cy))
    cy += c.h + V_GAP
  }
  return { top, bottom: cy - V_GAP }
}

const isGateway = (c: CMCard) =>
  /internet gateway/i.test(c.title) || /igw/i.test(c.sub ?? "") || /igw-/i.test(c.title)
const isEntry = (c: CMCard) => c.id === "user" || c.cat === "user"
const isProfile = (c: CMCard) => c.badge === "PROFILE" || c.sub === "Instance profile"
const isPolicy = (c: CMCard) => c.badge === "POLICY" || c.sub === "IAM policy"
const isRole = (c: CMCard) =>
  c.sub === "IAM role" ||
  (c.cat === "security" && !isProfile(c) && !isPolicy(c) && c.badge !== "ENCRYPTS" && !/kms|key/i.test(c.title))
const isJewel = (c: CMCard) => c.badge === "CROWN JEWEL"
const isKms = (c: CMCard) => c.badge === "ENCRYPTS" || /kms|key/i.test(c.title)
const isNetworkCtrl = (c: CMCard) =>
  c.sub === "NACL" || c.sub === "Route table" || /nacl|acl-/i.test(c.title) || /security group/i.test(c.sub ?? "")
const isFoothold = (c: CMCard) => c.badge === "FOOTHOLD"
const isCompute = (c: CMCard) => c.cat === "compute"

/**
 * Re-position EVERY card the model carries for this path into the linear spine,
 * bucketed by AWS layer. Nothing on the path is dropped — internet, IGW, the
 * subnet's NACL, both IAM policies, etc. all get a place.
 */
export function buildLinearModel(
  model: ContainmentModel,
  _viewMode: ContainmentViewMode,
): ContainmentModel {
  const cards = model.cards
  const find = (pred: (c: CMCard) => boolean) => cards.find(pred)

  const internet = find(isEntry)
  const igw = find(isGateway)
  // Honesty over completeness: no fabricated nodes. The real "user" (internet)
  // card is created upstream only when the foothold has genuine internet
  // INGRESS (is_internet_exposed). When it's absent, the IGW is still a real
  // EGRESS for this path (subnet ROUTES_VIA it; the jewel EXFILTRATES_VIA it),
  // so it's placed on the RIGHT as the exfil destination instead of faking a
  // left-side entry.
  const hasIngress = !!internet

  const foothold = find(isFoothold) ?? find((c) => isCompute(c) && c.onPath)
  const jewel = find(isJewel) ?? find((c) => c.cat === "storage" && c.onPath)
  const role = find(isRole)

  // Buckets — everything not an entry/gateway/role/jewel/kms lives in the workload
  // column (compute, instance profile, NACL/route/SG context, sibling compute).
  const claimed = new Set<string>(
    [internet, igw, foothold, jewel, role].filter(Boolean).map((c) => (c as CMCard).id),
  )
  const policies = cards.filter((c) => isPolicy(c))
  const kmsCards = cards.filter((c) => isKms(c) && !claimed.has(c.id))
  policies.forEach((c) => claimed.add(c.id))
  kmsCards.forEach((c) => claimed.add(c.id))

  // In "just this path" only THIS path's own infra travels with the workload
  // (profile + the subnet's NACL/SG/route). Sibling compute belongs to other
  // paths, so it's shown only in "full environment".
  const includeSiblings = _viewMode === "full"
  const workloadExtras = cards.filter(
    (c) =>
      !claimed.has(c.id) &&
      !isJewel(c) &&
      (isProfile(c) || isNetworkCtrl(c) || (includeSiblings && isCompute(c))),
  )
  workloadExtras.forEach((c) => claimed.add(c.id))

  const out: CMCard[] = []
  const frames: CMFrame[] = []
  let x = PAD + 10

  // ── Ingress columns — only when the foothold is genuinely internet-exposed ──
  if (hasIngress && internet) {
    stackColumn([internet], x, out)
    x += CARD_W + GAP_X
  }
  if (hasIngress && igw) {
    stackColumn([igw], x, out)
    x += CARD_W + GAP_X
  }

  // Column 3 — WORKLOAD: foothold first, then profile, then network controls /
  // siblings, wrapped in subnet + VPC frames.
  const orderRank = (c: CMCard) =>
    isFoothold(c) ? 0 : isCompute(c) ? 1 : isProfile(c) ? 2 : 3
  const workCards = [foothold, ...workloadExtras]
    .filter(Boolean)
    .filter((c, i, a) => a.findIndex((d) => d!.id === c!.id) === i) as CMCard[]
  workCards.sort((a, b) => orderRank(a) - orderRank(b))
  if (workCards.length > 0) {
    const span = stackColumn(workCards, x + PAD, out)!
    const subnetSrc = model.frames.find((f) => f.kind === "subnet")
    const vpcSrc = model.frames.find((f) => f.kind === "vpc")
    const subnet: CMFrame = {
      id: subnetSrc?.id ?? "lin-subnet",
      x,
      y: span.top - SUBNET_HEADER,
      w: CARD_W + PAD * 2,
      h: span.bottom - span.top + SUBNET_HEADER + PAD,
      rx: 9,
      kind: "subnet",
      label: subnetSrc?.label ?? "Public subnet",
      sub: subnetSrc?.sub,
      layer: "ctx",
    }
    const vpc: CMFrame = {
      id: vpcSrc?.id ?? "lin-vpc",
      x: x - PAD,
      y: subnet.y - VPC_HEADER,
      w: subnet.w + PAD * 2,
      h: subnet.h + VPC_HEADER + PAD,
      rx: 11,
      kind: "vpc",
      label: vpcSrc?.label ?? `VPC · ${model.meta.vpcId}`,
      sub: vpcSrc?.sub,
      layer: "ctx",
    }
    frames.push(vpc, subnet)
    x = vpc.x + vpc.w + GAP_X
  }

  // Column 4 — IAM role (+ its policies stacked beneath)
  const identityCards = [role, ...policies].filter(Boolean) as CMCard[]
  if (identityCards.length > 0) {
    stackColumn(identityCards, x, out)
    x += CARD_W + GAP_X
  }

  // Column 5 — Crown jewel (+ KMS stacked beneath)
  const dataCards = [jewel, ...kmsCards].filter(Boolean) as CMCard[]
  if (dataCards.length > 0) {
    stackColumn(dataCards, x, out)
    x += CARD_W + GAP_X
  }

  // ── Egress column — the IGW on the RIGHT as the exfil destination when it
  //    isn't an ingress gateway (subnet ROUTES_VIA / jewel EXFILTRATES_VIA). ──
  if (!hasIngress && igw) {
    stackColumn([igw], x, out)
    x += CARD_W + GAP_X
  }

  // ── synthesize the spine (mirrors the Neo4j hop chain) ──
  const profile = workCards.find(isProfile)
  const roleObserved =
    model.edges.find((e) => e.targetId === jewel?.id && e.observed === true)?.observed ?? true
  const edges = [
    hasIngress ? spineEdge(internet, igw, { label: "reaches" }) : null,
    hasIngress ? spineEdge(igw, foothold, { label: "reaches" }) : null,
    profile ? spineEdge(foothold, profile, { label: "instance profile" }) : null,
    profile
      ? spineEdge(profile, role, { label: "uses_role" })
      : spineEdge(foothold, role, { label: "uses_role" }),
    ...policies.map((p) => spineEdge(role, p, { label: "has_policy", style: "priv" })),
    spineEdge(role, jewel, { label: "accesses", observed: roleObserved }),
    ...kmsCards.map((k) => spineEdge(jewel, k, { label: "encrypted by", style: "enc" })),
    igw ? spineEdge(jewel, igw, { label: "exfiltrates via IGW", style: "priv" }) : null,
  ].filter(Boolean) as CMEdge[]

  const width = x + PAD
  const maxBottom = Math.max(
    ...out.map((c) => c.y + c.h),
    ...frames.map((f) => f.y + f.h),
    CENTER_Y,
  )
  return {
    ...model,
    width,
    height: maxBottom + PAD + 20,
    frames,
    cards: out,
    notes: [],
    edges,
  }
}

export async function layoutCloudGraphLinear(
  model: ContainmentModel,
  path: IdentityAttackPath,
  viewMode: ContainmentViewMode,
): Promise<CloudGraphFlowResult> {
  return layoutContainmentNested(buildLinearModel(model, viewMode), path, viewMode)
}
