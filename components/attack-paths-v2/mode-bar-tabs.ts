/**
 * Attack Paths mode-bar policy.
 *
 * Primary journey = Attack Path (−1/0/1). Attacker Map + Lateral sit next to
 * it as dedicated presentation surfaces (operator-requested restore after S4
 * folded them). Deep-link ?mode= still works for every tab.
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

/** No modes folded from the primary bar (S4 fold reverted for Map + Lateral). */
export const FOLDED_MODE_KEYS: ReadonlySet<AttackPathsMode> = new Set([])

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
      "Attacker lens −1/0/1 — system blast radius, jewel fan-in, then path investigation with cut card.",
  },
  {
    key: "attacker_map",
    label: "Attack Map",
    title:
      "Per-path Attack Map — VPC topology canvas for the selected jewel/path. Pick a crown jewel and path on the left.",
  },
  {
    key: "lateral",
    label: "Lateral Movement",
    title:
      "Where this path's identity can pivot next — sibling resources each on-path role can also reach.",
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

/** Primary (+ optional beta) chips — includes Attack Map + Lateral Movement. */
export function buildModeBarTabs(showBeta = false): ModeTabDef[] {
  return showBeta ? [...PRIMARY_TABS, ...BETA_TABS] : [...PRIMARY_TABS]
}

/**
 * Highlight the active chip. Empty FOLDED set → identity (kept for deep-link
 * compatibility if something is folded again later).
 */
export function modeBarHighlight(mode: AttackPathsMode): AttackPathsMode {
  return FOLDED_MODE_KEYS.has(mode) ? "attack-path" : mode
}
