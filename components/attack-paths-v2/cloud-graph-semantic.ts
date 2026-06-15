// Attack-path visual-priority rule — single source of truth for "what role
// does this node play in the attack chain, and how should it look?"
//
// The map ALREADY carries every semantic distinction (cat, badge, onPath) — we
// just classify into 5 attack-relevance buckets and let the visual layer
// enforce a hierarchy where the spine dominates and supporting infrastructure
// recedes. Same data; ranked by attack-relevance, not by service type.

import { CG } from "./cloud-graph-tokens"

export type SemanticClass =
  | "ENTRY"     // attacker's first foothold — User/Internet, public ALB, the EC2 they pop
  | "IDENTITY"  // what the attacker BECOMES — IAMRole, InstanceProfile, AccessKey
  | "JEWEL"     // the target — S3 bucket, RDS, DynamoDB, KMS (data), Secret
  | "CONTROL"   // the AWS controls the path passes through — NACL, SG, RT, VPCE, IGW, KMS-as-encrypt
  | "OFF_SPINE" // exists in the topology but not on THIS attack — recedes

/** Classify a card's role in the attack chain from existing CMCard fields.
 *  Order matters: badges (FOOTHOLD / CROWN JEWEL) are AUTHORITATIVE attack-spine
 *  markers — they win over categories. `onPath` alone is too loose: in "full
 *  environment" mode the architecture marks sibling workloads as onPath=true
 *  so they render in the canvas, but they aren't on THIS attack chain. Only
 *  IDENTITY (IAM) and STORAGE (the jewel side of a path) can be promoted to
 *  on-spine treatment via onPath without a badge — compute without the
 *  FOOTHOLD badge is just a topology sibling and stays OFF_SPINE. */
export function classifyNodeSemantic(card: {
  cat: string
  badge?: string
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
  if (card.cat === "network") return "CONTROL"   // NACL, SG, RT, VPCE, IGW
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
    border: CG.attack, // red
    width: 2,
    glow: "0 0 0 1px rgba(217,48,63,0.18), 0 0 14px rgba(217,48,63,0.35)",
    opacity: 1.0,
  },
  IDENTITY: {
    border: CG.type.identity, // magenta/purple
    width: 2,
    glow: "0 0 0 1px rgba(192,70,139,0.18), 0 0 12px rgba(192,70,139,0.30)",
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
    border: CG.border,
    width: 1,
    glow: "0 1px 2px rgba(16,24,40,0.03)",
    opacity: 0.65,
  },
  OFF_SPINE: {
    border: CG.border,
    width: 1,
    glow: "0 1px 2px rgba(16,24,40,0.02)",
    opacity: 0.38,
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
    stroke: CG.attack,
    width: 3,
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
