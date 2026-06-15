// Attack-path visual-priority rule — single source of truth for "what role
// does this node play in the attack chain, and how should it look?"
//
// The map ALREADY carries every semantic distinction (cat, badge, onPath) — we
// just classify into 6 attack-relevance buckets and let the visual layer
// enforce a hierarchy where the spine dominates and supporting infrastructure
// recedes. Same data; ranked by attack-relevance, not by service type.
//
// HARD COLOR-AUTHORITY RULE (ratified 2026-06-15 critique):
//   🔴 red appears in EXACTLY ONE place — the ENTRY node border. Never on
//      edges, never on "generic path highlighting", never as a category color.
//   🟣 IDENTITY = magenta — what the attacker BECOMES
//   🔵 NETWORK  = deep blue — the path's TRANSIT primitives (IGW/VPC/Subnet/VPCE)
//   🟡 JEWEL    = gold — the target
//   ⚫ CONTROL  = gray — config metadata that SUPPORTS the path (SG/NACL/RT),
//                neutral, not a "danger" signal
//   spine edges are deep SLATE with a moving white dot — fiber-optic transit,
//                not "every line is on fire"

import { CG } from "./cloud-graph-tokens"

export type SemanticClass =
  | "ENTRY"     // attacker's first foothold — User/Internet, public ALB, the EC2 they pop
  | "IDENTITY"  // what the attacker BECOMES — IAMRole, InstanceProfile, AccessKey
  | "NETWORK"   // the conduit the attack TRAVERSES — IGW, VPC, Subnet, VPCE
  | "JEWEL"     // the target — S3 bucket, RDS, DynamoDB, KMS (data), Secret
  | "CONTROL"   // config metadata (SG/NACL/RT) — supports the path but isn't the path
  | "OFF_SPINE" // exists in the topology but not on THIS attack — recedes

// Network elements that act as the attack's TRANSIT layer — these are the
// conduit through which the attacker moves. Distinct from config metadata
// (SG/NACL/RT) which gates the path but isn't the path. Title-based detection
// because CMCard.cat lumps both under "network".
const NETWORK_CONDUIT_RE =
  /internet gateway|vpc endpoint|nat gateway|vpce\b|^igw|vpc · |^vpc\b|subnet/i

/** Classify a card's role in the attack chain from existing CMCard fields.
 *  Order matters: badges (FOOTHOLD / CROWN JEWEL) are AUTHORITATIVE attack-spine
 *  markers — they win over categories. `onPath` alone is too loose: in "full
 *  environment" mode the architecture marks sibling workloads as onPath=true
 *  so they render in the canvas, but they aren't on THIS attack chain. Only
 *  IDENTITY (IAM) and STORAGE (the jewel side of a path) can be promoted to
 *  on-spine treatment via onPath without a badge — compute without the
 *  FOOTHOLD badge is just a topology sibling and stays OFF_SPINE.
 *
 *  Network cards split into two semantic classes:
 *    NETWORK — transit conduit (IGW, VPC, Subnet, VPCE) on the path
 *    CONTROL — config metadata (SG, NACL, RT) on the path
 *  Both render distinctly so the CISO eye can separate "where the attack
 *  passes through" from "the rules that govern the passage". */
export function classifyNodeSemantic(card: {
  cat: string
  badge?: string
  title?: string
  onPath: boolean
}): SemanticClass {
  // 1) Badges are authoritative — attack-spine role declared explicitly.
  if (card.badge === "CROWN JEWEL") return "JEWEL"
  if (card.badge === "FOOTHOLD") return "ENTRY"
  // 2) User/Internet card — always the external attacker origin.
  if (card.cat === "user") return "ENTRY"
  // 3) For everything else, `onPath` is required AND we trust the category
  //    only when it disambiguates a real attack-chain role.
  if (!card.onPath) return "OFF_SPINE"
  if (card.cat === "security") return "IDENTITY" // IAM role / profile / user
  if (card.cat === "storage") return "JEWEL"     // on-path storage = the jewel
  if (card.cat === "network") {
    // Transit conduit vs config metadata — different visual roles.
    if (card.title && NETWORK_CONDUIT_RE.test(card.title)) return "NETWORK"
    return "CONTROL"
  }
  // 4) Compute on-path WITHOUT FOOTHOLD badge: sibling workload shown by the
  //    "full environment" toggle, not part of the attack chain. Recede.
  if (card.cat === "compute") return "OFF_SPINE"
  return "CONTROL"
}

export interface SemanticToken {
  border: string
  width: number
  /** Multi-layer boxShadow — first layer = soft tint, second = bloom. */
  glow: string
  /** Final opacity (data.dimmed and data.focused can override downward). */
  opacity: number
  /** Optional background tint for high-value classes (JEWEL). */
  bg?: string
}

export const SEMANTIC_TOKENS: Record<SemanticClass, SemanticToken> = {
  ENTRY: {
    // RED IS RESERVED FOR ONLY THIS CLASS. Never on edges. Never on any other
    // node. This is the one place the operator should see the danger color.
    border: CG.attack, // red #D9303F
    width: 2,
    glow: "0 0 0 1px rgba(217,48,63,0.18), 0 0 14px rgba(217,48,63,0.35)",
    opacity: 1.0,
  },
  IDENTITY: {
    border: CG.type.identity, // magenta #C0468B
    width: 2,
    glow: "0 0 0 1px rgba(192,70,139,0.18), 0 0 12px rgba(192,70,139,0.30)",
    opacity: 1.0,
  },
  NETWORK: {
    // Deep blue — "transit / reachability". IGW, VPC, Subnet, VPCE on path.
    // Distinct hue from CG.type.network (purple) which is the legacy service
    // category color — semantic NETWORK gets its own deeper blue.
    border: "#1d6fe0",
    width: 2,
    glow: "0 0 0 1px rgba(29,111,224,0.18), 0 0 12px rgba(29,111,224,0.28)",
    opacity: 1.0,
  },
  JEWEL: {
    border: "#C99312", // gold
    width: 2,
    glow: "0 0 0 1px rgba(201,147,18,0.22), 0 0 16px rgba(201,147,18,0.40)",
    opacity: 1.0,
    bg: "rgba(255,250,235,1)", // warm cream
  },
  CONTROL: {
    // Neutral gray — config metadata (SG/NACL/RT). Supports the path but
    // does not compete for attention. Reads as "infrastructure rule", not
    // "danger".
    border: "#9AA8B8",
    width: 1,
    glow: "0 1px 2px rgba(16,24,40,0.03)",
    opacity: 0.75,
  },
  OFF_SPINE: {
    border: CG.border,
    width: 1,
    glow: "0 1px 2px rgba(16,24,40,0.02)",
    opacity: 0.35,
  },
}

/** Edge treatment — only two classes: on-spine (the attack chain) vs off-spine. */
export interface SpineEdgeToken {
  stroke: string
  width: number
  opacity: number
  /** Animated dash pulse — only on-spine. */
  animate: boolean
}

export const SPINE_EDGE: { onSpine: SpineEdgeToken; offSpine: SpineEdgeToken } = {
  onSpine: {
    // Deep slate — "fiber-optic transit". Color authority rule: red is
    // RESERVED for the ENTRY node only, so the spine edges cannot duplicate
    // that signal. The moving white dot (animateMotion in CloudGraphEdge)
    // carries the kinetic energy; the stroke itself reads as structural,
    // not "on fire".
    stroke: "#2b3a4b",
    width: 2.5,
    opacity: 1.0,
    animate: true,
  },
  offSpine: {
    stroke: CG.faint,
    width: 1,
    opacity: 0.35,
    animate: false,
  },
}
