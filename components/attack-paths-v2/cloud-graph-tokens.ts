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
