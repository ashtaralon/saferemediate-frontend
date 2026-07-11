/**
 * Attack Paths mode-bar policy (PRD FR9 / S4).
 *
 * Primary journey = Attack Path (−1/0/1). Attacker Map + Lateral are folded
 * into Zoom 1 (topology + lateral overlay). Deep-link ?mode= still renders
 * those surfaces; they are not operator-facing chips.
 */

export type AttackPathsMode =
  | "attack-path"
  | "exposure"
  | "attacker_v2"
  | "phase"
  | "exfil"
  | "topology"
  | "lateral"
  | "attacker_map"
  | "convergence"

/** Modes folded into Zoom 1 — hidden from the primary mode bar. */
export const FOLDED_MODE_KEYS: ReadonlySet<AttackPathsMode> = new Set([
  "attacker_map",
  "lateral",
])

export type ModeTabDef = {
  key: AttackPathsMode
  label: string
  title: string
}

const PRIMARY_TABS: ModeTabDef[] = [
  {
    key: "attack-path",
    label: "Attack Path",
    title:
      "Attacker lens −1/0/1 — system blast radius, jewel fan-in, then path investigation with cut card. Topology and lateral live inside Zoom 1.",
  },
  {
    key: "convergence",
    label: "Convergence",
    title:
      "Every path to this crown jewel, fanned over real AWS subnet and security-group placement — observed vs configured paths ranked together.",
  },
  {
    key: "exposure",
    label: "Exposure",
    title: "Aggregate view — every workload, role, and policy that exposes this jewel.",
  },
  {
    key: "exfil",
    label: "Exfiltration",
    title:
      "Where does the data go from here? Every door the data can leave through — capable vs actively observed.",
  },
  {
    key: "topology",
    label: "Topology",
    title:
      "3-pane Attack Graph on AWS topology — crown jewels left, real VPC containment center, paths ranked by damage right. Every node from Neo4j.",
  },
]

const BETA_TABS: ModeTabDef[] = [
  {
    key: "attacker_v2",
    label: "Attack Map (beta)",
    title:
      "Typed, edge-proven canvas — every node and edge comes from an explicit Neo4j relationship; the renderer does zero inference.",
  },
  {
    key: "phase",
    label: "Phases (beta)",
    title:
      "Attacker-phase map (Entry → Reach → Land → Steal Creds → Become → Reach Data → Exfil + Persist + Defense). Reads materialized AttackPath nodes; every line is a real Neo4j edge.",
  },
]

/** Primary (+ optional beta) chips — never includes folded Attacker Map / Lateral. */
export function buildModeBarTabs(showBeta = false): ModeTabDef[] {
  return showBeta ? [...PRIMARY_TABS, ...BETA_TABS] : [...PRIMARY_TABS]
}

/**
 * Folded deep-links highlight Attack Path so the bar stays honest
 * (chips for Attacker Map / Lateral are gone).
 */
export function modeBarHighlight(mode: AttackPathsMode): AttackPathsMode {
  return FOLDED_MODE_KEYS.has(mode) ? "attack-path" : mode
}
