/** Light-theme tokens — attack-path Cloud Graph redesign brief §7 */

export const CG = {
  canvas: "#FBFCFE",
  surface: "#FFFFFF",
  border: "#E4E9F0",
  ink: "#16202E",
  muted: "#5C6B7E",
  faint: "#9AA8B8",
  attack: "#D9303F",
  encrypt: "#0A9D87",
  priv: "#3fa037",
  container: {
    cloud: "rgba(58,71,87,.04)",
    region: "rgba(46,115,232,.04)",
    vpc: "rgba(63,160,55,.05)",
    az: "rgba(154,168,184,.05)",
    subnet: "rgba(46,158,91,.07)",
  },
  type: {
    compute: "#E8881C",
    network: "#7C5CFC",
    identity: "#C0468B",
    storage: "#2E9E5B",
    security: "#D9303F",
    user: "#2b3a4b",
  },
  shadow: "0 1px 2px rgba(16,24,40,.04), 0 4px 12px rgba(16,24,40,.06)",
} as const

export function typeColorForCategory(cat: string): string {
  switch (cat) {
    case "compute":
      return CG.type.compute
    case "network":
      return CG.type.network
    case "storage":
      return CG.type.storage
    case "security":
      return CG.type.security
    case "user":
      return CG.type.user
    default:
      return CG.muted
  }
}

// v3 basis palette — an edge reads by its EVIDENCE, not its hop type:
//   observed (proven in logs) = green · configured-only (allowed, unproven) = grey
//   · encryption = teal. Falls back to the model's gate-aware color when the
//   `observed` boolean isn't carried (spine edges encode basis as a hex color
//   via gateEdgeColor: OPEN_OBSERVED #c0392b, OPEN_CONFIG #b5710f).
export const BASIS = {
  observed: "#16a34a",
  config: "#9AA6B5",
  encrypt: "#0A9D87",
} as const

export function basisEdgeColor(opts: {
  style?: string
  observed?: boolean | null
  modelColor?: string
  layer?: string
}): string {
  if (opts.style === "enc") return BASIS.encrypt
  if (opts.observed === true) return BASIS.observed
  if (opts.observed === false) return BASIS.config
  if (opts.modelColor === "#c0392b") return BASIS.observed
  if (opts.modelColor === "#b5710f") return BASIS.config
  if (opts.style === "priv") return BASIS.config
  return opts.layer === "path" ? BASIS.observed : BASIS.config
}
